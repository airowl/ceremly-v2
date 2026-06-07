/**
 * GET /api/organizations/:id/members
 * Lista membri + inviti pending dell'org (path-id).
 * Risolve il vecchio /api/team/*: membership sotto /api/organizations/[id]/members.
 * Authz: il caller deve essere membro DI QUELL'org (getOrgRole != null).
 */
import { getOrgRole } from "~~/server/utils/permissions";
import { listOrganizationMembers } from "~~/server/services/organization.service";

export default defineEventHandler(async (event) => {
    const user = await requireAuth(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing organization id" });
    }

    // Authz path-id: membro di QUESTA org (non dell'org attiva).
    const role = await getOrgRole(user.id, id);
    if (!role) {
        throw createError({ statusCode: 403, statusMessage: "Accesso negato" });
    }

    try {
        return await listOrganizationMembers(id);
    } catch (e: any) {
        if (e.statusCode) throw e;
        console.error("[organizations.[id].members.get] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to list members" });
    }
});
