import { eq } from "drizzle-orm";
import * as schema from "~~/server/database/schema";
import { requireAdminApiKey } from "~~/server/utils/requireAdminApiKey";
import { getDB } from "~~/server/utils/db";
import { logAudit } from "~~/server/utils/audit";
import { useServerAuth } from "~~/server/utils/auth";
import { adminUpdateUserSchema } from "~~/shared/schemas/admin";
import { parseBody } from "~~/server/utils/validateBody";

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

    const validatedData = await parseBody(event, adminUpdateUserSchema);

    // Get current user state
    const currentUser = await db.query.user.findFirst({
        where: eq(schema.user.id, userId),
    });

    if (!currentUser) {
        throw createError({
            statusCode: 404,
            statusMessage: "User not found",
        });
    }

    // Build update object
    const updateData: Partial<typeof schema.user.$inferInsert> = {};

    if (validatedData.role !== undefined) {
        updateData.role = validatedData.role;
    }

    if (validatedData.banned !== undefined) {
        updateData.banned = validatedData.banned;
        if (validatedData.banned) {
            updateData.banReason = validatedData.banReason ?? null;
            updateData.banExpires = validatedData.banExpires
                ? new Date(validatedData.banExpires)
                : null;
        } else {
            // Clear ban fields when unbanning
            updateData.banReason = null;
            updateData.banExpires = null;
        }
    }

    if (Object.keys(updateData).length === 0) {
        throw createError({
            statusCode: 400,
            statusMessage: "No valid fields to update",
        });
    }

    // Update user
    await db
        .update(schema.user)
        .set(updateData)
        .where(eq(schema.user.id, userId));

    // Ban → immediately revoke the target's sessions (DB + secondaryStorage Redis).
    // The `banned` flag is evaluated only at session.create (sign-in): without this,
    // an abusive user already logged in would remain authenticated until the natural
    // expiry of the cached session — exactly the population we want to cut off.
    // Same internal operation as auth.api.banUser (internalAdapter.deleteSessions).
    // try/catch like deleteAccount: a failure here must not roll back the ban
    // already written, but should be logged loudly (it's the bug that resurfaces if silenced).
    if (validatedData.banned === true) {
        try {
            const ctx = await useServerAuth().$context;
            await ctx.internalAdapter.deleteSessions(userId);
        } catch (err) {
            console.error(`[admin.user.patch] session revocation failed for banned user ${userId}:`, err);
        }
    }

    if (validatedData.role !== undefined && validatedData.role !== currentUser.role) {
        await logAudit(event, 'admin.user_role_changed', {
            userId: 'admin-api',
            targetType: 'user',
            targetId: userId,
            details: {
                previousRole: currentUser.role || 'user',
                newRole: validatedData.role,
            },
        });
    }

    if (validatedData.banned !== undefined && validatedData.banned !== currentUser.banned) {
        await logAudit(event, validatedData.banned ? 'admin.user_banned' : 'admin.user_unbanned', {
            userId: 'admin-api',
            targetType: 'user',
            targetId: userId,
            details: validatedData.banned
                ? { banReason: validatedData.banReason || null }
                : {},
        });
    }

    // Get updated user
    const updatedUser = await db.query.user.findFirst({
        where: eq(schema.user.id, userId),
    });

    return {
        success: true,
        user: updatedUser,
    };
});
