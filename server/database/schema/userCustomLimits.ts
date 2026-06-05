import { relations } from "drizzle-orm";
import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Custom limits override per user
 * Allows admins to set individual limits that override plan defaults
 * null = use plan limit, value = custom override
 */
export const userCustomLimits = pgTable("user_custom_limits", {
    id: text("id").primaryKey(),
    userId: text("user_id")
        .notNull()
        .unique()
        .references(() => user.id, { onDelete: "cascade" }),

    // Override limits (null = use plan default)
    maxEvents: integer("max_events"),
    storageMb: integer("storage_mb"),
    teamMembers: integer("team_members"),

    // Admin note for tracking the reason
    note: text("note"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
        .defaultNow()
        .$onUpdate(() => new Date())
        .notNull(),
});

export const userCustomLimitsRelations = relations(userCustomLimits, ({ one }) => ({
    user: one(user, {
        fields: [userCustomLimits.userId],
        references: [user.id],
    }),
}));
