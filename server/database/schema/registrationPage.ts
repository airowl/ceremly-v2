import { relations } from "drizzle-orm";
import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { events } from "./event";

/**
 * Registration pages (1:1 with event)
 * Stores LandingPageData as JSONB (settings + sections)
 * Used for public registration landing page (/event/[slug])
 */
export const registrationPages = pgTable(
  "registration_pages",
  {
    id: text("id").primaryKey().$default(() => uuidv7()),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("registration_pages_event_id_unique").on(table.eventId),
  ],
);

export const registrationPagesRelations = relations(registrationPages, ({ one }) => ({
  event: one(events, {
    fields: [registrationPages.eventId],
    references: [events.id],
  }),
}));
