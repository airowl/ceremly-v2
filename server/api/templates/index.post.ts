/**
 * POST /api/templates
 * Create a custom event template.
 */
import { createTemplate } from "~~/server/services/eventTemplate.service";
import { parseBody } from "~~/server/utils/validateBody";
import { createEventTemplateSchema } from "~~/shared/schemas/eventTemplate";

export default defineEventHandler(async (event) => {
    const user = await requireAuth(event);
    const input = await parseBody(event, createEventTemplateSchema);

    return createTemplate(event, user.id, input);
});
