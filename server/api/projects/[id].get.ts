/**
 * GET /api/projects/:id
 * Singolo project (RBAC: requireMember + assertOwnership nel service).
 */
import { requireMember } from "~~/server/utils/permissions";
import { getProject } from "~~/server/services/project.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireMember(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing project id" });
    }

    try {
        return await getProject(event, id);
    } catch (e: any) {
        if (e.statusCode) throw e;
        console.error("[projects.[id].get] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to fetch project" });
    }
});
