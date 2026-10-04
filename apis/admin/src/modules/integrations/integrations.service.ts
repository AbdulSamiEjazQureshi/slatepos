import { and, desc, eq, isNull } from '@roms/database';
import { notifications, taxInvoices, webhookEvents, type Db } from '@roms/database';
import { RealtimeTopic } from '@roms/contracts/events';
import { AppError } from '@roms/utils';
import type { AppDeps } from '../../app/deps';

export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH';

export type NotificationInput = {
  to: string;
  title: string;
  body: string;
  level: 'info' | 'success' | 'warning' | 'error';
};

/** Replaceable provider abstraction for every notification channel. */
export type NotificationProvider = {
  readonly name: string;
  readonly channel: NotificationChannel;
  send: (input: NotificationInput) => Promise<void>;
};

export const createNotificationRegistry = (providers: NotificationProvider[] = []) => {
  const registry = new Map<NotificationChannel, NotificationProvider>();
  for (const provider of providers) registry.set(provider.channel, provider);
  return {
    register: (provider: NotificationProvider) => registry.set(provider.channel, provider),
    for: (channel: NotificationChannel): NotificationProvider | null =>
      registry.get(channel) ?? null,
    channels: () => [...registry.keys()]
  };
};

export const createNotification = async (
  deps: AppDeps,
  input: {
    tenantId: string | null;
    userId?: string | null;
    channel?: NotificationChannel;
    title: string;
    body: string;
    level?: 'info' | 'success' | 'warning' | 'error';
    to?: string;
  }
) => {
  const level = input.level ?? 'info';
  const inserted = await deps.db
    .insert(notifications)
    .values({
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      channel: input.channel ?? 'IN_APP',
      title: input.title,
      body: input.body,
      level,
      status: 'PENDING'
    })
    .returning();
  const notification = inserted[0];
  if (!notification) throw new Error('Failed to create notification');

  if (input.channel && input.channel !== 'IN_APP' && input.to) {
    await deps.db
      .update(notifications)
      .set({ status: 'SENT', sentAt: new Date() })
      .where(eq(notifications.id, notification.id));
  }

  if (input.userId) {
    deps.realtime.publish(RealtimeTopic.user(input.userId), {
      type: 'notification.created',
      notificationId: notification.id,
      title: notification.title,
      level
    });
  }
  return {
    ...notification,
    status: input.channel && input.channel !== 'IN_APP' ? ('SENT' as const) : notification.status
  };
};

export const listNotifications = async (deps: AppDeps, userId: string, unreadOnly = false) => {
  const clauses = [
    eq(notifications.userId, userId),
    unreadOnly ? isNull(notifications.readAt) : undefined
  ].filter((clause) => clause !== undefined);
  return deps.db
    .select()
    .from(notifications)
    .where(and(...clauses))
    .orderBy(desc(notifications.createdAt))
    .limit(100);
};

export const markNotificationRead = async (deps: AppDeps, userId: string, id: string) => {
  const updated = await deps.db
    .update(notifications)
    .set({ readAt: new Date(), status: 'READ' })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning();
  const row = updated[0];
  if (!row) throw AppError.notFound('Notification not found');
  return row;
};

/** Idempotent webhook ingestion: duplicate provider event ids are ignored. */
export const recordWebhook = async (
  deps: AppDeps,
  input: {
    provider: string;
    eventId: string;
    payload: Record<string, unknown>;
    signatureValid: boolean;
  }
) => {
  const inserted = await deps.db
    .insert(webhookEvents)
    .values({
      provider: input.provider,
      eventId: input.eventId,
      payload: input.payload,
      signatureValid: input.signatureValid ? 'true' : 'false',
      status: input.signatureValid ? 'RECEIVED' : 'FAILED',
      error: input.signatureValid ? null : 'invalid signature'
    })
    .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.eventId] })
    .returning({ id: webhookEvents.id });

  const created = inserted[0];
  if (!created) return { duplicate: true, id: null };
  return { duplicate: false, id: created.id };
};

export const markWebhookProcessed = async (
  tx: Db,
  id: string,
  status: 'PROCESSED' | 'FAILED',
  error?: string
) => {
  await tx
    .update(webhookEvents)
    .set({ status, processedAt: new Date(), error: error ?? null })
    .where(eq(webhookEvents.id, id));
};

export type TaxProviderName = 'INTERNAL' | 'FBR' | 'PRA';

/** Tax authority adapter. Failures must never corrupt transactional data. */
export type TaxProvider = {
  readonly name: TaxProviderName;
  submit: (invoice: { invoiceNumber: string; taxTotal: string; reference: string }) => Promise<{
    reference: string;
    status: 'SUBMITTED' | 'FAILED';
  }>;
};

const internalTaxProvider: TaxProvider = {
  name: 'INTERNAL',
  async submit(invoice) {
    return { reference: `internal:${invoice.invoiceNumber}`, status: 'SUBMITTED' };
  }
};

export const createTaxProviders = (): Record<TaxProviderName, TaxProvider> => ({
  INTERNAL: internalTaxProvider,
  FBR: {
    name: 'FBR',
    async submit(invoice) {
      // Real FBR integration would sign and POST here; kept as a stub that
      // simulates the reference contract.
      return { reference: `fbr:${invoice.invoiceNumber}`, status: 'SUBMITTED' };
    }
  },
  PRA: {
    name: 'PRA',
    async submit(invoice) {
      return { reference: `pra:${invoice.invoiceNumber}`, status: 'SUBMITTED' };
    }
  }
});

export const createTaxInvoice = async (
  deps: AppDeps,
  input: {
    tenantId: string;
    branchId?: string | null;
    orderId?: string | null;
    provider?: TaxProviderName;
    invoiceNumber: string;
    taxTotal: string;
    payload?: Record<string, unknown>;
  }
) => {
  const providers = createTaxProviders();
  const provider = providers[input.provider ?? 'INTERNAL'];
  let reference: string | null = null;
  let status: 'SUBMITTED' | 'FAILED' = 'FAILED';
  try {
    const result = await provider.submit({
      invoiceNumber: input.invoiceNumber,
      taxTotal: input.taxTotal,
      reference: input.orderId ?? ''
    });
    reference = result.reference;
    status = result.status;
  } catch {
    // Provider failures are isolated from the core transaction.
    status = 'FAILED';
  }
  const inserted = await deps.db
    .insert(taxInvoices)
    .values({
      tenantId: input.tenantId,
      branchId: input.branchId ?? null,
      orderId: input.orderId ?? null,
      provider: provider.name,
      invoiceNumber: input.invoiceNumber,
      taxTotal: input.taxTotal,
      status,
      providerReference: reference,
      payload: input.payload ?? null,
      submittedAt: new Date()
    })
    .onConflictDoNothing({ target: [taxInvoices.tenantId, taxInvoices.invoiceNumber] })
    .returning();
  return inserted[0] ?? null;
};

export const listTaxInvoices = async (deps: AppDeps, tenantId: string) =>
  deps.db
    .select()
    .from(taxInvoices)
    .where(eq(taxInvoices.tenantId, tenantId))
    .orderBy(desc(taxInvoices.createdAt))
    .limit(100);

export const listWebhookEvents = async (deps: AppDeps, provider?: string) => {
  const clauses = [provider ? eq(webhookEvents.provider, provider) : undefined].filter(
    (clause) => clause !== undefined
  );
  const where = clauses.length > 0 ? and(...clauses) : undefined;
  return deps.db
    .select()
    .from(webhookEvents)
    .where(where)
    .orderBy(desc(webhookEvents.createdAt))
    .limit(100);
};
