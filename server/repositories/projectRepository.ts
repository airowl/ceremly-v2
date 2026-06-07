import { and, eq } from "drizzle-orm";
import { getDB } from "../utils/db";
import * as schema from "../database/schema";
import type { CreateProjectInput, UpdateProjectInput } from "~~/shared/schemas/project";

/** Lista projects di un'org (scoped by-construction). */
export async function findProjectsByOrg(organizationId: string) {
    const db = getDB();
    return db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.organizationId, organizationId));
}

/** Fetch singolo project scoped: undefined se di un'altra org (no leak). */
export async function findProjectByIdScoped(organizationId: string, id: string) {
    const db = getDB();
    const rows = await db
        .select()
        .from(schema.projects)
        .where(
            and(
                eq(schema.projects.id, id),
                eq(schema.projects.organizationId, organizationId),
            ),
        )
        .limit(1);
    return rows[0];
}

/** Crea un project nell'org indicata. */
export async function createProject(
    organizationId: string,
    data: CreateProjectInput,
) {
    const db = getDB();
    const rows = await db
        .insert(schema.projects)
        .values({
            organizationId,
            name: data.name,
            description: data.description ?? null,
            status: data.status ?? "active",
        })
        .returning();
    return rows[0];
}

/** Update scoped: aggiorna solo se il project appartiene all'org. Undefined altrimenti. */
export async function updateProjectScoped(
    organizationId: string,
    id: string,
    data: UpdateProjectInput,
) {
    const db = getDB();
    const patch: Partial<typeof schema.projects.$inferInsert> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description ?? null;
    if (data.status !== undefined) patch.status = data.status;
    // Nessun campo da aggiornare: no-op idempotente. Evita `.set({})` che lancia
    // "No values to set" (drizzle) → 500. Ritorna la riga corrente (scoped).
    if (Object.keys(patch).length === 0) {
        return findProjectByIdScoped(organizationId, id);
    }
    const rows = await db
        .update(schema.projects)
        .set(patch)
        .where(
            and(
                eq(schema.projects.id, id),
                eq(schema.projects.organizationId, organizationId),
            ),
        )
        .returning();
    return rows[0];
}

/** Delete scoped: elimina solo se il project appartiene all'org. Undefined altrimenti. */
export async function deleteProjectScoped(organizationId: string, id: string) {
    const db = getDB();
    const rows = await db
        .delete(schema.projects)
        .where(
            and(
                eq(schema.projects.id, id),
                eq(schema.projects.organizationId, organizationId),
            ),
        )
        .returning();
    return rows[0];
}
