/**
 * Distribution Repository — query Drizzle per l'invio inviti/reminder
 * (SPEC §6 "Distribuzione", owner B3).
 *
 * Le query lato organizzatore sono org-scoped BY-CONSTRUCTION (SPEC §8).
 * Le query lato job handler (findGuestForEmail / findReminderById) NON sono
 * org-scoped per design: il job QStash arriva con il solo guestId/reminderId,
 * e quegli id provengono ESCLUSIVAMENTE da payload accodati dal nostro server
 * dopo i guard RBAC (mai da input utente).
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDB } from "../utils/db";
import * as schema from "../database/schema";

/**
 * Ospiti selezionati per un invio: org+event scoped, SOLO attivi (non removed).
 * GuestId fuori scope (altra org/evento) o removed vengono semplicemente omessi.
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
 * Marca l'invio: sentAt SOLO se ancora null (è il "primo invio" per contratto),
 * sentChannel sempre aggiornato all'ultimo canale usato.
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
 * Guest + event (INNER JOIN) + eventuale responseId (LEFT JOIN) per i job
 * handler email. NON org-scoped: vedi nota in testa al file.
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
 * Reminder by id per il job handler 'send-reminder-email'.
 * NON org-scoped: stessa motivazione di findGuestForEmail.
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

/** Valori per l'insert bulk di attività ospite legate alla distribuzione. */
export interface GuestActivityValues {
    organizationId: string;
    eventId: string;
    guestId: string;
    type: "invite_sent" | "reminder_sent";
    meta: Record<string, unknown>;
}

/** Insert bulk append-only su guest_activities (timeline ospite). */
export async function insertActivities(values: GuestActivityValues[]): Promise<void> {
    const db = getDB();
    if (values.length === 0) return;
    await db.insert(schema.guestActivities).values(values);
}
