/**
 * POST /api/events/:eventId/templates/apply
 * Apply a template to an event's landing page.
 */
import { applyTemplateToEvent } from "~~/server/services/eventTemplate.service";
import { parseBody } from "~~/server/utils/validateBody";
import { applyTemplateSchema } from "~~/shared/schemas/eventTemplate";

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  const eventId = getRouterParam(event, "eventId")!;
  const input = await parseBody(event, applyTemplateSchema);

  return applyTemplateToEvent(event, eventId, user.id, input.templateId);
});
