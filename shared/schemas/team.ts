import { z } from "zod";
import { emailField, languageField, nonEmptyString } from "./common";

export const teamInviteSchema = z.object({
    email: emailField,
    language: languageField,
});
export type TeamInviteInput = z.infer<typeof teamInviteSchema>;

export const acceptInviteSchema = z.object({
    token: nonEmptyString,
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const updatePermissionsSchema = z.object({
    role: z.enum(["editor", "viewer"]),
});
export type UpdatePermissionsInput = z.infer<typeof updatePermissionsSchema>;

export const resendInviteSchema = z.object({
    language: languageField,
});
export type ResendInviteInput = z.infer<typeof resendInviteSchema>;
