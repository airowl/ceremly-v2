import { relations, sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { organization } from "./auth";
import { events } from "./events";

/**
 * Scheduled reminders for an event (SPEC §2) — max 3 per event (enforced in the service).
 * daysBefore = days before rsvpDeadline; sentAt null until sent
 * (idempotency of the daily cron).
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
        // Hot path for the daily cron findDueReminders: finds reminders
        // that are enabled and not yet sent. PARTIAL index → no seq scan
        // cross-org. Indexes eventId to join with events.
        index("event_reminders_due_idx")
            .on(table.eventId)
            .where(sql`${table.enabled} = true AND ${table.sentAt} IS NULL`),
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
