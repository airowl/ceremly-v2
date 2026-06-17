/**
 * GET /api/organizations/:id
 * Dettaglio org (path-id). Authz role-based del caller delegata al plugin.
 */
import { getOrganization } from "~~/server/services/organization.service";
import { getOrgRole } from "~~/server/utils/permissions";

export default defineEventHandler(async (event) => {
    const user = await requireAuth(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing organization id" });
    }

    // Guard esplicito (defense-in-depth, coerente con la rotta members): il
    // caller deve essere membro di QUELL'org. Prima ci si affidava solo al
    // checkMembership interno del plugin Better Auth.
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
