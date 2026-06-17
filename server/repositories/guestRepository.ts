/**
 * Guest Repository — query Drizzle per gli ospiti Ceremly (SPEC §6, owner B1).
 *
 * Tutte le query sono org-scoped BY-CONSTRUCTION (WHERE organizationId) e,
 * dove ha senso, anche event-scoped (WHERE eventId): un guestId di un altro
 * evento/org non viene mai restituito.
 */
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getDB } from "../utils/db";
import * as schema from "../database/schema";

/** Valori per l'insert di un ospite (token generato dal service). */
export interface CreateGuestValues {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    groupName: string | null;
    notes: string | null;
    token: string;
}

/**
 * Tutti gli ospiti di un evento (ANCHE i removed, flag `removedAt`) con
 * l'eventuale response joinata (LEFT JOIN, ogni guest ha al più 1 response).
 */
export async function findGuestsByEventWithResponse(organizationId: string, eventId: string) {
    const db = getDB();
    return db
        .select({
            guest: schema.guests,
            responseId: schema.rsvpResponses.id,
            attending: schema.rsvpResponses.attending,
            companionsCount: schema.rsvpResponses.companionsCount,
            answers: schema.rsvpResponses.answers,
            declineMessage: schema.rsvpResponses.declineMessage,
            submittedAt: schema.rsvpResponses.submittedAt,
            responseUpdatedAt: schema.rsvpResponses.updatedAt,
        })
        .from(schema.guests)
        .leftJoin(schema.rsvpResponses, eq(schema.rsvpResponses.guestId, schema.guests.id))
        .where(
            and(
                eq(schema.guests.organizationId, organizationId),
                eq(schema.guests.eventId, eventId),
            ),
        )
        .orderBy(asc(schema.guests.createdAt));
}

/** Fetch singolo ospite scoped org+evento: undefined se fuori scope (no leak). */
export async function findGuestByIdScoped(
    organizationId: string,
    eventId: string,
    guestId: string,
) {
    const db = getDB();
    const rows = await db
        .select()
        .from(schema.guests)
        .where(
            and(
                eq(schema.guests.id, guestId),
                eq(schema.guests.organizationId, organizationId),
                eq(schema.guests.eventId, eventId),
            ),
        )
        .limit(1);
    return rows[0];
}

/** Crea un ospite. Lancia 23505 su collisione token (retry nel service). */
export async function createGuestRow(
    organizationId: string,
    eventId: string,
    values: CreateGuestValues,
) {
    const db = getDB();
    const rows = await db
        .insert(schema.guests)
        .values({ organizationId, eventId, ...values })
        .returning();
    return rows[0];
}

/** Insert bulk (import CSV): una sola statement, returning per il conteggio.
 *  Lancia 23505 su collisione token (rigenerazione + retry nel service). */
export async function createGuestsBulk(
    organizationId: string,
    eventId: string,
    values: CreateGuestValues[],
) {
    const db = getDB();
    if (values.length === 0) return [];
    return db
        .insert(schema.guests)
        .values(values.map((v) => ({ organizationId, eventId, ...v })))
        .returning({ id: schema.guests.id });
}

/** Update scoped (il token NON è mai nel patch: immutabile per contratto). */
export async function updateGuestScoped(
    organizationId: string,
    eventId: string,
    guestId: string,
    patch: Partial<typeof schema.guests.$inferInsert>,
) {
    const db = getDB();
    if (Object.keys(patch).length === 0) {
        // No-op idempotente: evita `.set({})` (drizzle "No values to set" → 500).
        return findGuestByIdScoped(organizationId, eventId, guestId);
    }
    const rows = await db
        .update(schema.guests)
        .set(patch)
        .where(
            and(
                eq(schema.guests.id, guestId),
                eq(schema.guests.organizationId, organizationId),
                eq(schema.guests.eventId, eventId),
            ),
        )
        .returning();
    return rows[0];
}

/** Soft-delete: set removedAt (link inattivo, risposta conservata — PRD edge case). */
export async function softDeleteGuestScoped(
    organizationId: string,
    eventId: string,
    guestId: string,
) {
    const db = getDB();
    const rows = await db
        .update(schema.guests)
        .set({ removedAt: new Date() })
        .where(
            and(
                eq(schema.guests.id, guestId),
                eq(schema.guests.organizationId, organizationId),
                eq(schema.guests.eventId, eventId),
            ),
        )
        .returning();
    return rows[0];
}

/** Conteggio ospiti ATTIVI (non removed) per l'enforcement del limite Free. */
export async function countActiveGuests(organizationId: string, eventId: string): Promise<number> {
    const db = getDB();
    const rows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.guests)
        .where(
            and(
                eq(schema.guests.organizationId, organizationId),
                eq(schema.guests.eventId, eventId),
                isNull(schema.guests.removedAt),
            ),
        );
    return rows[0]?.count ?? 0;
}

/** Nomi degli ospiti attivi (per i warning di duplicato nell'import bulk). */
export async function findActiveGuestNames(organizationId: string, eventId: string) {
    const db = getDB();
    return db
        .select({
            firstName: schema.guests.firstName,
            lastName: schema.guests.lastName,
        })
        .from(schema.guests)
        .where(
            and(
                eq(schema.guests.organizationId, organizationId),
                eq(schema.guests.eventId, eventId),
                isNull(schema.guests.removedAt),
            ),
        );
}

/** Email (lowercase) degli ospiti attivi con email — per la dedup dell'import bulk. */
export async function findActiveGuestEmails(organizationId: string, eventId: string): Promise<string[]> {
    const db = getDB();
    const rows = await db
        .select({ email: schema.guests.email })
        .from(schema.guests)
        .where(
            and(
                eq(schema.guests.organizationId, organizationId),
                eq(schema.guests.eventId, eventId),
                isNull(schema.guests.removedAt),
                sql`${schema.guests.email} IS NOT NULL`,
            ),
        );
    return rows.map((r) => (r.email as string).toLowerCase());
}

/** True se esiste già un ospite ATTIVO con quell'email (case-insensitive) nell'evento. */
export async function activeGuestEmailExists(
    organizationId: string,
    eventId: string,
    email: string,
): Promise<boolean> {
    const db = getDB();
    const rows = await db
        .select({ id: schema.guests.id })
        .from(schema.guests)
        .where(
            and(
                eq(schema.guests.organizationId, organizationId),
                eq(schema.guests.eventId, eventId),
                isNull(schema.guests.removedAt),
                sql`lower(${schema.guests.email}) = ${email.toLowerCase()}`,
            ),
        )
        .limit(1);
    return rows.length > 0;
}

/** Ultima response di un ospite (al più una: guestId UNIQUE su rsvp_responses). */
export async function findResponseByGuestScoped(organizationId: string, guestId: string) {
    const db = getDB();
    const rows = await db
        .select()
        .from(schema.rsvpResponses)
        .where(
            and(
                eq(schema.rsvpResponses.guestId, guestId),
                eq(schema.rsvpResponses.organizationId, organizationId),
            ),
        )
        .limit(1);
    return rows[0];
}

/** Attività di un ospite, le più recenti prima (timeline dettaglio ospite). */
export async function findActivitiesByGuestScoped(organizationId: string, guestId: string) {
    const db = getDB();
    return db
        .select()
        .from(schema.guestActivities)
        .where(
            and(
                eq(schema.guestActivities.guestId, guestId),
                eq(schema.guestActivities.organizationId, organizationId),
            ),
        )
        .orderBy(desc(schema.guestActivities.createdAt));
}
