import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { organization } from "./auth";
import { events } from "./events";
import { guests } from "./guests";

/**
 * Timeline attività ospite (SPEC §2) — traccia le azioni dell'ospite senza account
 * (le scritture organizzatore vanno invece in audit_log). Append-only: solo createdAt.
 */
export const guestActivities = pgTable(
    "guest_activities",
    {
        id: text("id").primaryKey().$default(() => uuidv7()),
        organizationId: text("organization_id")
            .notNull()
            .references(() => organization.id, { onDelete: "cascade" }),
        eventId: text("event_id")
            .notNull()
            .references(() => events.id, { onDelete: "cascade" }),
        guestId: text("guest_id")
            .notNull()
            .references(() => guests.id, { onDelete: "cascade" }),
        // invite_sent | link_opened | email_opened | rsvp_submitted | rsvp_updated | reminder_sent
        type: text("type").notNull(),
        meta: jsonb("meta").$type<Record<string, unknown>>().default({}), // es. { channel: 'email' }, { reminderId }
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (table) => [
        index("guest_activities_organization_id_idx").on(table.organizationId),
        index("guest_activities_event_id_idx").on(table.eventId),
        index("guest_activities_guest_id_idx").on(table.guestId),
    ],
);

export const guestActivitiesRelations = relations(guestActivities, ({ one }) => ({
    organization: one(organization, {
        fields: [guestActivities.organizationId],
        references: [organization.id],
    }),
    event: one(events, {
        fields: [guestActivities.eventId],
        references: [events.id],
    }),
    guest: one(guests, {
        fields: [guestActivities.guestId],
        references: [guests.id],
    }),
}));
