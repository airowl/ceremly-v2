import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { organization } from "./auth";

/**
 * Example domain table — multi-tenant pattern reference (complete CRUD, PHASE 4).
 * Every future domain resource follows this pattern: organizationId NOT NULL + index.
 * Example fields: name (NOT NULL), description (nullable), status (enum via text + Zod).
 * Service: server/services/project.service.ts — API: server/api/projects/.
 */
export const projects = pgTable(
    "projects",
    {
        id: text("id").primaryKey().$default(() => uuidv7()),
        organizationId: text("organization_id")
            .notNull()
            .references(() => organization.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        description: text("description"),
        status: text("status").default("active").notNull(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at")
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        index("projects_organization_id_idx").on(table.organizationId),
    ],
);

export const projectsRelations = relations(projects, ({ one }) => ({
    organization: one(organization, {
        fields: [projects.organizationId],
        references: [organization.id],
    }),
}));
