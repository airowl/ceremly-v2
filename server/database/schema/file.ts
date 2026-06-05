import { relations } from 'drizzle-orm'
import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { v7 as uuidv7 } from 'uuid'
import { user } from './auth'
import { events } from './event'

export const file = pgTable('file', {
  id: uuid('id').primaryKey().$default(() => uuidv7()),
  originalName: text('original_name').notNull(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  fileType: text('file_type').notNull(),
  size: integer('size').notNull(),
  path: text('path').notNull(),
  url: text('url'),
  storageProvider: text('storage_provider').notNull().default('r2'),
  uploadedBy: uuid('uploaded_by'),
  isActive: boolean('is_active').default(true).notNull(),
  uploadStatus: text('upload_status').default('active').notNull(),
  presignExpiresAt: timestamp('presign_expires_at'),
  isPublic: boolean('is_public').default(true).notNull(),
  eventId: text('event_id').references(() => events.id, { onDelete: 'set null' }),
  sha256: text('sha256'),
  variantOf: uuid('variant_of'),
  variantType: text('variant_type'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
}, (table) => [
  index('file_event_id_idx').on(table.eventId),
  index('file_sha256_idx').on(table.sha256),
  index('file_variant_of_idx').on(table.variantOf),
  index('file_upload_status_idx').on(table.uploadStatus),
])

export const fileRelations = relations(file, ({ one, many }) => ({
  uploadedByUser: one(user, {
    fields: [file.uploadedBy],
    references: [user.id]
  }),
  event: one(events, {
    fields: [file.eventId],
    references: [events.id]
  }),
  parentFile: one(file, {
    fields: [file.variantOf],
    references: [file.id],
    relationName: 'fileVariants'
  }),
  variants: many(file, {
    relationName: 'fileVariants'
  })
}))
