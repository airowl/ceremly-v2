/**
 * POST /api/projects
 * Creates a project in the active org (RBAC: requireWrite).
 */
import { createProjectSchema } from "~~/shared/schemas/project";
import { parseBody } from "~~/server/utils/validateBody";
import { requireWrite } from "~~/server/utils/permissions";
import { createProject } from "~~/server/services/project.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireWrite(event);
    const data = await parseBody(event, createProjectSchema);

    try {
        return await createProject(event, data);
    } catch (e: any) {
        if (e.statusCode) throw e;
        if (e.code === "23505") {
            throw createError({ statusCode: 409, statusMessage: "Project already exists" });
        }
        console.error("[projects.index.post] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to create project" });
    }
});
