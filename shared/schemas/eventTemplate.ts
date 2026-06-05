import { z } from "zod";
import { nonEmptyString } from "./common";
import { TEMPLATE_CATEGORIES } from "../constants/enums";
import { landingPageDataSchema } from "./landing";

/** Query params for listing templates */
export const listTemplatesQuerySchema = z.object({
  category: z.enum(TEMPLATE_CATEGORIES).optional(),
});
export type ListTemplatesQuery = z.infer<typeof listTemplatesQuerySchema>;

/** Create a new event template */
export const createEventTemplateSchema = z.object({
  name: nonEmptyString.max(200),
  description: z.string().max(1000).optional(),
  category: z.enum(TEMPLATE_CATEGORIES),
  data: landingPageDataSchema,
  thumbnailUrl: z.string().url().optional().nullable(),
});
export type CreateEventTemplateInput = z.infer<typeof createEventTemplateSchema>;

/** Update an existing event template */
export const updateEventTemplateSchema = z.object({
  name: nonEmptyString.max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  category: z.enum(TEMPLATE_CATEGORIES).optional(),
  data: landingPageDataSchema.optional(),
  thumbnailUrl: z.string().url().optional().nullable(),
});
export type UpdateEventTemplateInput = z.infer<typeof updateEventTemplateSchema>;

/** AI generate template from prompt */
export const generateTemplateSchema = z.object({
  prompt: nonEmptyString.max(2000),
  category: z.enum(TEMPLATE_CATEGORIES).optional(),
});
export type GenerateTemplateInput = z.infer<typeof generateTemplateSchema>;

/** Apply template to an event's landing page */
export const applyTemplateSchema = z.object({
  templateId: nonEmptyString,
});
export type ApplyTemplateInput = z.infer<typeof applyTemplateSchema>;
