import { index, jsonb, pgTable, pgEnum, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { primaryId } from './columns';
import { tenants } from './tenant';

export const aiMessageRoleEnum = pgEnum('ai_message_role', ['USER', 'ASSISTANT', 'TOOL']);

export const aiConversations = pgTable(
  'ai_conversations',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id'),
    title: varchar('title', { length: 160 }).notNull().default('New conversation'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index('ai_conversations_tenant_idx').on(table.tenantId, table.createdAt)]
);

export const aiMessages = pgTable(
  'ai_messages',
  {
    id: primaryId(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => aiConversations.id, { onDelete: 'cascade' }),
    role: aiMessageRoleEnum('role').notNull(),
    content: text('content').notNull(),
    toolName: varchar('tool_name', { length: 80 }),
    toolResult: jsonb('tool_result').$type<unknown>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index('ai_messages_conversation_idx').on(table.conversationId, table.createdAt)]
);

export type AiConversationRow = typeof aiConversations.$inferSelect;
export type AiMessageRow = typeof aiMessages.$inferSelect;
