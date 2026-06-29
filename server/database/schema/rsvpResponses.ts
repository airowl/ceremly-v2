import { relations } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import type { RsvpAnswers } from "~~/shared/types/ceremly";
import { organization } from "./auth";
import { events } from "./events";
import { guests } from "./guests";

/**
 * RSVP responses (SPEC §2) — one response per guest (guestId UNIQUE, upsert):
 * the row always represents the latest version. answers is typed jsonb
 * RsvpAnswers (SPEC §3.3), keyed by question.id.
 */
export const rsvpResponses = pgTable(
    "rsvp_responses",
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
            .unique()
            .references(() => guests.id, { onDelete: "cascade" }),
        attending: text("attending").notNull(), // yes | no | maybe
        companionsCount: integer("companions_count").default(0).notNull(),
        answers: jsonb("answers").$type<RsvpAnswers>().default({}).notNull(),
        declineMessage: text("decline_message"), // optional message when `no`
        submittedAt: timestamp("submitted_at").defaultNow().notNull(), // first submission
        updatedAt: timestamp("updated_at")
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        index("rsvp_responses_organization_id_idx").on(table.organizationId),
        index("rsvp_responses_event_id_idx").on(table.eventId),
    ],
);

export const rsvpResponsesRelations = relations(rsvpResponses, ({ one }) => ({
    organization: one(organization, {
        fields: [rsvpResponses.organizationId],
        references: [organization.id],
    }),
    event: one(events, {
        fields: [rsvpResponses.eventId],
        references: [events.id],
    }),
    guest: one(guests, {
        fields: [rsvpResponses.guestId],
        references: [guests.id],
    }),
}));
