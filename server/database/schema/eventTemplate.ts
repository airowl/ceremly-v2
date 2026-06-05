import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { user } from "./auth";

/**
 * Event templates for landing pages.
 * System templates (userId=NULL, isSystem=true) are global catalog entries.
 * User templates are personal and tied to a specific user.
 */
export const eventTemplates = pgTable(
  "event_templates",
  {
    id: text("id").primaryKey().$default(() => uuidv7()),
    /** NULL for system templates, user ID for custom templates */
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category").notNull(),
    /** Same LandingPageData JSONB structure as landing_pages */
    data: jsonb("data").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    isSystem: boolean("is_system").default(false).notNull(),
    isAiGenerated: boolean("is_ai_generated").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("event_templates_user_id_idx").on(table.userId),
    index("event_templates_category_idx").on(table.category),
    index("event_templates_is_system_idx").on(table.isSystem),
  ],
);

export const eventTemplatesRelations = relations(eventTemplates, ({ one }) => ({
  creator: one(user, {
    fields: [eventTemplates.userId],
    references: [user.id],
  }),
}));
