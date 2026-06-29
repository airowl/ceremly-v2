/**
 * DELETE /api/projects/:id
 * Deletes a project (RBAC: requireWrite + assertOwnership in the service).
 */
import { requireWrite } from "~~/server/utils/permissions";
import { deleteProject } from "~~/server/services/project.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireWrite(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing project id" });
    }

    try {
        return await deleteProject(event, id);
    } catch (e: any) {
        if (e.statusCode) throw e;
        console.error("[projects.[id].delete] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to delete project" });
    }
});
