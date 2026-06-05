import { eq } from "drizzle-orm";
import * as schema from "~~/server/database/schema";
import { requireAdminApiKey } from "~~/server/utils/requireAdminApiKey";
import { getDB } from "~~/server/utils/db";
import { logAudit } from "~~/server/utils/audit";
import { adminUpdateSubscriptionSchema } from "~~/shared/schemas/admin";
import { parseBody } from "~~/server/utils/validateBody";

export default defineEventHandler(async (event) => {
    await requireAdminApiKey(event);
    const db = getDB();
    const subscriptionId = getRouterParam(event, "id");

    if (!subscriptionId) {
        throw createError({
            statusCode: 400,
            statusMessage: "Subscription ID is required",
        });
    }

    const validatedData = await parseBody(event, adminUpdateSubscriptionSchema);

    // Get current subscription
    const currentSub = await db.query.creem_subscription.findFirst({
        where: eq(schema.creem_subscription.id, subscriptionId),
    });

    if (!currentSub) {
        throw createError({
            statusCode: 404,
            statusMessage: "Subscription not found",
        });
    }

    // Build update object
    const updateData: Partial<typeof schema.creem_subscription.$inferInsert> = {};

    if (validatedData.status !== undefined) {
        updateData.status = validatedData.status;
    }

    if (validatedData.periodStart !== undefined) {
        updateData.periodStart = validatedData.periodStart
            ? new Date(validatedData.periodStart)
            : null;
    }

    if (validatedData.periodEnd !== undefined) {
        updateData.periodEnd = validatedData.periodEnd
            ? new Date(validatedData.periodEnd)
            : null;
    }

    if (validatedData.cancelAtPeriodEnd !== undefined) {
        updateData.cancelAtPeriodEnd = validatedData.cancelAtPeriodEnd;
    }

    if (Object.keys(updateData).length === 0) {
        throw createError({
            statusCode: 400,
            statusMessage: "No valid fields to update",
        });
    }

    // Update subscription
    await db
        .update(schema.creem_subscription)
        .set(updateData)
        .where(eq(schema.creem_subscription.id, subscriptionId));

    // Build changes for audit details
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (validatedData.status && validatedData.status !== currentSub.status) {
        changes.status = { from: currentSub.status, to: validatedData.status };
    }
    if (validatedData.cancelAtPeriodEnd !== undefined &&
        validatedData.cancelAtPeriodEnd !== currentSub.cancelAtPeriodEnd) {
        changes.cancelAtPeriodEnd = { from: currentSub.cancelAtPeriodEnd, to: validatedData.cancelAtPeriodEnd };
    }

    await logAudit(event, 'admin.subscription_updated', {
        userId: 'admin-api',
        targetType: 'subscription',
        targetId: subscriptionId,
        details: { changes },
    });

    // Get updated subscription
    const updatedSub = await db.query.creem_subscription.findFirst({
        where: eq(schema.creem_subscription.id, subscriptionId),
    });

    return {
        success: true,
        subscription: updatedSub,
    };
});
