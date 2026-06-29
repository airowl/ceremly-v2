/**
 * Distribution Repository — Drizzle queries for invite/reminder delivery
 * (SPEC §6 "Distribuzione", owner B3).
 *
 * Organizer-side queries are org-scoped BY-CONSTRUCTION (SPEC §8).
 * Job handler queries (findGuestForEmail / findReminderById) are NOT
 * org-scoped by design: the QStash job arrives with only guestId/reminderId,
 * and those ids come EXCLUSIVELY from payloads enqueued by our server
 * after RBAC guards (never from user input).
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDB } from "../utils/db";
import * as schema from "../database/schema";

/**
 * Guests selected for a send: org+event scoped, ONLY active (not removed).
 * GuestIds out of scope (other org/event) or removed are simply omitted.
 */
export async function findGuestsForSend(
    organizationId: string,
    eventId: string,
    guestIds: string[],
) {
    const db = getDB();
    if (guestIds.length === 0) return [];
    return db
        .select()
        .from(schema.guests)
        .where(
            and(
                eq(schema.guests.organizationId, organizationId),
                eq(schema.guests.eventId, eventId),
                inArray(schema.guests.id, guestIds),
                isNull(schema.guests.removedAt),
            ),
        );
}

/**
 * Marks the send: sentAt ONLY if still null (it is the "first send" by contract),
 * sentChannel always updated to the last channel used.
 */
export async function markSent(
    organizationId: string,
    guestIds: string[],
    channel: "email" | "whatsapp",
) {
    const db = getDB();
    if (guestIds.length === 0) return [];
    return db
        .update(schema.guests)
        .set({
            sentAt: sql`COALESCE(${schema.guests.sentAt}, now())`,
            sentChannel: channel,
        })
        .where(
            and(
                eq(schema.guests.organizationId, organizationId),
                inArray(schema.guests.id, guestIds),
            ),
        )
        .returning({ id: schema.guests.id });
}

/**
 * Guest + event (INNER JOIN) + optional responseId (LEFT JOIN) for email job
 * handlers. NOT org-scoped: see note at the top of the file.
 */
export async function findGuestForEmail(guestId: string) {
    const db = getDB();
    const rows = await db
        .select({
            guest: schema.guests,
            event: schema.events,
            responseId: schema.rsvpResponses.id,
        })
        .from(schema.guests)
        .innerJoin(schema.events, eq(schema.guests.eventId, schema.events.id))
        .leftJoin(schema.rsvpResponses, eq(schema.rsvpResponses.guestId, schema.guests.id))
        .where(eq(schema.guests.id, guestId))
        .limit(1);
    return rows[0];
}

/**
 * Reminder by id for the 'send-reminder-email' job handler.
 * NOT org-scoped: same rationale as findGuestForEmail.
 */
export async function findReminderById(reminderId: string) {
    const db = getDB();
    const rows = await db
        .select()
        .from(schema.eventReminders)
        .where(eq(schema.eventReminders.id, reminderId))
        .limit(1);
    return rows[0];
}

/** Values for the bulk insert of guest activities related to distribution. */
export interface GuestActivityValues {
    organizationId: string;
    eventId: string;
    guestId: string;
    type: "invite_sent" | "reminder_sent";
    meta: Record<string, unknown>;
}

/** Append-only bulk insert on guest_activities (guest timeline). */
export async function insertActivities(values: GuestActivityValues[]): Promise<void> {
    const db = getDB();
    if (values.length === 0) return;
    await db.insert(schema.guestActivities).values(values);
}

/**
 * True if a 'reminder_sent' activity already exists for (guest, reminder).
 * Idempotency guard for QStash retries of the reminder email: the handler
 * writes 'reminder_sent' ONLY on successful delivery, so its presence means
 * "already sent to this guest for this reminder".
 */
export async function hasReminderActivity(guestId: string, reminderId: string): Promise<boolean> {
    const db = getDB();
    const rows = await db
        .select({ id: schema.guestActivities.id })
        .from(schema.guestActivities)
        .where(
            and(
                eq(schema.guestActivities.guestId, guestId),
                eq(schema.guestActivities.type, "reminder_sent"),
                sql`${schema.guestActivities.meta}->>'reminderId' = ${reminderId}`,
            ),
        )
        .limit(1);
    return rows.length > 0;
}
