import { z } from "zod";

export const adminUpdateUserSchema = z.object({
    role: z.enum(["user", "admin"]).optional(),
    banned: z.boolean().optional(),
    banReason: z.string().max(500).optional().nullable(),
    banExpires: z.string().datetime().optional().nullable(),
});
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;

export const adminUpdateLimitsSchema = z.object({
    max_events: z.number().int().min(-1).nullable().optional(),
    storage_mb: z.number().int().min(-1).nullable().optional(),
    team_members: z.number().int().min(-1).nullable().optional(),
note: z.string().max(500).nullable().optional(),
});
export type AdminUpdateLimitsInput = z.infer<typeof adminUpdateLimitsSchema>;

export const adminUpdateSubscriptionSchema = z.object({
    plan: z.string().optional(),
    status: z.enum(["active", "canceled", "incomplete", "incomplete_expired", "past_due", "trialing", "unpaid", "paused"]).optional(),
    periodStart: z.string().datetime().optional().nullable(),
    periodEnd: z.string().datetime().optional().nullable(),
    cancelAtPeriodEnd: z.boolean().optional(),
});
export type AdminUpdateSubscriptionInput = z.infer<typeof adminUpdateSubscriptionSchema>;

export const adminCleanupFilesSchema = z.object({
    graceHours: z.number().int().min(0).optional(),
});
export type AdminCleanupFilesInput = z.infer<typeof adminCleanupFilesSchema>;
