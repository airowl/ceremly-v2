import { z } from "zod";

export const adminUpdateUserSchema = z.object({
    role: z.enum(["user", "admin"]).optional(),
    banned: z.boolean().optional(),
    banReason: z.string().max(500).optional().nullable(),
    banExpires: z.string().datetime().optional().nullable(),
});
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;

export const adminUpdateLimitsSchema = z.object({
    max_organizations: z.number().int().min(-1).nullable().optional(),
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

// --- Query delle liste admin (paginazione + filtri) ---
// page/limit: coercizione + clamping (stesso comportamento del vecchio
// getQuery+parseInt, ma via parseQueryParams: niente più cast manuali).
const adminPageField = z.coerce.number().int().catch(1).transform((n) => Math.max(1, n));
const adminLimitField = (def: number) =>
    z.coerce.number().int().catch(def).transform((n) => Math.min(100, Math.max(1, n)));
const adminSortOrder = z.enum(["asc", "desc"]).catch("desc");

export const adminUsersQuerySchema = z.object({
    page: adminPageField,
    limit: adminLimitField(20),
    search: z.string().optional().default(""),
    role: z.string().optional(),
    status: z.string().optional(),
    sortBy: z.string().optional().default("createdAt"),
    sortOrder: adminSortOrder,
});
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;

export const adminAuditLogsQuerySchema = z.object({
    page: adminPageField,
    limit: adminLimitField(50),
    category: z.string().optional(),
    action: z.string().optional(),
    userId: z.string().optional(),
    eventId: z.string().optional(),
    status: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    search: z.string().optional(),
});
export type AdminAuditLogsQuery = z.infer<typeof adminAuditLogsQuerySchema>;

export const adminSubscriptionsQuerySchema = z.object({
    page: adminPageField,
    limit: adminLimitField(20),
    search: z.string().optional().default(""),
    status: z.string().optional(),
    sortBy: z.string().optional().default("periodEnd"),
    sortOrder: adminSortOrder,
});
export type AdminSubscriptionsQuery = z.infer<typeof adminSubscriptionsQuerySchema>;
