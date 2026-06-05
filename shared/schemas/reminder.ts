import { z } from "zod";
import { nonEmptyString } from "./common";
import { REMINDER_TYPES } from "../constants/enums";

export const createReminderTemplateSchema = z.object({
  name: nonEmptyString.max(100),
  type: z.enum(REMINDER_TYPES),
  subject: z.string().max(200).nullable().optional(),
  body: nonEmptyString.max(5000),
});
export type CreateReminderTemplateInput = z.infer<typeof createReminderTemplateSchema>;

export const updateReminderTemplateSchema = z.object({
  name: nonEmptyString.max(100).optional(),
  type: z.enum(REMINDER_TYPES).optional(),
  subject: z.string().max(200).nullable().optional(),
  body: nonEmptyString.max(5000).optional(),
});
export type UpdateReminderTemplateInput = z.infer<typeof updateReminderTemplateSchema>;

export const sendReminderSchema = z.object({
  templateId: nonEmptyString,
});
export type SendReminderInput = z.infer<typeof sendReminderSchema>;

export const sendBatchReminderSchema = z.object({
  templateId: nonEmptyString,
  guestIds: z.array(nonEmptyString).optional(),
});
export type SendBatchReminderInput = z.infer<typeof sendBatchReminderSchema>;

export const toggleReminderActiveSchema = z.object({
  isActive: z.boolean(),
});
export type ToggleReminderActiveInput = z.infer<typeof toggleReminderActiveSchema>;
