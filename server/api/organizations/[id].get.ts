/**
 * GET /api/organizations/:id
 * Dettaglio org (path-id). Authz role-based del caller delegata al plugin.
 */
import { getOrganization } from "~~/server/services/organization.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing organization id" });
    }

    try {
        return await getOrganization(event, id);
    } catch (e: any) {
        if (e.statusCode) throw e;
        console.error("[organizations.[id].get] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to fetch organization" });
    }
});
