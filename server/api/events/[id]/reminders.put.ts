/**
 * PUT /api/events/:id/reminders
 * Bulk upsert reminder (RBAC: requireWrite). 422 se il totale supera i 3;
 * i reminder già inviati sono immutabili (skip silenzioso nel service).
 */
import { remindersSchema } from "~~/shared/schemas/ceremly";
import { parseBody } from "~~/server/utils/validateBody";
import { requireWrite } from "~~/server/utils/permissions";
import { saveReminders } from "~~/server/services/reminder.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireWrite(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing event id" });
    }
    const data = await parseBody(event, remindersSchema);

    try {
        return await saveReminders(event, id, data);
    } catch (e) {
        const err = e as { statusCode?: number, code?: string };
        if (err.statusCode) throw e;
        if (err.code === "23505") {
            throw createError({ statusCode: 409, statusMessage: "Reminder già esistente" });
        }
        console.error("[events.[id].reminders.put] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to save reminders" });
    }
});
