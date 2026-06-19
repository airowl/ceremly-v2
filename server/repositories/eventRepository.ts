/**
 * Event Repository — query Drizzle per gli eventi Ceremly (SPEC §6, owner B1).
 *
 * Tutte le query sono org-scoped BY-CONSTRUCTION (WHERE organizationId),
 * pattern projectRepository: mai una query che possa restituire dati di
 * un'altra organization.
 */
import { and, desc, eq, isNull, lt, ne, sql } from "drizzle-orm";
import { getDB } from "../utils/db";
import * as schema from "../database/schema";
import type { EventDistribution, InviteBlock, RsvpQuestion } from "~~/shared/types/ceremly";

/** Valori completi per l'insert di un evento (preparati dal service). */
export interface CreateEventValues {
    type: string;
    templateKey: string;
    title: string;
    slug: string;
    eventDate: Date | null;
    eventTime: string | null;
    locationName: string | null;
    locationAddress: string | null;
    status: string;
    blocks: InviteBlock[];
    rsvpConfig: RsvpQuestion[];
    rsvpClosedMessage: string;
    distribution: EventDistribution;
}

/** Conteggi grezzi aggregati per evento (il service deriva `pending`). */
export interface EventRawCounts {
    guests: number;
    confirmed: number;
    declined: number;
    maybe: number;
    responded: number;
    opened: number;
    sent: number;
}

/**
 * Lista eventi dell'org con conteggi aggregati in UNA SOLA query:
 * LEFT JOIN guests (esclusi i removed) + rsvp_responses, aggregati con
 * `count(...) filter (where ...)`. Ogni guest ha al più 1 response
 * (guestId UNIQUE) → nessuna moltiplicazione di righe per ospite.
 */
export async function findEventsByOrgWithCounts(organizationId: string) {
    const db = getDB();
    return db
        .select({
            event: schema.events,
            guests: sql<number>`count(${schema.guests.id})::int`,
            confirmed: sql<number>`(count(${schema.guests.id}) filter (where ${schema.rsvpResponses.attending} = 'yes'))::int`,
            declined: sql<number>`(count(${schema.guests.id}) filter (where ${schema.rsvpResponses.attending} = 'no'))::int`,
            maybe: sql<number>`(count(${schema.guests.id}) filter (where ${schema.rsvpResponses.attending} = 'maybe'))::int`,
            responded: sql<number>`(count(${schema.guests.id}) filter (where ${schema.rsvpResponses.id} is not null))::int`,
            opened: sql<number>`(count(${schema.guests.id}) filter (where ${schema.guests.firstOpenedAt} is not null))::int`,
            sent: sql<number>`(count(${schema.guests.id}) filter (where ${schema.guests.sentAt} is not null))::int`,
        })
        .from(schema.events)
        .leftJoin(
            schema.guests,
            and(eq(schema.guests.eventId, schema.events.id), isNull(schema.guests.removedAt)),
        )
        .leftJoin(schema.rsvpResponses, eq(schema.rsvpResponses.guestId, schema.guests.id))
        .where(eq(schema.events.organizationId, organizationId))
        .groupBy(schema.events.id)
        .orderBy(desc(schema.events.createdAt));
}

/** Fetch singolo evento scoped: undefined se di un'altra org (no leak). */
export async function findEventByIdScoped(organizationId: string, id: string) {
    const db = getDB();
    const rows = await db
        .select()
        .from(schema.events)
        .where(
            and(
                eq(schema.events.id, id),
                eq(schema.events.organizationId, organizationId),
            ),
        )
        .limit(1);
    return rows[0];
}

/** Crea un evento nell'org indicata. Lancia 23505 su collisione slug (retry nel service). */
export async function createEventRow(organizationId: string, values: CreateEventValues) {
    const db = getDB();
    const rows = await db
        .insert(schema.events)
        .values({ organizationId, ...values })
        .returning();
    return rows[0];
}

/** Update scoped: aggiorna solo se l'evento appartiene all'org. */
export async function updateEventScoped(
    organizationId: string,
    id: string,
    patch: Partial<typeof schema.events.$inferInsert>,
) {
    const db = getDB();
    if (Object.keys(patch).length === 0) {
        // No-op idempotente: evita `.set({})` (drizzle "No values to set" → 500).
        return findEventByIdScoped(organizationId, id);
    }
    const rows = await db
        .update(schema.events)
        .set(patch)
        .where(
            and(
                eq(schema.events.id, id),
                eq(schema.events.organizationId, organizationId),
            ),
        )
        .returning();
    return rows[0];
}

/** Hard delete scoped (cascade su guests/responses/activities/reminders). */
export async function deleteEventScoped(organizationId: string, id: string) {
    const db = getDB();
    const rows = await db
        .delete(schema.events)
        .where(
            and(
                eq(schema.events.id, id),
                eq(schema.events.organizationId, organizationId),
            ),
        )
        .returning({ id: schema.events.id });
    return rows[0];
}

/**
 * Conta gli eventi "attivi" dell'org per il limite Free: status != 'closed'
 * AND tier = 'free'. Gli eventi sbloccati (tier='celebration') NON consumano lo
 * slot Free (design §2.2): dopo aver pagato un evento, l'utente Free può crearne
 * un altro di prova.
 */
export async function countActiveEventsByOrg(organizationId: string): Promise<number> {
    const db = getDB();
    const rows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.events)
        .where(
            and(
                eq(schema.events.organizationId, organizationId),
                ne(schema.events.status, "closed"),
                eq(schema.events.tier, "free"),
            ),
        );
    return rows[0]?.count ?? 0;
}

// ---------------------------------------------------------------------------
// Stats (SPEC §6.1)
// ---------------------------------------------------------------------------

/** Aggregato KPI in una query: ospiti attivi LEFT JOIN responses. */
export async function getEventKpiAggregates(organizationId: string, eventId: string) {
    const db = getDB();
    const rows = await db
        .select({
            totalGuests: sql<number>`count(${schema.guests.id})::int`,
            sent: sql<number>`(count(${schema.guests.id}) filter (where ${schema.guests.sentAt} is not null))::int`,
            opened: sql<number>`(count(${schema.guests.id}) filter (where ${schema.guests.firstOpenedAt} is not null))::int`,
            responded: sql<number>`(count(${schema.guests.id}) filter (where ${schema.rsvpResponses.id} is not null))::int`,
            confirmed: sql<number>`(count(${schema.guests.id}) filter (where ${schema.rsvpResponses.attending} = 'yes'))::int`,
            declined: sql<number>`(count(${schema.guests.id}) filter (where ${schema.rsvpResponses.attending} = 'no'))::int`,
            maybe: sql<number>`(count(${schema.guests.id}) filter (where ${schema.rsvpResponses.attending} = 'maybe'))::int`,
            totalPeople: sql<number>`coalesce(sum(1 + ${schema.rsvpResponses.companionsCount}) filter (where ${schema.rsvpResponses.attending} = 'yes'), 0)::int`,
            noEmailPending: sql<number>`(count(${schema.guests.id}) filter (where (${schema.guests.email} is null or ${schema.guests.email} = '') and ${schema.rsvpResponses.id} is null))::int`,
        })
        .from(schema.guests)
        .leftJoin(schema.rsvpResponses, eq(schema.rsvpResponses.guestId, schema.guests.id))
        .where(
            and(
                eq(schema.guests.organizationId, organizationId),
                eq(schema.guests.eventId, eventId),
                isNull(schema.guests.removedAt),
            ),
        );
    return rows[0];
}

/**
 * Tutte le response dell'evento (solo ospiti attivi) per le aggregazioni in
 * TypeScript nel service: timeline 28gg, menuBreakdown, allergies (SPEC §6.1).
 * L'aggregazione delle `answers` jsonb è fatta in TS, non in SQL.
 */
export async function findResponsesForStats(organizationId: string, eventId: string) {
    const db = getDB();
    return db
        .select({
            attending: schema.rsvpResponses.attending,
            companionsCount: schema.rsvpResponses.companionsCount,
            answers: schema.rsvpResponses.answers,
            submittedAt: schema.rsvpResponses.submittedAt,
            updatedAt: schema.rsvpResponses.updatedAt,
        })
        .from(schema.rsvpResponses)
        .innerJoin(schema.guests, eq(schema.guests.id, schema.rsvpResponses.guestId))
        .where(
            and(
                eq(schema.rsvpResponses.organizationId, organizationId),
                eq(schema.rsvpResponses.eventId, eventId),
                isNull(schema.guests.removedAt),
            ),
        );
}

/**
 * Ospiti "da contattare": hanno aperto il link prima di `openedBefore`
 * (> 7 giorni fa) ma non hanno mai risposto. Max `limit`, i più vecchi prima.
 */
export async function findNeedsAttentionGuests(
    organizationId: string,
    eventId: string,
    openedBefore: Date,
    limit = 10,
) {
    const db = getDB();
    return db
        .select({
            id: schema.guests.id,
            firstName: schema.guests.firstName,
            lastName: schema.guests.lastName,
            email: schema.guests.email,
            phone: schema.guests.phone,
            firstOpenedAt: schema.guests.firstOpenedAt,
        })
        .from(schema.guests)
        .leftJoin(schema.rsvpResponses, eq(schema.rsvpResponses.guestId, schema.guests.id))
        .where(
            and(
                eq(schema.guests.organizationId, organizationId),
                eq(schema.guests.eventId, eventId),
                isNull(schema.guests.removedAt),
                isNull(schema.rsvpResponses.id),
                lt(schema.guests.firstOpenedAt, openedBefore),
            ),
        )
        .orderBy(schema.guests.firstOpenedAt)
        .limit(limit);
}
