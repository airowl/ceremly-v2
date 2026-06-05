import { relations } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { events } from "./event";

/**
 * Landing pages for RSVP (1:1 with event)
 * Stores LandingPageData as JSONB (settings + sections)
 */
export const landingPages = pgTable(
  "landing_pages",
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
    uniqueIndex("landing_pages_event_id_unique").on(table.eventId),
  ],
);

export const landingPagesRelations = relations(landingPages, ({ one }) => ({
  event: one(events, {
    fields: [landingPages.eventId],
    references: [events.id],
  }),
}));
