import { relations } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { organization } from "./auth";
import { events } from "./events";

/**
 * Reminder programmati per evento (SPEC §2) — max 3 per evento (enforcement nel service).
 * daysBefore = giorni prima della rsvpDeadline; sentAt null finché non inviato
 * (idempotenza del cron giornaliero).
 */
export const eventReminders = pgTable(
    "event_reminders",
    {
        id: text("id").primaryKey().$default(() => uuidv7()),
        organizationId: text("organization_id")
            .notNull()
            .references(() => organization.id, { onDelete: "cascade" }),
        eventId: text("event_id")
            .notNull()
            .references(() => events.id, { onDelete: "cascade" }),
        daysBefore: integer("days_before").notNull(),
        subject: text("subject").notNull(),
        message: text("message").notNull(), // placeholder {nome} {link}
        enabled: boolean("enabled").default(true).notNull(),
        sentAt: timestamp("sent_at"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at")
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        index("event_reminders_organization_id_idx").on(table.organizationId),
        index("event_reminders_event_id_idx").on(table.eventId),
    ],
);

export const eventRemindersRelations = relations(eventReminders, ({ one }) => ({
    organization: one(organization, {
        fields: [eventReminders.organizationId],
        references: [organization.id],
    }),
    event: one(events, {
        fields: [eventReminders.eventId],
        references: [events.id],
    }),
}));
