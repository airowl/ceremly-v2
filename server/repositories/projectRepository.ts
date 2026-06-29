import { and, eq } from "drizzle-orm";
import { getDB } from "../utils/db";
import * as schema from "../database/schema";
import type { CreateProjectInput, UpdateProjectInput } from "~~/shared/schemas/project";

/** Lists projects for an org (scoped by-construction). */
export async function findProjectsByOrg(organizationId: string) {
    const db = getDB();
    return db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.organizationId, organizationId));
}

/** Single scoped project fetch: undefined if it belongs to another org (no leak). */
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

/** Creates a project in the given org. */
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

/** Scoped update: updates only if the project belongs to the org. Undefined otherwise. */
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
    // No fields to update: idempotent no-op. Avoids `.set({})` which throws
    // "No values to set" (drizzle) → 500. Returns the current row (scoped).
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

/** Scoped delete: deletes only if the project belongs to the org. Undefined otherwise. */
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
