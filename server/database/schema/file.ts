import { relations, sql } from 'drizzle-orm'
import { boolean, index, integer, pgTable, text, timestamp, uuid, uniqueIndex } from 'drizzle-orm/pg-core'
import { v7 as uuidv7 } from 'uuid'
import { user, organization } from './auth'

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
  organizationId: text('organization_id').references(() => organization.id, { onDelete: 'set null' }),
  sha256: text('sha256'),
  variantOf: uuid('variant_of'),
  variantType: text('variant_type'),
  variantsGeneratedAt: timestamp('variants_generated_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
}, (table) => [
  index('file_organization_id_idx').on(table.organizationId),
  index('file_sha256_idx').on(table.sha256),
  index('file_variant_of_idx').on(table.variantOf),
  index('file_upload_status_idx').on(table.uploadStatus),
  // Unicità per dedup: (sha256, organizationId) per file org-scoped
  uniqueIndex('file_sha256_org_uidx')
    .on(table.sha256, table.organizationId)
    .where(sql`${table.organizationId} IS NOT NULL`),
  // Unicità per dedup: sha256 per file globali (organizationId IS NULL)
  uniqueIndex('file_sha256_global_uidx')
    .on(table.sha256)
    .where(sql`${table.organizationId} IS NULL`),
])

export const fileRelations = relations(file, ({ one, many }) => ({
  uploadedByUser: one(user, {
    fields: [file.uploadedBy],
    references: [user.id]
  }),
  organization: one(organization, {
    fields: [file.organizationId],
    references: [organization.id]
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
