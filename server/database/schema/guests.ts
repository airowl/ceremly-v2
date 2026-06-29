import { relations, sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { organization } from "./auth";
import { events } from "./events";

/**
 * Event guests (SPEC §2) — the guest has NO account: accessed via opaque token.
 * token UNIQUE (10 char base62, stable forever); removedAt = soft-delete
 * (link inactive, response preserved — PRD edge case).
 */
export const guests = pgTable(
    "guests",
    {
        id: text("id").primaryKey().$default(() => uuidv7()),
        organizationId: text("organization_id")
            .notNull()
            .references(() => organization.id, { onDelete: "cascade" }),
        eventId: text("event_id")
            .notNull()
            .references(() => events.id, { onDelete: "cascade" }),
        firstName: text("first_name").notNull(),
        lastName: text("last_name").notNull(),
        email: text("email"),
        phone: text("phone"),
        groupName: text("group_name"), // e.g. "Famiglia"
        notes: text("notes"), // visible to the organizer only
        token: text("token").notNull(),
        sentAt: timestamp("sent_at"), // first send
        sentChannel: text("sent_channel"), // email | whatsapp
        emailOpenedAt: timestamp("email_opened_at"), // pixel
        firstOpenedAt: timestamp("first_opened_at"), // first link access
        openCount: integer("open_count").default(0).notNull(),
        remindersDisabled: boolean("reminders_disabled").default(false).notNull(),
        removedAt: timestamp("removed_at"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at")
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        index("guests_organization_id_idx").on(table.organizationId),
        index("guests_event_id_idx").on(table.eventId),
        uniqueIndex("guests_token_idx").on(table.token),
        // #22: only one ACTIVE guest per (event, email). Partial: ignores null
        // emails (guests without email) and soft-deleted (removedAt), so a
        // re-import or double-add with the same email is rejected (23505)
        // instead of creating duplicates → duplicate invites/reminders and inflated count.
        uniqueIndex("guests_event_email_unique_idx")
            .on(table.eventId, sql`lower(${table.email})`)
            .where(sql`${table.email} IS NOT NULL AND ${table.removedAt} IS NULL`),
    ],
);

export const guestsRelations = relations(guests, ({ one }) => ({
    organization: one(organization, {
        fields: [guests.organizationId],
        references: [organization.id],
    }),
    event: one(events, {
        fields: [guests.eventId],
        references: [events.id],
    }),
}));
