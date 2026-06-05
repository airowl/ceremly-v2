import { eq } from "drizzle-orm";
import * as schema from "~~/server/database/schema";
import { requireAdminApiKey } from "~~/server/utils/requireAdminApiKey";
import { getDB } from "~~/server/utils/db";
import { getUserPlanInfo, getEffectiveLimits } from "~~/server/utils/userPlan";
import type { PlanLimits } from "~~/shared/constants/pricing";

export interface UserLimitsResponse {
    userId: string;
    plan: string;
    planLimits: PlanLimits;
    customLimits: Partial<PlanLimits> | null;
    effectiveLimits: PlanLimits;
    hasCustom: boolean;
    note: string | null;
}

/**
 * GET /api/admin/users/:id/limits
 * Returns user's plan limits, custom overrides, and effective limits
 */
export default defineEventHandler(async (event): Promise<UserLimitsResponse> => {
    await requireAdminApiKey(event);

    const db = getDB();
    const userId = getRouterParam(event, "id");

    if (!userId) {
        throw createError({
            statusCode: 400,
            statusMessage: "User ID is required",
        });
    }

    // Verify user exists
    const user = await db.query.user.findFirst({
        where: eq(schema.user.id, userId),
    });

    if (!user) {
        throw createError({
            statusCode: 404,
            statusMessage: "User not found",
        });
    }

    // Get plan info and effective limits
    const planInfo = await getUserPlanInfo(userId);
    const effectiveInfo = await getEffectiveLimits(userId);

    // Get custom limits record to include note
    const customRecord = await db
        .select()
        .from(schema.userCustomLimits)
        .where(eq(schema.userCustomLimits.userId, userId))
        .limit(1);

    return {
        userId,
        plan: planInfo.plan,
        planLimits: planInfo.limits,
        customLimits: effectiveInfo.customLimits,
        effectiveLimits: effectiveInfo.limits,
        hasCustom: effectiveInfo.hasCustom,
        note: customRecord[0]?.note ?? null,
    };
});
