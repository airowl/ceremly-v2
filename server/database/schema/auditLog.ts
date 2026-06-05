import { index, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'
import { user } from './auth'

export const auditLog = pgTable('audit_log', {
  id: serial('id').primaryKey(),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  eventId: text('event_id'),
  category: text('category').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  status: text('status').notNull().default('success'),
  details: jsonb('details'),
  createdAt: timestamp('created_at').notNull().$default(() => new Date())
}, (table) => [
  index('audit_log_user_id_idx').on(table.userId),
  index('audit_log_event_id_idx').on(table.eventId),
  index('audit_log_category_idx').on(table.category),
  index('audit_log_action_idx').on(table.action),
  index('audit_log_created_at_idx').on(table.createdAt),
])
