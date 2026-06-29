/**
 * GET /api/organizations/:id
 * Org detail (path-id). Caller's role-based authz delegated to the plugin.
 */
import { getOrganization } from "~~/server/services/organization.service";
import { getOrgRole } from "~~/server/utils/permissions";

export default defineEventHandler(async (event) => {
    const user = await requireAuth(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing organization id" });
    }

    // Explicit guard (defense-in-depth, consistent with the members route): the
    // caller must be a member of THAT org. Previously we relied solely on the
    // internal checkMembership of the Better Auth plugin.
    const role = await getOrgRole(user.id, id);
    if (!role) {
        throw createError({ statusCode: 403, statusMessage: "Accesso negato" });
    }

    try {
        return await getOrganization(event, id);
    } catch (e: any) {
        if (e.statusCode) throw e;
        console.error("[organizations.[id].get] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to fetch organization" });
    }
});
