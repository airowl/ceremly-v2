import { z } from "zod";
import { nonEmptyString, slugField } from "./common";

export const createEventSchema = z.object({
  name: nonEmptyString.max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato data invalido (YYYY-MM-DD)"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Formato orario invalido (HH:MM)").nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6366f1"),
  showGuestCount: z.boolean().default(true),
  autoConfirmRegistration: z.boolean().default(false),
  socialProofEnabled: z.boolean().default(false),
});
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = z.object({
  name: nonEmptyString.max(200).optional(),
  slug: slugField.optional(),
  description: z.string().max(500).nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  showGuestCount: z.boolean().optional(),
  maxGuests: z.number().int().min(1).optional(),
  autoConfirmRegistration: z.boolean().optional(),
  socialProofEnabled: z.boolean().optional(),
});
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
