/**
 * Landing Service
 * Business logic for landing page and registration page data persistence.
 */
import type { H3Event, EventHandlerRequest } from "~~/server/types/h3";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import * as schema from "../database/schema";
import { getDB } from "../utils/db";
import { logAudit } from "../utils/audit";
import { requireEventOwnership } from "./event.service";
import { getDefaultLandingData } from "./event.service";
import type { SaveLandingInput } from "~~/shared/schemas/landing";

// ─── Get Landing Data ───────────────────────────────────────────────

/**
 * Retrieve the landing page data for an event.
 * Returns default RSVP landing data if no record exists yet.
 */
export async function getLandingData(
    h3Event: H3Event<EventHandlerRequest>,
    eventId: string,
) {
    await requireEventOwnership(h3Event, eventId);

    const db = getDB();

    const rows = await db
        .select()
        .from(schema.landingPages)
        .where(eq(schema.landingPages.eventId, eventId))
        .limit(1);

    if (rows.length === 0) {
        return { data: getDefaultLandingData("rsvp") };
    }

    return { data: rows[0]!.data };
}

// ─── Get Registration Data ──────────────────────────────────────────

/**
 * Retrieve the registration page data for an event.
 * Returns default registration landing data if no record exists yet.
 */
export async function getRegistrationData(
    h3Event: H3Event<EventHandlerRequest>,
    eventId: string,
) {
    await requireEventOwnership(h3Event, eventId);

    const db = getDB();

    const rows = await db
        .select()
        .from(schema.registrationPages)
        .where(eq(schema.registrationPages.eventId, eventId))
        .limit(1);

    if (rows.length === 0) {
        return { data: getDefaultLandingData("registration") };
    }

    return { data: rows[0]!.data };
}

// ─── Save Landing Data ──────────────────────────────────────────────

/**
 * Create or update the landing page data for an event.
 * Upserts: inserts a new record if none exists, updates if one does.
 */
export async function saveLandingData(
    h3Event: H3Event<EventHandlerRequest>,
    eventId: string,
    input: SaveLandingInput,
) {
    await requireEventOwnership(h3Event, eventId);

    const db = getDB();

    // Check if a landing page already exists for this event
    const existing = await db
        .select({ id: schema.landingPages.id })
        .from(schema.landingPages)
        .where(eq(schema.landingPages.eventId, eventId))
        .limit(1);

    let result;

    if (existing.length > 0) {
        // Update existing record
        const [updated] = await db
            .update(schema.landingPages)
            .set({ data: input.data })
            .where(eq(schema.landingPages.id, existing[0]!.id))
            .returning();
        result = updated!;
    } else {
        // Insert new record
        const [inserted] = await db
            .insert(schema.landingPages)
            .values({
                id: uuidv7(),
                eventId,
                data: input.data,
            })
            .returning();
        result = inserted!;
    }

    await logAudit(h3Event, "landing.updated", {
        targetType: "landing_page",
        targetId: result.id,
        details: { eventId, isNew: existing.length === 0 },
    });

    return { data: result.data };
}

// ─── Save Registration Settings ─────────────────────────────────────

/**
 * Create or update the registration page data for an event.
 * Upserts: inserts a new record if none exists, updates if one does.
 */
export async function saveRegistrationSettings(
    h3Event: H3Event<EventHandlerRequest>,
    eventId: string,
    input: SaveLandingInput,
) {
    await requireEventOwnership(h3Event, eventId);

    const db = getDB();

    // Check if a registration page already exists for this event
    const existing = await db
        .select({ id: schema.registrationPages.id })
        .from(schema.registrationPages)
        .where(eq(schema.registrationPages.eventId, eventId))
        .limit(1);

    let result;

    if (existing.length > 0) {
        // Update existing record
        const [updated] = await db
            .update(schema.registrationPages)
            .set({ data: input.data })
            .where(eq(schema.registrationPages.id, existing[0]!.id))
            .returning();
        result = updated!;
    } else {
        // Insert new record
        const [inserted] = await db
            .insert(schema.registrationPages)
            .values({
                id: uuidv7(),
                eventId,
                data: input.data,
            })
            .returning();
        result = inserted!;
    }

    await logAudit(h3Event, "registration.updated", {
        targetType: "registration_page",
        targetId: result.id,
        details: { eventId, isNew: existing.length === 0 },
    });

    return { data: result.data };
}
