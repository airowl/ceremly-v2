/**
 * Guest Service
 * Business logic for guest CRUD and bulk import operations.
 */
import type { H3Event, EventHandlerRequest } from "~~/server/types/h3";
import { eq, and, inArray, desc, or, ilike, count } from "drizzle-orm";
import * as schema from "../database/schema";
import { getDB } from "../utils/db";
import { logAudit } from "../utils/audit";
import { requireEventOwnership } from "./event.service";
import { canAddGuest, countEventGuests, getEffectiveLimits } from "./planLimit.service";
import { exceedsLimit, isUnlimited } from "~~/shared/constants/pricing";
import type { CreateGuestInput, UpdateGuestInput, ImportGuestsInput, GuestFilter } from "~~/shared/schemas/guest";

// ─── Get Event Guests ───────────────────────────────────────────────

/**
 * List guests for an event with optional filters.
 * Returns the guest list and summary counts (always unfiltered).
 */
export async function getEventGuests(
    h3Event: H3Event<EventHandlerRequest>,
    eventId: string,
    filters: GuestFilter,
) {
    await requireEventOwnership(h3Event, eventId);

    const db = getDB();

    // Build WHERE conditions
    const conditions = [eq(schema.guests.eventId, eventId)];

    if (filters.status) {
        conditions.push(eq(schema.guests.status, filters.status));
    }

    if (filters.source) {
        conditions.push(eq(schema.guests.source, filters.source));
    }

    if (filters.search) {
        const searchPattern = `%${filters.search}%`;
        conditions.push(
            or(
                ilike(schema.guests.name, searchPattern),
                ilike(schema.guests.email, searchPattern),
                ilike(schema.guests.group, searchPattern),
            )!,
        );
    }

    // Fetch guests
    const guestList = await db
        .select()
        .from(schema.guests)
        .where(and(...conditions))
        .orderBy(desc(schema.guests.createdAt));

    // Fetch summary counts (always unfiltered for the event)
    const summaryRows = await db
        .select({
            status: schema.guests.status,
            count: count(),
        })
        .from(schema.guests)
        .where(eq(schema.guests.eventId, eventId))
        .groupBy(schema.guests.status);

    const summary = { total: 0, confirmed: 0, pending: 0, declined: 0 };
    for (const row of summaryRows) {
        const c = Number(row.count);
        summary.total += c;
        if (row.status === "yes") summary.confirmed = c;
        else if (row.status === "pending") summary.pending = c;
        else if (row.status === "no") summary.declined = c;
    }

    return {
        guests: guestList,
        summary,
    };
}

// ─── Add Guest ──────────────────────────────────────────────────────

/**
 * Add a single guest manually.
 * Checks ownership, validates plan limits, inserts, and logs audit.
 */
export async function addGuest(
    h3Event: H3Event<EventHandlerRequest>,
    eventId: string,
    userId: string,
    input: CreateGuestInput,
) {
    await requireEventOwnership(h3Event, eventId);

    // Check plan limit
    const limitCheck = await canAddGuest(userId, eventId);
    if (!limitCheck.allowed) {
        throw createError({
            statusCode: 403,
            statusMessage: `Guest limit reached (${limitCheck.current}/${limitCheck.limit}). Upgrade your plan to add more guests.`,
        });
    }

    const db = getDB();

    const [inserted] = await db
        .insert(schema.guests)
        .values({
            eventId,
            name: input.name,
            email: input.email ?? null,
            phone: input.phone ?? null,
            group: input.group ?? null,
            source: "manual",
            status: "pending",
        })
        .returning();

    await logAudit(h3Event, "guest.created", {
        targetType: "guest",
        targetId: inserted!.id,
        details: { name: input.name, eventId },
    });

    return inserted!;
}

// ─── Update Guest ───────────────────────────────────────────────────

/**
 * Update a guest's details.
 * Checks ownership, verifies guest belongs to event, applies partial update.
 */
export async function updateGuest(
    h3Event: H3Event<EventHandlerRequest>,
    eventId: string,
    guestId: string,
    input: UpdateGuestInput,
) {
    await requireEventOwnership(h3Event, eventId);

    const db = getDB();

    // Verify guest belongs to this event
    const existing = await db
        .select({ id: schema.guests.id })
        .from(schema.guests)
        .where(and(eq(schema.guests.id, guestId), eq(schema.guests.eventId, eventId)))
        .limit(1);

    if (!existing.length) {
        throw createError({
            statusCode: 404,
            statusMessage: "Guest not found in this event",
        });
    }

    // Build update payload, only including provided fields
    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.email !== undefined) updateData.email = input.email;
    if (input.phone !== undefined) updateData.phone = input.phone;
    if (input.group !== undefined) updateData.group = input.group;
    if (input.customFields !== undefined) updateData.customFields = input.customFields;

    if (input.status !== undefined) {
        updateData.status = input.status;
        // If status changed to yes/no, record the response timestamp
        if (input.status === "yes" || input.status === "no") {
            updateData.respondedAt = new Date();
        }
    }

    if (Object.keys(updateData).length === 0) {
        throw createError({
            statusCode: 400,
            statusMessage: "No fields to update",
        });
    }

    const [updated] = await db
        .update(schema.guests)
        .set(updateData)
        .where(eq(schema.guests.id, guestId))
        .returning();

    await logAudit(h3Event, "guest.updated", {
        targetType: "guest",
        targetId: guestId,
        details: updateData as Record<string, unknown>,
    });

    return updated;
}

// ─── Delete Guest ───────────────────────────────────────────────────

/**
 * Delete a guest from an event.
 * Checks ownership, verifies guest belongs to event, deletes, logs audit.
 */
export async function deleteGuest(
    h3Event: H3Event<EventHandlerRequest>,
    eventId: string,
    guestId: string,
) {
    await requireEventOwnership(h3Event, eventId);

    const db = getDB();

    // Verify guest belongs to this event before deleting
    const existing = await db
        .select({ id: schema.guests.id, name: schema.guests.name })
        .from(schema.guests)
        .where(and(eq(schema.guests.id, guestId), eq(schema.guests.eventId, eventId)))
        .limit(1);

    if (!existing.length) {
        throw createError({
            statusCode: 404,
            statusMessage: "Guest not found in this event",
        });
    }

    await db.delete(schema.guests).where(eq(schema.guests.id, guestId));

    await logAudit(h3Event, "guest.deleted", {
        targetType: "guest",
        targetId: guestId,
        details: { name: existing[0]!.name, eventId },
    });

    return { success: true };
}

// ─── Import Guests ──────────────────────────────────────────────────

/**
 * Bulk import guests from parsed CSV data.
 * Checks ownership, validates plan limits, deduplicates by email, batch inserts.
 */
export async function importGuests(
    h3Event: H3Event<EventHandlerRequest>,
    eventId: string,
    userId: string,
    input: ImportGuestsInput,
) {
    await requireEventOwnership(h3Event, eventId);

    const incoming = input.guests;

    // Check plan limit: current + new must not exceed max
    const effectiveInfo = await getEffectiveLimits(userId);
    const currentCount = await countEventGuests(eventId);
    const limit = effectiveInfo.limits.max_guests_per_event;

    if (!isUnlimited(limit) && currentCount + incoming.length > limit) {
        const available = Math.max(0, limit - currentCount);
        throw createError({
            statusCode: 403,
            statusMessage: `Cannot import ${incoming.length} guests. Current: ${currentCount}, limit: ${limit}, available: ${available}. Upgrade your plan for more capacity.`,
        });
    }

    const db = getDB();

    // Gather incoming emails (non-empty) for duplicate detection
    const incomingEmails = incoming
        .map((g) => g.email?.toLowerCase().trim())
        .filter((e): e is string => !!e && e.length > 0);

    // Fetch existing emails in this event for duplicate check
    let existingEmails = new Set<string>();
    if (incomingEmails.length > 0) {
        const existing = await db
            .select({ email: schema.guests.email })
            .from(schema.guests)
            .where(
                and(
                    eq(schema.guests.eventId, eventId),
                    inArray(schema.guests.email, incomingEmails),
                ),
            );
        existingEmails = new Set(
            existing
                .map((r) => r.email?.toLowerCase().trim())
                .filter((e): e is string => !!e),
        );
    }

    const toInsert: Array<{
        eventId: string;
        name: string;
        email: string | null;
        phone: string | null;
        group: string | null;
        source: "csv";
        status: "pending";
    }> = [];
    const errors: string[] = [];
    let duplicates = 0;
    const seenEmails = new Set<string>();

    for (let i = 0; i < incoming.length; i++) {
        const row = incoming[i]!;
        const email = row.email?.toLowerCase().trim() || null;

        // Check for duplicate by email (against existing guests and within the batch)
        if (email) {
            if (existingEmails.has(email)) {
                duplicates++;
                continue;
            }
            if (seenEmails.has(email)) {
                duplicates++;
                continue;
            }
            seenEmails.add(email);
        }

        toInsert.push({
            eventId,
            name: row.name,
            email: email,
            phone: row.phone?.trim() || null,
            group: row.group?.trim() || null,
            source: "csv",
            status: "pending",
        });
    }

    // Re-check limit after deduplication
    if (!isUnlimited(limit) && currentCount + toInsert.length > limit) {
        const available = Math.max(0, limit - currentCount);
        throw createError({
            statusCode: 403,
            statusMessage: `After removing duplicates, ${toInsert.length} guests would be imported but only ${available} slots available. Upgrade your plan.`,
        });
    }

    // Batch insert
    let imported = 0;
    if (toInsert.length > 0) {
        await db.insert(schema.guests).values(toInsert);
        imported = toInsert.length;
    }

    await logAudit(h3Event, "guest.imported", {
        targetType: "guest",
        targetId: eventId,
        details: { imported, duplicates, total: incoming.length },
    });

    return {
        imported,
        duplicates,
        errors,
    };
}
