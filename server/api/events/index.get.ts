/**
 * GET /api/events
 * Lists events of the active org with aggregated counts (RBAC: requireMember).
 */
import { requireMember } from "~~/server/utils/permissions";
import { listEvents } from "~~/server/services/event.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireMember(event);

    try {
        return await listEvents(event);
    } catch (e) {
        const err = e as { statusCode?: number };
        if (err.statusCode) throw e;
        console.error("[events.index.get] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to list events" });
    }
});
