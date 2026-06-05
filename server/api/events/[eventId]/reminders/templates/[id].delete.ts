/**
 * DELETE /api/events/:eventId/reminders/templates/:id
 * Delete a custom reminder template.
 * Only non-default templates can be deleted.
 */
import { deleteTemplate } from "~~/server/services/reminder.service";

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

    return deleteTemplate(event, eventId, templateId);
});
