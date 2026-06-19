import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

// GLOBALE (account-level), non org-scoped: un hard bounce/complaint è oggettivo.
// L'indice su `email` è implicito: il vincolo UNIQUE crea già un B-tree in Postgres.
export const emailSuppressions = pgTable("email_suppressions", {
    id: text("id").primaryKey().$default(() => uuidv7()),
    email: text("email").notNull().unique(),
    reason: text("reason").notNull(), // 'hard_bounce' | 'complaint' | 'manual'
    bounceSubtype: text("bounce_subtype"),
    source: text("source").notNull().default("resend_webhook"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});
