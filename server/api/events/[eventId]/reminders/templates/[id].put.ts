/**
 * PUT /api/events/:eventId/reminders/templates/:id
 * Update a reminder template.
 */
import { parseBody } from "~~/server/utils/validateBody";
import { updateReminderTemplateSchema } from "~~/shared/schemas/reminder";
import { updateTemplate } from "~~/server/services/reminder.service";

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

    const input = await parseBody(event, updateReminderTemplateSchema);

    return updateTemplate(event, eventId, templateId, input);
});
