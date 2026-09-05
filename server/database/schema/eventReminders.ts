import { relations, sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { organization } from "./auth";
import { events } from "./events";

/**
 * Reminder programmati per evento (SPEC §2) — max 3 per evento (enforcement nel service).
 * daysBefore = giorni prima della rsvpDeadline; sentAt null finché non inviato
 * (idempotenza del cron giornaliero).
 * processingAt: lease atomico per evitare doppia esecuzione del cron.
 *   - cron imposta processingAt = now() quando inizia a processare
 *   - se processingAt è settato e < 5min fa → un altro cron sta processando, skip
 *   - se processingAt è settato e > 5min fa → lease scaduto, il cron può prendere in carico
 *   - su successo → sentAt = now(), processingAt = null
 *   - su fallimento → processingAt = null (per permettere retry)
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
        processingAt: timestamp("processing_at"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at")
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        index("event_reminders_organization_id_idx").on(table.organizationId),
        index("event_reminders_event_id_idx").on(table.eventId),
        // Unicità per event+daysBefore tra i reminder non inviati.
        // Prevenzione duplicati in bulk upsert concorrenti.
        uniqueIndex("event_reminders_event_daysbefore_uidx")
            .on(table.eventId, table.daysBefore)
            .where(sql`${table.sentAt} IS NULL`),
        // Hot-path del cron giornaliero findDueReminders: trova i reminder
        // abilitati e non ancora inviati. Indice PARZIALE → niente seq scan
        // cross-org. Indicizza eventId per agganciare il join con events.
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
