/**
 * DELETE /api/organizations/:id
 * Delete org (path-id). Authz role-based del caller delegata al plugin.
 */
import { deleteOrganization } from "~~/server/services/organization.service";

export default defineEventHandler(async (event) => {
    const user = await requireAuth(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing organization id" });
    }

    try {
        return await deleteOrganization(event, user.id, id);
    } catch (e: any) {
        if (e.statusCode) throw e;
        console.error("[organizations.[id].delete] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to delete organization" });
    }
});
