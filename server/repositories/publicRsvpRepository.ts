/**
 * Public RSVP Repository — query Drizzle per le route pubbliche ospite (SPEC §6, owner B2).
 *
 * ECCEZIONE CONSAPEVOLE alla regola org-scoped (SPEC §8 punto 2): l'ospite NON ha
 * account né organization; il lookup avviene SOLO per token opaco (unique index).
 * Il token è crypto-random (10 char base62) e funge da capability: chi lo possiede
 * è il destinatario. Le scritture derivate (trackOpen, upsertResponse, activity)
 * usano gli id (guestId/eventId/organizationId) della riga trovata via token,
 * mai input del client.
 */
import { and, eq, getTableColumns, isNull, sql } from "drizzle-orm";
import type { GuestActivityType, RsvpAnswers } from "~~/shared/types/ceremly";
import { getDB } from "../utils/db";
import * as schema from "../database/schema";

/**
 * Lookup ospite by token con evento joinato in UNA SOLA query.
 * LEFT JOIN sulla response (al più una: guestId UNIQUE) perché il payload
 * pubblico §6.2 la include. undefined se il token non esiste.
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
 * Tracking apertura link: openCount+1 e, al primo accesso, firstOpenedAt.
 * coalesce() preserva il primo timestamp anche con aperture concorrenti.
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

/** Valori per l'upsert della risposta (id presi dalla riga trovata via token). */
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
 * Upsert atomico su rsvp_responses (guestId UNIQUE): insert, on conflict update
 * di attending/companionsCount/answers/declineMessage. submittedAt resta quello
 * della prima compilazione; updatedAt è settato esplicitamente nel branch update
 * ($onUpdate di drizzle non scatta dentro onConflictDoUpdate).
 * `wasInsert` (xmax = 0, trick Postgres standard) dice se la riga è nuova,
 * senza query aggiuntive né race: serve per activity rsvp_submitted vs rsvp_updated.
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
 * Pixel email: set emailOpenedAt SOLO se ancora null (WHERE is null → idempotente
 * e race-safe). Ritorna true solo alla prima apertura (per l'activity una tantum).
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

/** Append su guest_activities (le azioni ospite NON vanno in audit_log — SPEC §8.5). */
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
