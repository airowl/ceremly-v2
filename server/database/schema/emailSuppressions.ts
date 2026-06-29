import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

// GLOBAL (account-level), not org-scoped: a hard bounce/complaint is objective.
// The index on `email` is implicit: the UNIQUE constraint already creates a B-tree in Postgres.
export const emailSuppressions = pgTable("email_suppressions", {
    id: text("id").primaryKey().$default(() => uuidv7()),
    email: text("email").notNull().unique(),
    reason: text("reason").notNull(), // 'hard_bounce' | 'complaint' | 'manual'
    bounceSubtype: text("bounce_subtype"),
    source: text("source").notNull().default("resend_webhook"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});
