/**
 * GET /api/events/:id/reminders
 * Lista reminder dell'evento, max 3 (RBAC: requireMember + assertOwnership nel service).
 */
import { requireMember } from "~~/server/utils/permissions";
import { listReminders } from "~~/server/services/reminder.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireMember(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing event id" });
    }

    try {
        return await listReminders(event, id);
    } catch (e) {
        const err = e as { statusCode?: number };
        if (err.statusCode) throw e;
        console.error("[events.[id].reminders.get] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to list reminders" });
    }
});
