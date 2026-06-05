/**
 * PUT /api/templates/:id
 * Update a user-owned event template.
 */
import { updateTemplate } from "~~/server/services/eventTemplate.service";
import { parseBody } from "~~/server/utils/validateBody";
import { updateEventTemplateSchema } from "~~/shared/schemas/eventTemplate";

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  const templateId = getRouterParam(event, "id")!;
  const input = await parseBody(event, updateEventTemplateSchema);

  return updateTemplate(event, user.id, templateId, input);
});
