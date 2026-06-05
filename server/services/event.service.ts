/**
 * Event Service
 * Business logic for event CRUD operations.
 */
import type { H3Event, EventHandlerRequest } from "~~/server/types/h3";
import { eq, desc, sql, or, isNull, and } from "drizzle-orm";
import * as schema from "../database/schema";
import { getDB } from "../utils/db";
import { logAudit } from "../utils/audit";
import { canCreateEvent } from "./planLimit.service";
import type { CreateEventInput, UpdateEventInput } from "~~/shared/schemas/event";

// ─── Ownership & Auth ────────────────────────────────────────────────

/**
 * Verify that the authenticated user owns the specified event.
 * Throws 400 if eventId is missing, 404 if event not found, 403 if not the owner.
 */
export async function requireEventOwnership(
    event: H3Event<EventHandlerRequest>,
    eventId: string | undefined,
) {
    if (!eventId) {
        throw createError({
            statusCode: 400,
            statusMessage: "Missing eventId",
        });
    }

    const user = event.context.user;
    if (!user) {
        throw createError({
            statusCode: 401,
            statusMessage: "Unauthorized",
        });
    }

    const db = getDB();

    const rows = await db
        .select()
        .from(schema.events)
        .where(eq(schema.events.id, eventId))
        .limit(1);

    const eventRow = rows[0];

    if (!eventRow) {
        throw createError({
            statusCode: 404,
            statusMessage: "Event not found",
        });
    }

    if (eventRow.userId !== user.id) {
        throw createError({
            statusCode: 403,
            statusMessage: "You do not have permission to access this event",
        });
    }

    return eventRow;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Generate a URL-friendly slug from an event name.
 * Appends a random alphanumeric suffix to ensure uniqueness.
 */
export function generateEventSlug(name: string): string {
    const base = name
        .toLowerCase()
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);

    const suffix = Math.random().toString(36).substring(2, 8);
    return `${base}-${suffix}`;
}

// ─── CRUD ────────────────────────────────────────────────────────────

/**
 * List events for a user (owned + team member).
 */
export async function getUserEvents(userId: string) {
    const db = getDB();

    // Get IDs of events where user is a team member
    const memberEventIds = await db
        .select({ eventId: schema.eventUsers.eventId })
        .from(schema.eventUsers)
        .where(eq(schema.eventUsers.userId, userId));

    const memberIds = memberEventIds.map(r => r.eventId);

    const rows = await db
        .select({
            id: schema.events.id,
            name: schema.events.name,
            slug: schema.events.slug,
            description: schema.events.description,
            date: schema.events.date,
            time: schema.events.time,
            location: schema.events.location,
            primaryColor: schema.events.primaryColor,
            showGuestCount: schema.events.showGuestCount,
            socialProofEnabled: schema.events.socialProofEnabled,
            autoConfirmRegistration: schema.events.autoConfirmRegistration,
            createdAt: schema.events.createdAt,
        })
        .from(schema.events)
        .where(
            and(
                isNull(schema.events.deletedAt),
                memberIds.length > 0
                    ? or(
                        eq(schema.events.userId, userId),
                        sql`${schema.events.id} IN (${sql.join(memberIds.map(id => sql`${id}`), sql`, `)})`
                    )
                    : eq(schema.events.userId, userId)
            )
        )
        .orderBy(desc(schema.events.date));

    return { events: rows };
}

/**
 * Get event detail.
 */
export async function getEventById(h3Event: H3Event<EventHandlerRequest>, eventId: string) {
    const eventRow = await requireEventOwnership(h3Event, eventId);

    return { event: eventRow };
}

/**
 * Create a new event. Checks plan limits, generates slug, logs audit.
 */
export async function createEvent(h3Event: H3Event<EventHandlerRequest>, userId: string, input: CreateEventInput) {
    const db = getDB();

    const limitCheck = await canCreateEvent(userId);
    if (!limitCheck.allowed) {
        throw createError({
            statusCode: 403,
            statusMessage: `Event limit reached (${limitCheck.current}/${limitCheck.limit}). Upgrade your plan.`,
        });
    }

    const slug = generateEventSlug(input.name);

    const [created] = await db
        .insert(schema.events)
        .values({
            userId,
            name: input.name,
            slug,
            date: input.date,
            time: input.time ?? null,
            location: input.location ?? null,
            address: input.address ?? null,
            deadline: input.deadline ?? null,
            primaryColor: input.primaryColor,
            showGuestCount: input.showGuestCount,
            socialProofEnabled: input.socialProofEnabled,
            autoConfirmRegistration: input.autoConfirmRegistration,
        })
        .returning();

    await logAudit(h3Event, "event.created", {
        targetType: "event",
        targetId: created!.id,
        details: { name: input.name, slug },
    });

    return { event: created! };
}

/**
 * Update an event. Validates ownership, logs audit.
 */
export async function updateEvent(h3Event: H3Event<EventHandlerRequest>, eventId: string, input: UpdateEventInput) {
    await requireEventOwnership(h3Event, eventId);
    const db = getDB();

    const [updated] = await db
        .update(schema.events)
        .set(input)
        .where(eq(schema.events.id, eventId))
        .returning();

    await logAudit(h3Event, "event.updated", {
        targetType: "event",
        targetId: eventId,
        details: input as Record<string, unknown>,
    });

    return { event: updated };
}

/**
 * Delete an event. Validates ownership, logs audit.
 */
export async function deleteEvent(h3Event: H3Event<EventHandlerRequest>, eventId: string) {
    const eventRow = await requireEventOwnership(h3Event, eventId);
    const db = getDB();

    await db
        .update(schema.events)
        .set({ deletedAt: new Date() })
        .where(eq(schema.events.id, eventId));

    await logAudit(h3Event, "event.deleted", {
        targetType: "event",
        targetId: eventId,
        details: { name: eventRow.name },
    });

    return { success: true };
}
