/**
 * Project Service — example multi-tenant org-scoped entity (PHASE 4).
 *
 * Reproducible recipe for every future domain resource:
 *   1. organizationId ALWAYS from event.context.organization (populated by requireMember/requireWrite),
 *      NEVER from body/query.
 *   2. Repository queries scoped by-construction (WHERE organizationId).
 *   3. assertOwnership as 2nd guard on by-id lookups (null → 403, no existence leak).
 *   4. logAudit mandatory on every write.
 */
import type { H3Event, EventHandlerRequest } from "~~/server/types/h3";
import type {
    CreateProjectInput,
    UpdateProjectInput,
} from "~~/shared/schemas/project";
import {
    findProjectsByOrg,
    findProjectByIdScoped,
    createProject as createProjectRow,
    updateProjectScoped,
    deleteProjectScoped,
} from "../repositories/projectRepository";
import { assertOwnership } from "../utils/permissions";
import { logAudit } from "../utils/audit";

/** Reads the active org from context. 401 if absent (RBAC guard not executed). */
function getOrgId(event: H3Event<EventHandlerRequest>): string {
    const orgId = event.context.organization?.id;
    if (!orgId) {
        throw createError({
            statusCode: 401,
            statusMessage: "Organizzazione attiva non risolta",
        });
    }
    return orgId;
}

/** Lists the projects of the active org. */
export async function listProjects(event: H3Event<EventHandlerRequest>) {
    const organizationId = getOrgId(event);
    const projects = await findProjectsByOrg(organizationId);
    return { projects };
}

/** Single project by-id, scoped + assertOwnership (null → 403). */
export async function getProject(
    event: H3Event<EventHandlerRequest>,
    id: string,
) {
    const organizationId = getOrgId(event);
    const project = await findProjectByIdScoped(organizationId, id);
    assertOwnership(project, organizationId);
    return { project };
}

/** Creates a project in the active org + audit. */
export async function createProject(
    event: H3Event<EventHandlerRequest>,
    data: CreateProjectInput,
) {
    const organizationId = getOrgId(event);
    const project = await createProjectRow(organizationId, data);
    if (!project) {
        throw createError({ statusCode: 500, statusMessage: "Failed to create project" });
    }
    await logAudit(event, "project.created", {
        organizationId,
        targetType: "project",
        targetId: project.id,
    });
    return { project };
}

/** Updates a project of the active org (scoped) + assertOwnership + audit. */
export async function updateProject(
    event: H3Event<EventHandlerRequest>,
    id: string,
    data: UpdateProjectInput,
) {
    const organizationId = getOrgId(event);
    const existing = await findProjectByIdScoped(organizationId, id);
    assertOwnership(existing, organizationId);
    const project = await updateProjectScoped(organizationId, id, data);
    await logAudit(event, "project.updated", {
        organizationId,
        targetType: "project",
        targetId: id,
    });
    return { project };
}

/** Deletes a project of the active org (scoped) + assertOwnership + audit. */
export async function deleteProject(
    event: H3Event<EventHandlerRequest>,
    id: string,
) {
    const organizationId = getOrgId(event);
    const existing = await findProjectByIdScoped(organizationId, id);
    assertOwnership(existing, organizationId);
    await deleteProjectScoped(organizationId, id);
    await logAudit(event, "project.deleted", {
        organizationId,
        targetType: "project",
        targetId: id,
    });
    return { success: true };
}
