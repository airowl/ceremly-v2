import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { events } from "./event";

export type GuestStatusDB = "pending" | "yes" | "no";
export type GuestSourceDB = "manual" | "csv" | "registration";

export const guests = pgTable(
  "guests",
  {
    id: text("id").primaryKey().$default(() => uuidv7()),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    group: text("group"),
    status: text("status").$type<GuestStatusDB>().default("pending").notNull(),
    source: text("source").$type<GuestSourceDB>().default("manual").notNull(),
    customFields: jsonb("custom_fields"),
    respondedAt: timestamp("responded_at"),
    lastEmailSentAt: timestamp("last_email_sent_at"),
    emailSentCount: integer("email_sent_count").default(0).notNull(),
    lastWhatsappClickedAt: timestamp("last_whatsapp_clicked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("guests_event_id_idx").on(table.eventId),
    index("guests_status_idx").on(table.status),
    index("guests_source_idx").on(table.source),
    index("guests_email_idx").on(table.email),
    index("guests_group_idx").on(table.group),
  ],
);

export const guestsRelations = relations(guests, ({ one }) => ({
  event: one(events, {
    fields: [guests.eventId],
    references: [events.id],
  }),
}));
