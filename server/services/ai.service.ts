/**
 * AI Service
 * Uses Mastra Agent with OpenAI provider to generate event template data.
 */
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import {
  LANDING_SECTION_TYPES,
  LANDING_FONTS,
  LANDING_BORDER_RADIUS,
} from "~~/shared/constants/enums";
import { landingPageDataSchema } from "~~/shared/schemas/landing";
import type { LandingPageData } from "~~/shared/schemas/landing";
import type { TemplateCategory } from "~~/shared/constants/enums";

// ─── Structured Output Schema ────────────────────────────────────────

const templateOutputSchema = z.object({
  settings: z.object({
    primaryColor: z.string().describe("Hex color e.g. #6366f1"),
    secondaryColor: z.string().describe("Hex color e.g. #10b981"),
    backgroundColor: z.string().describe("Hex color e.g. #ffffff"),
    textColor: z.string().describe("Hex color e.g. #1f2937"),
    fontFamily: z.enum(LANDING_FONTS),
    borderRadius: z.enum(LANDING_BORDER_RADIUS),
  }),
  sections: z.array(
    z.object({
      id: z.string().describe("Unique section identifier, e.g. 'hero-1'"),
      type: z.enum(LANDING_SECTION_TYPES),
      enabled: z.boolean(),
      order: z.number().int().min(0),
      values: z.record(z.string(), z.unknown()).describe("Section-specific configuration values"),
    }),
  ),
});

// ─── System Prompt ───────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert event landing page designer.
You generate structured JSON data for event landing pages.

Available section types: ${LANDING_SECTION_TYPES.join(", ")}
Available fonts: ${LANDING_FONTS.join(", ")}
Available border radius options: ${LANDING_BORDER_RADIUS.join(", ")}

When generating a template:
1. Choose colors that match the event vibe and category
2. Select an appropriate font family
3. Include these sections in order: hero, details, countdown, gallery, rsvp, footer
4. Set meaningful default values for each section
5. Use section "values" for content like titles, descriptions, button labels

Section values guidelines:
- hero: { title, subtitle, buttonText, backgroundImage }
- details: { title, items (array of { icon, label, value }) }
- countdown: { title, showDays, showHours, showMinutes, showSeconds }
- gallery: { title, columns, images }
- rsvp: { title, subtitle, buttonText }
- registration_form: { title, subtitle, fields }
- map: { title, address }
- footer: { text, showSocials }

Return ONLY valid JSON matching the required schema. All colors must be valid hex codes (#RRGGBB).`;

// ─── Agent Factory ───────────────────────────────────────────────────

let _agent: Agent | null = null;

function getTemplateAgent(): Agent {
  if (_agent) return _agent;

  const config = useRuntimeConfig();
  if (!config.openaiApiKey) {
    throw createError({
      statusCode: 503,
      statusMessage: "AI service not configured (missing NUXT_OPENAI_API_KEY)",
    });
  }

  // Set the env var so Mastra auto-reads it
  process.env.OPENAI_API_KEY = config.openaiApiKey as string;

  _agent = new Agent({
    id: "template-generator",
    name: "Template Generator",
    instructions: SYSTEM_PROMPT,
    model: "openai/gpt-4o-mini",
  });

  return _agent;
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Generate a landing page template using AI.
 * Returns validated LandingPageData.
 */
export async function generateEventTemplate(
  prompt: string,
  category?: TemplateCategory,
): Promise<LandingPageData> {
  const agent = getTemplateAgent();

  const userMessage = category
    ? `Category: ${category}\n\nEvent description: ${prompt}`
    : `Event description: ${prompt}`;

  const result = await agent.generate(userMessage, {
    structuredOutput: {
      schema: templateOutputSchema,
    },
  });

  const data = result.object as z.infer<typeof templateOutputSchema>;

  // Validate against the canonical schema
  const parsed = landingPageDataSchema.safeParse(data);
  if (!parsed.success) {
    throw createError({
      statusCode: 500,
      statusMessage: "AI generated invalid template data",
    });
  }

  return parsed.data;
}
