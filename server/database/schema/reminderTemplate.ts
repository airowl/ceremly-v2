import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { events } from "./event";

export type ReminderTypeDB = "email" | "whatsapp";

export const reminderTemplates = pgTable(
  "reminder_templates",
  {
    id: text("id").primaryKey().$default(() => uuidv7()),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").$type<ReminderTypeDB>().notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("reminder_templates_event_id_idx").on(table.eventId),
    index("reminder_templates_type_idx").on(table.type),
  ],
);

export const reminderTemplatesRelations = relations(reminderTemplates, ({ one }) => ({
  event: one(events, {
    fields: [reminderTemplates.eventId],
    references: [events.id],
  }),
}));
