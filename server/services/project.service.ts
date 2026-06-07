/**
 * Project Service — entità-esempio multi-tenant org-scoped (FASE 4).
 *
 * RICETTA riproducibile per ogni risorsa di dominio futura:
 *   1. organizationId SEMPRE da event.context.organization (popolata da requireMember/requireWrite),
 *      MAI da body/query.
 *   2. Query repository scoped by-construction (WHERE organizationId).
 *   3. assertOwnership come 2° guard sui by-id (null → 403, no leak esistenza).
 *   4. logAudit obbligatorio su ogni scrittura.
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

/** Legge l'org attiva dal context. 401 se assente (guard RBAC non eseguito). */
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

/** Lista i projects dell'org attiva. */
export async function listProjects(event: H3Event<EventHandlerRequest>) {
    const organizationId = getOrgId(event);
    const projects = await findProjectsByOrg(organizationId);
    return { projects };
}

/** Singolo project by-id, scoped + assertOwnership (null → 403). */
export async function getProject(
    event: H3Event<EventHandlerRequest>,
    id: string,
) {
    const organizationId = getOrgId(event);
    const project = await findProjectByIdScoped(organizationId, id);
    assertOwnership(project, organizationId);
    return { project };
}

/** Crea un project nell'org attiva + audit. */
export async function createProject(
    event: H3Event<EventHandlerRequest>,
    data: CreateProjectInput,
) {
    const organizationId = getOrgId(event);
    const project = await createProjectRow(organizationId, data);
    await logAudit(event, "project.created", {
        organizationId,
        targetType: "project",
        targetId: project.id,
    });
    return { project };
}

/** Aggiorna un project dell'org attiva (scoped) + assertOwnership + audit. */
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

/** Elimina un project dell'org attiva (scoped) + assertOwnership + audit. */
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
