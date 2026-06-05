import { z } from "zod";
import { nonEmptyString, emailField } from "./common";
import { GUEST_STATUSES, GUEST_SOURCES } from "../constants/enums";

export const createGuestSchema = z.object({
  name: nonEmptyString.max(200),
  email: emailField.nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  group: z.string().max(100).nullable().optional(),
});
export type CreateGuestInput = z.infer<typeof createGuestSchema>;

export const updateGuestSchema = z.object({
  name: nonEmptyString.max(200).optional(),
  email: emailField.nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  group: z.string().max(100).nullable().optional(),
  status: z.enum(GUEST_STATUSES).optional(),
  customFields: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type UpdateGuestInput = z.infer<typeof updateGuestSchema>;

export const importGuestRowSchema = z.object({
  name: nonEmptyString.max(200),
  email: emailField.optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  group: z.string().max(100).optional().or(z.literal("")),
});
export type ImportGuestRow = z.infer<typeof importGuestRowSchema>;

export const importGuestsSchema = z.object({
  guests: z.array(importGuestRowSchema).min(1).max(500),
});
export type ImportGuestsInput = z.infer<typeof importGuestsSchema>;

export const guestFilterSchema = z.object({
  status: z.enum(GUEST_STATUSES).optional(),
  source: z.enum(GUEST_SOURCES).optional(),
  search: z.string().max(100).optional(),
});
export type GuestFilter = z.infer<typeof guestFilterSchema>;

export const publicRegistrationSchema = z.object({
  name: nonEmptyString.max(200),
  email: emailField.optional(),
  phone: z.string().max(30).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});
export type PublicRegistrationInput = z.infer<typeof publicRegistrationSchema>;

export const rsvpRespondSchema = z.object({
  guestId: nonEmptyString,
  status: z.enum(["yes", "no"]),
});
export type RsvpRespondInput = z.infer<typeof rsvpRespondSchema>;
