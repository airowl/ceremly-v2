/**
 * GET /api/projects
 * Lista i projects dell'org attiva (RBAC: requireMember).
 */
import { requireMember } from "~~/server/utils/permissions";
import { listProjects } from "~~/server/services/project.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireMember(event);

    try {
        return await listProjects(event);
    } catch (e: any) {
        if (e.statusCode) throw e;
        console.error("[projects.index.get] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to list projects" });
    }
});
