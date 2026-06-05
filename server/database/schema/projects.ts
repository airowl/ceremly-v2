import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { organization } from "./auth";

/**
 * Example domain table — multi-tenant pattern reference.
 * Ogni risorsa di dominio futura si modella così: organizationId NOT NULL + indice.
 * CRUD completo (service + API + pagina) → FASE 4. Qui solo lo schema per testare l'isolamento.
 */
export const projects = pgTable(
    "projects",
    {
        id: text("id").primaryKey().$default(() => uuidv7()),
        organizationId: text("organization_id")
            .notNull()
            .references(() => organization.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
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
