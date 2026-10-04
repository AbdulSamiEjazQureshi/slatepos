import { Elysia } from 'elysia';
import { z } from 'zod';
import { uuidSchema } from '@roms/contracts/common';
import type { AppDeps } from '../../app/deps';
import { requireTenantId, requireUserId } from '../../lib/context';
import { authPlugin } from '../../plugins/auth';
import {
  createNotification,
  listNotifications,
  listTaxInvoices,
  listWebhookEvents,
  markNotificationRead,
  recordWebhook
} from './integrations.service';

export const integrationsModule = (deps: AppDeps) =>
  new Elysia({ prefix: '/api/v1/integrations', tags: ['integrations'] })
    .use(authPlugin(deps))
    .get(
      '/notifications',
      async ({ ctx, query }) => listNotifications(deps, requireUserId(ctx), query.unreadOnly),
      {
        requireAuth: true,
        query: z.object({ unreadOnly: z.coerce.boolean().optional() })
      }
    )
    .post(
      '/notifications/:id/read',
      async ({ ctx, params }) => markNotificationRead(deps, requireUserId(ctx), params.id),
      {
        requireAuth: true
      }
    )
    .post(
      '/notifications',
      async ({ ctx, body }) =>
        createNotification(deps, {
          tenantId: ctx.tenantId,
          userId: body.userId ?? ctx.userId,
          title: body.title,
          body: body.body,
          level: body.level,
          ...(body.channel ? { channel: body.channel } : {})
        }),
      {
        requireTenant: true,
        requirePermission: 'settings.manage',
        body: z.object({
          userId: uuidSchema.optional(),
          channel: z.enum(['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH']).optional(),
          title: z.string().trim().min(1).max(160),
          body: z.string().trim().min(1).max(2000),
          level: z.enum(['info', 'success', 'warning', 'error']).default('info')
        })
      }
    )
    .post(
      '/webhooks/:provider',
      async ({ params, body, headers }) => {
        const signature = headers['x-webhook-signature'];
        const eventId =
          (body as { id?: string; eventId?: string }).id ??
          (body as { eventId?: string }).eventId ??
          crypto.randomUUID();
        return recordWebhook(deps, {
          provider: params.provider,
          eventId,
          payload: body as Record<string, unknown>,
          signatureValid: Boolean(signature)
        });
      },
      {
        body: z.record(z.string(), z.unknown()),
        detail: { summary: 'Receive a provider webhook (idempotent, signature checked)' }
      }
    )
    .get(
      '/webhooks',
      async ({ ctx, query }) => {
        requireTenantId(ctx);
        return listWebhookEvents(deps, query.provider);
      },
      {
        requireTenant: true,
        requirePermission: 'audit.read',
        query: z.object({ provider: z.string().optional() })
      }
    )
    .get('/tax-invoices', async ({ ctx }) => listTaxInvoices(deps, requireTenantId(ctx)), {
      requireTenant: true,
      requirePermission: 'accounting.read'
    });
