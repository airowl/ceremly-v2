/**
 * User Service
 * Business logic for user operations: profile update, account deletion, data export.
 */
import type { H3Event, EventHandlerRequest } from "~~/server/types/h3"
import { eq, desc } from 'drizzle-orm'
import { user, account, dataExports } from '../database/schema'
import { getDB } from '../utils/db'
import { logAudit } from '../utils/audit'
import {
  createDataExportRequest,
  hasPendingExport,
  updateExportStatus,
} from '../utils/dataExport'
import { failStaleExports } from './dataExport.service'
import { dispatch } from '~~/server/queue'
import { useServerAuth } from '../utils/auth'
import { ACCOUNT_DELETION_GRACE_DAYS } from './gdpr.service'
import { ACCOUNT_DELETION_REASON_PREFIX } from '../repositories/gdprRepository'
import type { UpdateProfileInput } from '~~/shared/schemas/auth'

// --- User Read Operations ---

/**
 * Fetch the user profile for the given userId.
 * Returns a formatted profile DTO.
 */
export async function getUserProfile(userId: string) {
  const db = getDB()

  const [userData] = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      bio: user.bio,
      image: user.image,
      locale: user.locale,
      timezone: user.timezone,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  if (!userData) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Profile not found',
    })
  }

  // Access provider: Better Auth uses 'credential' for email/password.
  // If the user has a 'credential' account they can manage email/password locally
  // ('email'); otherwise they are OAuth-only (e.g. 'google') → email/password
  // changes must go through the provider, so the UI disables those fields.
  const accounts = await db
    .select({ providerId: account.providerId })
    .from(account)
    .where(eq(account.userId, userId))

  const providerIds = accounts.map((a) => a.providerId)
  const hasCredential = providerIds.includes('credential')
  const authProvider = hasCredential
    ? 'email'
    : (providerIds.find((p) => p !== 'credential') ?? 'email')

  return {
    profile: {
      id: userData.id,
      email: userData.email,
      fullName: userData.name,
      phone: userData.phone,
      bio: userData.bio,
      image: userData.image,
      locale: userData.locale,
      timezone: userData.timezone,
      createdAt: userData.createdAt?.toISOString(),
      updatedAt: userData.updatedAt?.toISOString(),
    },
    authProvider,
  }
}

/**
 * Fetch the latest data export status for a user.
 * Checks expiration and conditionally includes the download token.
 */
export async function getDataExportStatus(userId: string) {
  const db = getDB()

  // Self-heal exports orphaned by a hard kill, otherwise the UI spins forever.
  await failStaleExports(userId)

  // Get the most recent export
  const latestExport = await db.query.dataExports.findFirst({
    where: eq(dataExports.userId, userId),
    orderBy: [desc(dataExports.createdAt)],
  })

  if (!latestExport) {
    return {
      hasExport: false,
      export: null,
    }
  }

  // Check if export is expired
  const isExpired = latestExport.expiresAt && new Date(latestExport.expiresAt) < new Date()

  return {
    hasExport: true,
    export: {
      id: latestExport.id,
      status: isExpired && latestExport.status === 'completed' ? 'expired' : latestExport.status,
      format: latestExport.format,
      fileSize: latestExport.fileSize,
      downloadToken: latestExport.status === 'completed' && !isExpired ? latestExport.downloadToken : null,
      expiresAt: latestExport.expiresAt,
      completedAt: latestExport.completedAt,
      errorMessage: latestExport.errorMessage,
      createdAt: latestExport.createdAt,
    },
  }
}

// --- User Write Operations ---

/**
 * Update user profile fields (fullName, phone, bio, locale).
 * Returns the updated profile object.
 */
export async function updateProfile(
  h3Event: H3Event<EventHandlerRequest>,
  userId: string,
  input: UpdateProfileInput,
) {
  const { fullName, phone, bio, locale, timezone, image } = input

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  }

  if (fullName !== undefined) updateData.name = fullName
  if (phone !== undefined) updateData.phone = phone
  if (bio !== undefined) updateData.bio = bio
  if (locale !== undefined) updateData.locale = locale
  if (timezone !== undefined) updateData.timezone = timezone
  if (image !== undefined) updateData.image = image

  try {
    const db = getDB()

    await db.update(user).set(updateData).where(eq(user.id, userId))

    // Fetch updated profile
    const [updatedUser] = await db
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        bio: user.bio,
        image: user.image,
        locale: user.locale,
        timezone: user.timezone,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)

    await logAudit(h3Event, 'user.profile_updated', {
      targetType: 'user',
      targetId: userId,
      details: {
        ...(fullName !== undefined && { fullName }),
        ...(phone !== undefined && { phone }),
        ...(bio !== undefined && { bio }),
        ...(locale !== undefined && { locale }),
        ...(timezone !== undefined && { timezone }),
        ...(image !== undefined && { image: image ? 'updated' : 'removed' }),
      },
    })

    return {
      success: true,
      profile: updatedUser
        ? {
            id: updatedUser.id,
            email: updatedUser.email,
            fullName: updatedUser.name,
            phone: updatedUser.phone,
            bio: updatedUser.bio,
            image: updatedUser.image,
            locale: updatedUser.locale,
            timezone: updatedUser.timezone,
            createdAt: updatedUser.createdAt?.toISOString(),
            updatedAt: updatedUser.updatedAt?.toISOString(),
          }
        : null,
    }
  } catch (e) {
    console.error('[user.service] updateProfile error:', e)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update profile',
    })
  }
}

/**
 * Soft-delete user account (mark as banned).
 */
export async function deleteAccount(
  h3Event: H3Event<EventHandlerRequest>,
  userId: string,
) {
  try {
    const db = getDB()

    // Deletion with GRACE WINDOW (right to erasure): the account is banned
    // and SCHEDULED for permanent deletion. The ban is PERMANENT during the
    // grace period (banExpires = null, so Better Auth never un-bans and the
    // user cannot log back in); the purge date is encoded in banReason.
    // A daily cron (gdpr.service.purgeDueDeletedAccounts) performs the
    // hard-delete (PII + data, R2 included) after expiry.
    const purgeAt = new Date(Date.now() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000)
    await db
      .update(user)
      .set({
        banned: true,
        banReason: `${ACCOUNT_DELETION_REASON_PREFIX}${purgeAt.toISOString()}`,
        banExpires: null,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId))

    // Immediately revoke sessions (Redis secondaryStorage): without this the
    // "deleted" account would stay logged in until the cached session expires.
    // Same mechanism as the admin ban (internalAdapter.deleteSessions by userId).
    try {
      const ctx = await useServerAuth().$context
      await ctx.internalAdapter.deleteSessions(userId)
    } catch (err) {
      console.error('[user.service] deleteAccount: session revocation failed:', err)
    }

    await logAudit(h3Event, 'user.account_deleted', {
      targetType: 'user',
      targetId: userId,
      details: { reason: 'self_deletion', purgeAt: purgeAt.toISOString(), graceDays: ACCOUNT_DELETION_GRACE_DAYS },
    })

    return {
      success: true,
      message: 'Account scheduled for deletion',
      purgeAt: purgeAt.toISOString(),
    }
  } catch (e) {
    console.error('[user.service] deleteAccount error:', e)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete account',
    })
  }
}

/**
 * Request a GDPR data export.
 * Checks for pending exports, creates request, triggers background processing.
 */
export async function requestDataExport(
  h3Event: H3Event<EventHandlerRequest>,
  userId: string,
) {
  // Self-heal exports orphaned by a hard kill BEFORE the pending check,
  // otherwise a stale 'processing' row blocks the user forever.
  await failStaleExports(userId)

  // Check if user already has a pending export
  const pending = await hasPendingExport(userId)
  if (pending) {
    throw createError({
      statusCode: 400,
      statusMessage: 'You already have a pending export request. Please wait for it to complete.',
    })
  }

  // Create export request
  const exportId = await createDataExportRequest(userId)

  // Enqueue export job (QStash in prod, in-process in dev).
  // If enqueue fails, mark the request failed so it doesn't stay pending
  // forever and block future requests via hasPendingExport().
  try {
    await dispatch('data-export', { exportId, userId })
  } catch (error) {
    await updateExportStatus(exportId, 'failed', {
      errorMessage: error instanceof Error ? error.message : 'Failed to enqueue export',
    })
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to start export. Please try again.',
    })
  }

  await logAudit(h3Event, 'user.data_export_requested', {
    targetType: 'data_export',
    targetId: exportId,
    details: { format: 'json' },
  })

  return {
    success: true,
    exportId,
    message: "Export request created. You will be notified when it's ready.",
  }
}
