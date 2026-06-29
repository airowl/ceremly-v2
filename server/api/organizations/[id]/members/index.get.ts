/**
 * GET /api/organizations/:id/members
 * Lists members + pending invites of the org (path-id).
 * Supersedes the old /api/team/*: membership now under /api/organizations/[id]/members.
 * Authz: the caller must be a member OF THAT org (getOrgRole != null).
 */
import { getOrgRole } from "~~/server/utils/permissions";
import { listOrganizationMembers } from "~~/server/services/organization.service";

export default defineEventHandler(async (event) => {
    const user = await requireAuth(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing organization id" });
    }

    // Authz path-id: member of THIS org (not the active org).
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
