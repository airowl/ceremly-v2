import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import * as schema from "~~/server/database/schema";
import { requireAdminApiKey } from "~~/server/utils/requireAdminApiKey";
import { getDB } from "~~/server/utils/db";
import { logAudit } from "~~/server/utils/audit";
import { getEffectiveLimits } from "~~/server/utils/userPlan";
import { adminUpdateLimitsSchema } from "~~/shared/schemas/admin";
import { parseBody } from "~~/server/utils/validateBody";

/**
 * PATCH /api/admin/users/:id/limits
 * Update custom limits for a user
 * - value: sets the override
 * - null: removes the override (uses plan default)
 * - absent: no change
 */
export default defineEventHandler(async (event) => {
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

    const validatedData = await parseBody(event, adminUpdateLimitsSchema);

    // Check if there are any fields to update
    const hasUpdates = Object.values(validatedData).some(v => v !== undefined);
    if (!hasUpdates) {
        throw createError({
            statusCode: 400,
            statusMessage: "No valid fields to update",
        });
    }

    // Get existing custom limits
    const existingRecord = await db
        .select()
        .from(schema.userCustomLimits)
        .where(eq(schema.userCustomLimits.userId, userId))
        .limit(1);

    const existing = existingRecord[0];

    // Build update data
    const updateData: Partial<typeof schema.userCustomLimits.$inferInsert> = {};

    // Handle each limit field: value = set, null = remove, undefined = no change
    if (validatedData.max_events !== undefined) {
        updateData.maxEvents = validatedData.max_events;
    }
    if (validatedData.storage_mb !== undefined) {
        updateData.storageMb = validatedData.storage_mb;
    }
    if (validatedData.team_members !== undefined) {
        updateData.teamMembers = validatedData.team_members;
    }
if (validatedData.note !== undefined) {
        updateData.note = validatedData.note;
    }

    // Track changes for audit log
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (validatedData.max_events !== undefined) {
        changes.max_events = { from: existing?.maxEvents ?? 'plan default', to: validatedData.max_events ?? 'plan default' };
    }
    if (validatedData.storage_mb !== undefined) {
        changes.storage_mb = { from: existing?.storageMb ?? 'plan default', to: validatedData.storage_mb ?? 'plan default' };
    }
    if (validatedData.team_members !== undefined) {
        changes.team_members = { from: existing?.teamMembers ?? 'plan default', to: validatedData.team_members ?? 'plan default' };
    }
if (validatedData.note !== undefined) {
        changes.note = { from: existing?.note ?? null, to: validatedData.note };
    }

    if (existing) {
        // Update existing record
        await db
            .update(schema.userCustomLimits)
            .set(updateData)
            .where(eq(schema.userCustomLimits.userId, userId));

        // Check if all limits are now null - if so, delete the record
        const updatedRecord = await db
            .select()
            .from(schema.userCustomLimits)
            .where(eq(schema.userCustomLimits.userId, userId))
            .limit(1);

        const updated = updatedRecord[0];
        if (updated &&
            updated.maxEvents === null &&
            updated.storageMb === null &&
            updated.teamMembers === null &&
            updated.note === null
        ) {
            // All fields are null, delete the record
            await db
                .delete(schema.userCustomLimits)
                .where(eq(schema.userCustomLimits.userId, userId));
        }
    } else {
        // Create new record
        await db.insert(schema.userCustomLimits).values({
            id: nanoid(),
            userId,
            maxEvents: validatedData.max_events ?? null,
            storageMb: validatedData.storage_mb ?? null,
            teamMembers: validatedData.team_members ?? null,
            note: validatedData.note ?? null,
        });
    }

    await logAudit(event, 'admin.user_limits_updated', {
        userId: 'admin-api',
        targetType: 'user',
        targetId: userId,
        details: { changes },
    });

    // Return updated effective limits
    const effectiveInfo = await getEffectiveLimits(userId);

    // Get updated note
    const finalRecord = await db
        .select()
        .from(schema.userCustomLimits)
        .where(eq(schema.userCustomLimits.userId, userId))
        .limit(1);

    return {
        success: true,
        userId,
        effectiveLimits: effectiveInfo.limits,
        customLimits: effectiveInfo.customLimits,
        hasCustom: effectiveInfo.hasCustom,
        note: finalRecord[0]?.note ?? null,
    };
});
