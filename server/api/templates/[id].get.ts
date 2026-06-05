/**
 * GET /api/templates/:id
 * Get a single event template by ID.
 */
import { getTemplateById } from "~~/server/services/eventTemplate.service";

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  const templateId = getRouterParam(event, "id")!;

  return getTemplateById(templateId, user.id);
});
