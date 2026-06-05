/**
 * POST /api/events/:eventId/landing/generate
 * Generate landing page data using AI from a text prompt.
 * Returns LandingPageData without persisting — the user saves manually.
 */
import { parseBody } from "~~/server/utils/validateBody";
import { generateLandingSchema } from "~~/shared/schemas/landing";
import { generateEventTemplate } from "~~/server/services/ai.service";
import { requireEventOwnership } from "~~/server/services/event.service";
import { logAudit } from "~~/server/utils/audit";

export default defineEventHandler(async (event) => {
  await requireAuth(event);
  const eventId = getRouterParam(event, "eventId")!;
  await requireEventOwnership(event, eventId);

  const input = await parseBody(event, generateLandingSchema);
  const data = await generateEventTemplate(input.prompt, input.category);

  await logAudit(event, "template.ai_generated", {
    targetType: "event_template",
    targetId: eventId,
    details: { prompt: input.prompt.slice(0, 100) },
  });

  return { data };
});
