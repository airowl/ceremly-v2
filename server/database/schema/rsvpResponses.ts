import { relations } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import type { RsvpAnswers } from "~~/shared/types/ceremly";
import { organization } from "./auth";
import { events } from "./events";
import { guests } from "./guests";

/**
 * Risposte RSVP (SPEC §2) — una sola risposta per ospite (guestId UNIQUE, upsert):
 * la riga rappresenta sempre l'ultima versione. answers è jsonb tipizzato
 * RsvpAnswers (SPEC §3.3), chiave = question.id.
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
        declineMessage: text("decline_message"), // messaggio opzionale se `no`
        submittedAt: timestamp("submitted_at").defaultNow().notNull(), // prima compilazione
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
