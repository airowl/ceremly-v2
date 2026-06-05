/**
 * POST /api/events/:eventId/reminders/templates
 * Create a custom reminder template.
 */
import { parseBody } from "~~/server/utils/validateBody";
import { createReminderTemplateSchema } from "~~/shared/schemas/reminder";
import { createTemplate } from "~~/server/services/reminder.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    const eventId = getRouterParam(event, "eventId")!;
    const input = await parseBody(event, createReminderTemplateSchema);

    return createTemplate(event, eventId, input);
});
