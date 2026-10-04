import { Elysia } from 'elysia';
import { z } from 'zod';
import { uuidSchema } from '@roms/contracts/common';
import type { AppDeps } from '../../app/deps';
import { requireTenantId } from '../../lib/context';
import { securityPlugin } from '../../plugins/security';
import { askAi, getConversation, listAiTools, listConversations } from './ai.service';

/**
 * AI module. The assistant can only call the explicit, validated tools in
 * `ai.tools.ts` — it never gets database or SQL access.
 */
export const aiModule = (deps: AppDeps) =>
  new Elysia({ prefix: '/api/v1/ai', tags: ['ai'] })
    .use(securityPlugin(deps))
    .get('/tools', () => listAiTools(), {
      requireTenant: true,
      requirePermission: 'reports.read'
    })
    .post(
      '/query',
      async ({ ctx, body }) =>
        askAi(deps, ctx, {
          message: body.message,
          ...(body.conversationId ? { conversationId: body.conversationId } : {})
        }),
      {
        requireTenant: true,
        requirePermission: 'reports.read',
        rateLimit: { max: 30, windowSeconds: 60 },
        body: z.object({
          message: z.string().trim().min(1).max(1000),
          conversationId: uuidSchema.optional()
        })
      }
    )
    .get('/conversations', async ({ ctx }) => listConversations(deps, requireTenantId(ctx)), {
      requireTenant: true,
      requirePermission: 'reports.read'
    })
    .get(
      '/conversations/:id',
      async ({ ctx, params }) => getConversation(deps, requireTenantId(ctx), params.id),
      {
        requireTenant: true,
        requirePermission: 'reports.read'
      }
    );
