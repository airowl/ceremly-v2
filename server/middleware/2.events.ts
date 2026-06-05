/**
 * Event Middleware
 * Thin middleware for /api/events/** routes that need team-scoped access.
 *
 * Provides:
 * - event.context.user — Authenticated user (via requireAuth)
 * - event.context.userEvent — Event data (for /api/events/[id]/* routes)
 * - event.context.eventAccess — { isOwner, permissions }
 *
 * Business logic (plan limits, lazy-loaded data) lives in services,
 * not in middleware. See planLimit.service.ts and event.service.ts.
 */
import { eq, and, isNull } from 'drizzle-orm'
import { events } from '../database/schema'
import { requireAuth } from '../utils/auth'
import { getDB } from '../utils/db'
import { getUserRole } from '../utils/permissions'

// Pattern to match event ID routes: /api/events/{uuid}/...
const EVENT_ID_PATTERN = /^\/api\/events\/([0-9a-f-]{36})(\/|$)/i

export default defineEventHandler(async (event) => {
    const path = event.path

    // Only process /api/events routes
    if (!path?.startsWith('/api/events')) {
        return
    }

    // Authenticate user (uses session from auth middleware if available)
    await requireAuth(event)

    // Collection routes (GET /api/events, POST /api/events)
    // Only need user context — already set by requireAuth
    const match = path.match(EVENT_ID_PATTERN)
    if (!match) return

    // Resource routes: /api/events/[id]/*
    const eventId = match[1]!
    const db = getDB()

    const eventData = await db
        .select({
            id: events.id,
            name: events.name,
            slug: events.slug,
            description: events.description,
            userId: events.userId,
            date: events.date,
            createdAt: events.createdAt,
            updatedAt: events.updatedAt,
            deletedAt: events.deletedAt,
        })
        .from(events)
        .where(
            and(
                eq(events.id, eventId),
                isNull(events.deletedAt)
            )
        )
        .limit(1)

    if (eventData.length === 0) {
        throw createError({
            statusCode: 404,
            statusMessage: 'Event not found',
        })
    }

    const eventRow = eventData[0]!
    event.context.userEvent = {
        id: eventRow.id,
        name: eventRow.name,
        slug: eventRow.slug,
        description: eventRow.description,
        userId: eventRow.userId,
        date: eventRow.date,
        createdAt: eventRow.createdAt,
        updatedAt: eventRow.updatedAt,
    }

    // Resolve user role and access
    const roleContext = await getUserRole(event.context.user!.id, eventId)
    if (!roleContext) {
        throw createError({
            statusCode: 403,
            statusMessage: 'Non hai accesso a questo evento',
        })
    }

    event.context.eventAccess = {
        isOwner: roleContext.isOwner,
        permissions: [roleContext.role],
    }
})
