import { and, asc, desc, eq } from '@roms/database';
import { aiConversations, aiMessages } from '@roms/database';
import { AppError } from '@roms/utils';
import type { AppDeps } from '../../app/deps';
import type { RequestContext } from '../../lib/context';
import { aiTools, findTool, toolsManifest } from './ai.tools';

export type AiPlan = { tool: string; args: Record<string, unknown>; reply: string };

/**
 * Provider abstraction. A real LLM provider would implement `plan`; the default
 * heuristic provider keeps the module usable without an external API key. Either
 * way the model can only select a validated, authorized tool.
 */
export type AiProvider = {
  readonly name: string;
  plan: (message: string) => Promise<AiPlan>;
};

const HEURISTIC_RULES: { match: RegExp; tool: string; reply: string }[] = [
  {
    match: /\b(low|stock|inventory|reorder)\b/i,
    tool: 'get_low_stock_items',
    reply: 'Here are the items at or below their reorder point.'
  },
  {
    match: /\b(customer|clients?)\b/i,
    tool: 'get_customer_summary',
    reply: 'Here is a summary of your customers.'
  },
  {
    match: /\b(purchase|supplier|payable|procurement)\b/i,
    tool: 'get_purchase_summary',
    reply: 'Here is a summary of purchasing activity.'
  },
  {
    match: /\b(daily|per day|by day|trend)\b/i,
    tool: 'get_daily_revenue',
    reply: 'Here is revenue by business day.'
  },
  {
    match: /\b(best|top).*(product|seller|selling)|\bproduct sales\b/i,
    tool: 'get_product_sales',
    reply: 'Here are your best selling products.'
  },
  {
    match: /\b(sales|revenue|summary|how much|profit)\b/i,
    tool: 'get_sales_summary',
    reply: 'Here is your sales summary.'
  }
];

export const heuristicAiProvider: AiProvider = {
  name: 'heuristic',
  async plan(message: string): Promise<AiPlan> {
    for (const rule of HEURISTIC_RULES) {
      if (rule.match.test(message)) return { tool: rule.tool, args: {}, reply: rule.reply };
    }
    return { tool: 'get_sales_summary', args: {}, reply: 'Here is your sales summary.' };
  }
};

export const listAiTools = () => toolsManifest();

export const askAi = async (
  deps: AppDeps,
  ctx: RequestContext,
  input: { conversationId?: string; message: string; provider?: AiProvider }
) => {
  const tenantId = ctx.tenantId;
  if (!tenantId) throw AppError.unprocessable('tenant_required', 'A tenant context is required');

  const provider = input.provider ?? heuristicAiProvider;
  const plan = await provider.plan(input.message);
  const tool = findTool(plan.tool);
  if (!tool) throw AppError.unprocessable('unprocessable', `Unknown tool ${plan.tool}`);

  const result = await tool.run(deps, tenantId, plan.args);

  // Persist the conversation.
  let conversationId = input.conversationId;
  if (conversationId) {
    const existing = await deps.db
      .select({ id: aiConversations.id })
      .from(aiConversations)
      .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.tenantId, tenantId)))
      .limit(1);
    if (existing.length === 0) conversationId = undefined;
  }
  if (!conversationId) {
    const created = await deps.db
      .insert(aiConversations)
      .values({ tenantId, userId: ctx.userId, title: input.message.slice(0, 80) })
      .returning({ id: aiConversations.id });
    conversationId = created[0]?.id;
    if (!conversationId) throw new Error('Failed to create conversation');
  }

  await deps.db.insert(aiMessages).values([
    { conversationId, role: 'USER', content: input.message },
    {
      conversationId,
      role: 'TOOL',
      content: `Called ${tool.name}`,
      toolName: tool.name,
      toolResult: result
    },
    { conversationId, role: 'ASSISTANT', content: plan.reply }
  ]);

  return { conversationId, answer: plan.reply, tool: { name: tool.name, result } };
};

export const listConversations = async (deps: AppDeps, tenantId: string) =>
  deps.db
    .select()
    .from(aiConversations)
    .where(eq(aiConversations.tenantId, tenantId))
    .orderBy(desc(aiConversations.createdAt))
    .limit(50);

export const getConversation = async (deps: AppDeps, tenantId: string, id: string) => {
  const rows = await deps.db
    .select()
    .from(aiConversations)
    .where(and(eq(aiConversations.id, id), eq(aiConversations.tenantId, tenantId)))
    .limit(1);
  const conversation = rows[0];
  if (!conversation) throw AppError.notFound('Conversation not found');
  const messages = await deps.db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, id))
    .orderBy(asc(aiMessages.createdAt));
  return { ...conversation, messages };
};

export { aiTools };
