/**
 * POST /api/templates/generate
 * Generate an event template using AI from a text prompt.
 */
import { parseBody } from "~~/server/utils/validateBody";
import { generateTemplateSchema } from "~~/shared/schemas/eventTemplate";
import { generateEventTemplate } from "~~/server/services/ai.service";
import { createAiTemplate } from "~~/server/services/eventTemplate.service";

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  const input = await parseBody(event, generateTemplateSchema);

  const data = await generateEventTemplate(input.prompt, input.category);

  const template = await createAiTemplate(
    event,
    user.id,
    `AI: ${input.prompt.slice(0, 80)}`,
    input.category ?? "other",
    data,
  );

  return template;
});
