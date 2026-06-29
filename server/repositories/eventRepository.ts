/**
 * Event Repository — Drizzle queries for Ceremly events (SPEC §6, owner B1).
 *
 * All queries are org-scoped BY-CONSTRUCTION (WHERE organizationId),
 * following the projectRepository pattern: no query can ever return data from
 * another organization.
 */
import { and, desc, eq, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { getDB } from "../utils/db";
import * as schema from "../database/schema";
import type { EventDistribution, InviteBlock, RsvpQuestion } from "~~/shared/types/ceremly";

/** Full values for inserting an event (prepared by the service). */
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

/** Raw aggregated counts per event (the service derives `pending`). */
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
 * Lists org events with aggregated counts in ONE query:
 * LEFT JOIN guests (excluding removed) + rsvp_responses, aggregated with
 * `count(...) filter (where ...)`. Each guest has at most 1 response
 * (guestId UNIQUE) → no row multiplication per guest.
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

/** Single scoped event fetch: undefined if it belongs to another org (no leak). */
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

/**
 * Public fetch by slug (NO org scope): used ONLY by the signed preview
 * (`/api/public/preview`, authorized by HMAC). Guest routes remain
 * token-only. undefined if the slug does not exist.
 */
export async function findEventBySlug(slug: string) {
    const db = getDB();
    const rows = await db
        .select()
        .from(schema.events)
        .where(eq(schema.events.slug, slug))
        .limit(1);
    return rows[0];
}

/** Creates an event in the given org. Throws 23505 on slug collision (retry in the service). */
export async function createEventRow(organizationId: string, values: CreateEventValues) {
    const db = getDB();
    const rows = await db
        .insert(schema.events)
        .values({ organizationId, ...values })
        .returning();
    return rows[0];
}

/** Scoped update: updates only if the event belongs to the org.
 *
 * FIX 7.4 — Activity reset: every organizer update will reset cleanupWarnedAt
 * to NULL. This way, if the event becomes stale again after activity, the cleanup
 * cron will warn it with a fresh 7-day notice instead of deleting it without
 * warning (regression: cleanupWarnedAt was never reset after the first warn).
 * The no-op guard (empty patch) is preserved: no write without real changes.
 */
export async function updateEventScoped(
    organizationId: string,
    id: string,
    patch: Partial<typeof schema.events.$inferInsert>,
) {
    const db = getDB();
    if (Object.keys(patch).length === 0) {
        // Idempotent no-op: avoids `.set({})` (drizzle "No values to set" → 500).
        return findEventByIdScoped(organizationId, id);
    }
    const rows = await db
        .update(schema.events)
        .set({ ...patch, cleanupWarnedAt: null })
        .where(
            and(
                eq(schema.events.id, id),
                eq(schema.events.organizationId, organizationId),
            ),
        )
        .returning();
    return rows[0];
}

/**
 * Resets cleanupWarnedAt → NULL when a guest submits/updates their RSVP.
 * Org-scoped (guard: organizationId + eventId). The reset ensures that the event,
 * if it becomes stale again, receives a NEW 7-day warning instead of being
 * deleted immediately (FIX 7.4 — RSVP activity path).
 */
export async function clearEventCleanupWarned(
    organizationId: string,
    eventId: string,
): Promise<void> {
    const db = getDB();
    await db
        .update(schema.events)
        .set({ cleanupWarnedAt: null })
        .where(
            and(
                eq(schema.events.id, eventId),
                eq(schema.events.organizationId, organizationId),
            ),
        );
}

/** Scoped hard delete (cascades to guests/responses/activities/reminders). */
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
 * Counts the org's "active" events for the Free plan limit: status != 'closed'
 * AND tier = 'free'. Unlocked events (tier='celebration') do NOT consume the
 * Free slot (design §2.2): after paying for an event, a Free user can create
 * another trial one.
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

/** KPI aggregate in one query: active guests LEFT JOIN responses. */
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
 * All responses for the event (active guests only) for TypeScript aggregations
 * in the service: 28-day timeline, menuBreakdown, allergies (SPEC §6.1).
 * The `answers` jsonb aggregation is done in TS, not in SQL.
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

// ---------------------------------------------------------------------------
// Checkout id persistence (SPEC §6.2 / fix 7.2) — for reconciliation
// ---------------------------------------------------------------------------

/**
 * Persists the Creem checkoutId on the event at checkout creation time.
 * Idempotent: the UPDATE without a WHERE on tier limits the effect to existing org events.
 * The checkoutId is then used by reconcileEventUnlock for recovery via retrieveCheckout.
 */
export async function setEventCheckoutId(
    eventId: string,
    organizationId: string,
    checkoutId: string,
): Promise<void> {
    const db = getDB();
    await db
        .update(schema.events)
        .set({ creemCheckoutId: checkoutId })
        .where(
            and(
                eq(schema.events.id, eventId),
                eq(schema.events.organizationId, organizationId),
            ),
        );
}

/**
 * Reads tier and creemCheckoutId for reconciliation.
 * Undefined if the event does not belong to the org (org-scoped, no leak).
 */
export async function getEventCheckoutInfo(
    eventId: string,
    organizationId: string,
): Promise<{ tier: string; creemCheckoutId: string | null } | undefined> {
    const db = getDB();
    const rows = await db
        .select({ tier: schema.events.tier, creemCheckoutId: schema.events.creemCheckoutId })
        .from(schema.events)
        .where(
            and(
                eq(schema.events.id, eventId),
                eq(schema.events.organizationId, organizationId),
            ),
        )
        .limit(1);
    return rows[0];
}

// ---------------------------------------------------------------------------
// One-time unlock / re-lock (Celebration) — SPEC §6.3/§6.4
// ---------------------------------------------------------------------------

/**
 * Unlocks a Free event → 'celebration' (Creem one-time payment completed).
 * Idempotent by-construction: the `tier='free'` predicate prevents double writes.
 * Org-scoped: the org must be the one owning the event (from checkout metadata).
 */
export async function unlockEvent(
    eventId: string,
    organizationId: string,
    creemOrderId: string,
): Promise<void> {
    const db = getDB();
    await db
        .update(schema.events)
        .set({ tier: "celebration", unlockedAt: new Date(), creemOrderId })
        .where(
            and(
                eq(schema.events.id, eventId),
                eq(schema.events.organizationId, organizationId),
                eq(schema.events.tier, "free"),
            ),
        );
}

/**
 * Re-locks the event linked to a refunded/disputed Creem order → 'free'.
 * Matched by `creem_order_id` (unique on the Creem side). Without this, a refunded
 * event would remain unlocked for free (SPEC §6.4). No-op if no match.
 */
export async function relockEventByOrder(creemOrderId: string): Promise<void> {
    const db = getDB();
    await db
        .update(schema.events)
        .set({ tier: "free", unlockedAt: null, creemOrderId: null })
        .where(eq(schema.events.creemOrderId, creemOrderId));
}

/**
 * Guests "to follow up": opened the link before `openedBefore`
 * (> 7 days ago) but have never responded. Max `limit`, oldest first.
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

// ---------------------------------------------------------------------------
// Cleanup of concluded+inactive events (SPEC §9)
// ---------------------------------------------------------------------------

const STALE_DAYS_FREE = 30;
const STALE_DAYS_CELEBRATION = 90;

/**
 * "Concluded AND inactive" predicate evaluated at `ref` (warn: now+7d, delete: now).
 * Tier-aware on thresholds; edge eventDate NULL → only status='closed' + 30d.
 * Atelier exclusion NOT here: the service applies it via isOrgAtelier (subscriptions
 * are out of scope for this repository, which is org-agnostic on subs).
 *
 * CRITICAL SAFETY: `freeStale` requires `eventDate < ref` to avoid deleting
 * future events whose rsvpDeadline has already passed (e.g. wedding in 15d with RSVP
 * closed 5d ago → `concluded` via rsvpDeadline-branch, but eventDate is still in the future).
 */
function stalePredicate(ref: Date) {
    const refMs = ref.getTime();
    const freeCutoff = new Date(refMs - STALE_DAYS_FREE * 24 * 60 * 60 * 1000);
    const celebrationCutoff = new Date(refMs - STALE_DAYS_CELEBRATION * 24 * 60 * 60 * 1000);

    const concluded = or(
        eq(schema.events.status, "closed"),
        lt(schema.events.eventDate, ref),
        and(isNotNull(schema.events.rsvpDeadline), lt(schema.events.rsvpDeadline, ref)),
    );

    // No guest_activity in the last STALE_DAYS_FREE (30d) from ref.
    // Guest RSVPs write to guest_activities, not to events.updatedAt,
    // so checking only updatedAt would let still-active events through.
    const noRecentActivity = sql`not exists (
        select 1 from ${schema.guestActivities}
        where ${schema.guestActivities.eventId} = ${schema.events.id}
          and ${schema.guestActivities.createdAt} >= ${freeCutoff}
    )`;

    // Celebration: 90d threshold after eventDate. Requires eventDate in the past.
    const celebrationStale = and(
        eq(schema.events.tier, "celebration"),
        isNotNull(schema.events.eventDate),
        lt(schema.events.eventDate, celebrationCutoff),
        lt(schema.events.updatedAt, freeCutoff),
        noRecentActivity,
    );

    // Edge case: eventDate IS NULL → deletable only if status='closed' and inactive for 30d.
    // A draft with an unknown date (potentially future) is never deleted.
    const nullDateStale = and(
        isNull(schema.events.eventDate),
        eq(schema.events.status, "closed"),
        lt(schema.events.updatedAt, freeCutoff),
        noRecentActivity,
    );

    // Free (and unknown tiers): 30d threshold. REQUIRES eventDate < ref for safety:
    // a future event with a passed rsvpDeadline would satisfy `concluded` via the
    // rsvpDeadline-branch, but must never be a deletion candidate.
    const freeStale = and(
        ne(schema.events.tier, "celebration"),
        isNotNull(schema.events.eventDate),
        lt(schema.events.eventDate, ref), // guard: eventDate must be in the past
        lt(schema.events.updatedAt, freeCutoff),
        noRecentActivity,
    );

    return and(concluded, or(celebrationStale, nullDateStale, freeStale));
}

/** Events that will satisfy the stale predicate within ~7 days and have not yet been warned. */
export async function findStaleEventsToWarn(
    now: Date,
): Promise<Array<{ id: string; organizationId: string }>> {
    const db = getDB();
    const ref = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return db
        .select({ id: schema.events.id, organizationId: schema.events.organizationId })
        .from(schema.events)
        .where(and(stalePredicate(ref), isNull(schema.events.cleanupWarnedAt)));
}

/** Events that satisfy the stale predicate now and were warned ≥7 days ago. */
export async function findStaleEventsToDelete(
    now: Date,
): Promise<Array<{ id: string; organizationId: string }>> {
    const db = getDB();
    const warnedBefore = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return db
        .select({ id: schema.events.id, organizationId: schema.events.organizationId })
        .from(schema.events)
        .where(
            and(
                stalePredicate(now),
                isNotNull(schema.events.cleanupWarnedAt),
                lt(schema.events.cleanupWarnedAt, warnedBefore),
            ),
        );
}

/** Marks an event as warned (cleanupWarnedAt=now) — org-scoped. */
export async function markEventCleanupWarned(
    organizationId: string,
    eventId: string,
    now: Date,
): Promise<void> {
    const db = getDB();
    await db
        .update(schema.events)
        .set({ cleanupWarnedAt: now })
        .where(and(eq(schema.events.id, eventId), eq(schema.events.organizationId, organizationId)));
}

/** Event title + email/locale of the org owner (for the cleanup warning). */
export async function findEventWarnTargetInfo(
    organizationId: string,
    eventId: string,
    ownerUserId: string,
): Promise<{ title: string; email: string; locale: string } | undefined> {
    const db = getDB();
    const rows = await db
        .select({ title: schema.events.title, email: schema.user.email, locale: schema.user.locale })
        .from(schema.events)
        .innerJoin(schema.user, eq(schema.user.id, ownerUserId))
        .where(and(eq(schema.events.id, eventId), eq(schema.events.organizationId, organizationId)))
        .limit(1);
    const row = rows[0];
    if (!row) return undefined;
    return { title: row.title, email: row.email, locale: row.locale ?? "it" };
}
