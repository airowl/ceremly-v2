/**
 * DELETE /api/templates/:id
 * Delete a user-owned event template.
 */
import { deleteTemplate } from "~~/server/services/eventTemplate.service";

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  const templateId = getRouterParam(event, "id")!;

  return deleteTemplate(event, user.id, templateId);
});
