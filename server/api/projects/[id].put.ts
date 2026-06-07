/**
 * PUT /api/projects/:id
 * Aggiorna un project (RBAC: requireWrite + assertOwnership nel service).
 */
import { updateProjectSchema } from "~~/shared/schemas/project";
import { parseBody } from "~~/server/utils/validateBody";
import { requireWrite } from "~~/server/utils/permissions";
import { updateProject } from "~~/server/services/project.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireWrite(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing project id" });
    }
    const data = await parseBody(event, updateProjectSchema);

    try {
        return await updateProject(event, id, data);
    } catch (e: any) {
        if (e.statusCode) throw e;
        console.error("[projects.[id].put] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to update project" });
    }
});
