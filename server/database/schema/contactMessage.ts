import { pgTable, text, timestamp, boolean, serial } from "drizzle-orm/pg-core";

/**
 * Contact Messages table for storing contact form submissions
 * Supports soft delete for archiving messages
 */
export const contactMessages = pgTable("contact_messages", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    language: text("language").default("it").notNull(), // it | en
    // Soft delete support
    isArchived: boolean("is_archived").default(false).notNull(),
    archivedAt: timestamp("archived_at"),
    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Type exports for use in API routes
export type ContactMessage = typeof contactMessages.$inferSelect;
export type NewContactMessage = typeof contactMessages.$inferInsert;
