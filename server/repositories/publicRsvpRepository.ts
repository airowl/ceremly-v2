/**
 * Public RSVP Repository — Drizzle queries for public guest routes (SPEC §6, owner B2).
 *
 * DELIBERATE EXCEPTION to the org-scoped rule (SPEC §8 point 2): the guest has NO
 * account or organization; lookup happens ONLY by opaque token (unique index).
 * The token is crypto-random (10 char base62) and acts as a capability: whoever
 * holds it is the recipient. Derived writes (trackOpen, upsertResponse, activity)
 * use the ids (guestId/eventId/organizationId) from the row found via token,
 * never client input.
 */
import { and, eq, getTableColumns, isNull, sql } from "drizzle-orm";
import type { GuestActivityType, RsvpAnswers } from "~~/shared/types/ceremly";
import { getDB } from "../utils/db";
import * as schema from "../database/schema";

/**
 * Guest lookup by token with event joined in ONE query.
 * LEFT JOIN on the response (at most one: guestId UNIQUE) because the
 * public payload §6.2 includes it. undefined if the token does not exist.
 */
export async function findGuestWithEventByToken(token: string) {
    const db = getDB();
    const rows = await db
        .select({
            guest: schema.guests,
            event: schema.events,
            response: schema.rsvpResponses,
        })
        .from(schema.guests)
        .innerJoin(schema.events, eq(schema.events.id, schema.guests.eventId))
        .leftJoin(schema.rsvpResponses, eq(schema.rsvpResponses.guestId, schema.guests.id))
        .where(eq(schema.guests.token, token))
        .limit(1);
    return rows[0];
}

/**
 * Link open tracking: openCount+1 and, on first access, firstOpenedAt.
 * coalesce() preserves the first timestamp even with concurrent opens.
 */
export async function trackOpen(guestId: string, isFirst: boolean): Promise<void> {
    const db = getDB();
    await db
        .update(schema.guests)
        .set({
            openCount: sql`${schema.guests.openCount} + 1`,
            ...(isFirst
                ? { firstOpenedAt: sql`coalesce(${schema.guests.firstOpenedAt}, now())` }
                : {}),
        })
        .where(eq(schema.guests.id, guestId));
}

/** Values for the response upsert (ids taken from the row found via token). */
export interface UpsertResponseValues {
    organizationId: string;
    eventId: string;
    guestId: string;
    attending: string;
    companionsCount: number;
    answers: RsvpAnswers;
    declineMessage: string | null;
}

/**
 * Atomic upsert on rsvp_responses (guestId UNIQUE): insert, on conflict update
 * attending/companionsCount/answers/declineMessage. submittedAt stays as the
 * first submission's value; updatedAt is set explicitly in the update branch
 * (drizzle's $onUpdate does not fire inside onConflictDoUpdate).
 * `wasInsert` (xmax = 0, standard Postgres trick) tells if the row is new,
 * without extra queries or races: used for activity rsvp_submitted vs rsvp_updated.
 */
export async function upsertResponse(values: UpsertResponseValues) {
    const db = getDB();
    const rows = await db
        .insert(schema.rsvpResponses)
        .values(values)
        .onConflictDoUpdate({
            target: schema.rsvpResponses.guestId,
            set: {
                attending: values.attending,
                companionsCount: values.companionsCount,
                answers: values.answers,
                declineMessage: values.declineMessage,
                updatedAt: new Date(),
            },
        })
        .returning({
            ...getTableColumns(schema.rsvpResponses),
            wasInsert: sql<boolean>`(xmax = 0)`,
        });
    return rows[0];
}

/**
 * Email pixel: sets emailOpenedAt ONLY if still null (WHERE is null → idempotent
 * and race-safe). Returns true only on the first open (for the one-time activity).
 */
export async function markEmailOpened(guestId: string): Promise<boolean> {
    const db = getDB();
    const rows = await db
        .update(schema.guests)
        .set({ emailOpenedAt: new Date() })
        .where(
            and(
                eq(schema.guests.id, guestId),
                isNull(schema.guests.emailOpenedAt),
            ),
        )
        .returning({ id: schema.guests.id });
    return rows.length > 0;
}

/** Append to guest_activities (guest actions do NOT go into audit_log — SPEC §8.5). */
export async function insertActivity(
    organizationId: string,
    eventId: string,
    guestId: string,
    type: GuestActivityType,
    meta: Record<string, unknown> = {},
): Promise<void> {
    const db = getDB();
    await db
        .insert(schema.guestActivities)
        .values({ organizationId, eventId, guestId, type, meta });
}
