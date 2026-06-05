/**
 * PATCH /api/events/:eventId/reminders/templates/:id
 * Toggle the isActive state of a reminder template.
 */
import { parseBody } from "~~/server/utils/validateBody";
import { toggleReminderActiveSchema } from "~~/shared/schemas/reminder";
import { toggleTemplateActive } from "~~/server/services/reminder.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    const eventId = getRouterParam(event, "eventId")!;
    const templateId = getRouterParam(event, "id");

    if (!templateId) {
        throw createError({
            statusCode: 400,
            statusMessage: "Missing template id",
        });
    }

    const input = await parseBody(event, toggleReminderActiveSchema);

    return toggleTemplateActive(event, eventId, templateId, input.isActive);
});
