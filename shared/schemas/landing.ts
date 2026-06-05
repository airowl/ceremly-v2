import { z } from "zod";
import { LANDING_SECTION_TYPES, LANDING_FONTS, LANDING_BORDER_RADIUS, TEMPLATE_CATEGORIES } from "../constants/enums";

/** Global settings for a landing page */
export const landingSettingsSchema = z.object({
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6366f1"),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#10b981"),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#ffffff"),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#1f2937"),
  fontFamily: z.enum(LANDING_FONTS).default("inter"),
  borderRadius: z.enum(LANDING_BORDER_RADIUS).default("md"),
});
export type LandingSettings = z.infer<typeof landingSettingsSchema>;

/** A single section in the landing page */
export const landingSectionSchema = z.object({
  id: z.string(),
  type: z.enum(LANDING_SECTION_TYPES),
  enabled: z.boolean().default(true),
  order: z.number().int().min(0),
  values: z.record(z.string(), z.unknown()).default({}),
});
export type LandingSection = z.infer<typeof landingSectionSchema>;

/** Full landing page data (stored as JSONB) */
export const landingPageDataSchema = z.object({
  settings: landingSettingsSchema,
  sections: z.array(landingSectionSchema),
});
export type LandingPageData = z.infer<typeof landingPageDataSchema>;

/** Schema for saving landing page */
export const saveLandingSchema = z.object({
  data: landingPageDataSchema,
});
export type SaveLandingInput = z.infer<typeof saveLandingSchema>;

/** Schema for AI landing generation */
export const generateLandingSchema = z.object({
  prompt: z.string().min(1).max(2000),
  category: z.enum(TEMPLATE_CATEGORIES).optional(),
});
export type GenerateLandingInput = z.infer<typeof generateLandingSchema>;
