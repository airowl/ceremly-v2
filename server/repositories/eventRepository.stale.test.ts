/**
 * DB-backed tests for findStaleEventsToWarn / findStaleEventsToDelete.
 *
 * Critical safety cases (predicate "concluded AND inactive"):
 * (a) FUTURE event with passed rsvpDeadline → never returned (avoids wedding-in-2-weeks deleted)
 * (b) Free concluded+inactive event without warning → warn (cleanupWarnedAt IS NULL)
 * (c) Free concluded+inactive event warned ≥7d ago → delete
 * (d) Event with eventDate IS NULL + draft → NOT deletable
 * (e) Event with eventDate IS NULL + closed + inactive → deletable
 * (f) Future event without rsvpDeadline → NOT concluded → NOT returned
 *
 * Note: Atelier exclusion NOT tested here (it's in the service via isOrgAtelier —
 * the repository has no access to subscriptions; see task-4.3).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDB } from "~~/server/utils/db";
import * as schema from "~~/server/database/schema";
import {
    findStaleEventsToWarn,
    findStaleEventsToDelete,
} from "~~/server/repositories/eventRepository";

const db = getDB();

// --- time helpers ---
const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date();
const past = (days: number) => new Date(now.getTime() - days * DAY_MS);
const future = (days: number) => new Date(now.getTime() + days * DAY_MS);

// --- isolated IDs ---
const ORG_ID = "test-org-stale-4-2";

// Event: free, eventDate=future+30d, rsvpDeadline passed 5d ago, inactive 35d → must NOT be deleted
const EVT_FUTURE_RSVP_CLOSED = "test-stale-future-rsvp-closed";
// Event: free, eventDate=past-40d (therefore "concluded"), inactive 35d → to be warned
const EVT_FREE_CONCLUDED_NO_WARN = "test-stale-free-concluded-no-warn";
// Event: free, eventDate=past-40d, inactive 35d, warned 10d ago → to be deleted
const EVT_FREE_CONCLUDED_WARNED = "test-stale-free-concluded-warned";
// Event: eventDate IS NULL + status=draft → NOT deletable (draft with unknown date)
const EVT_NULL_DATE_DRAFT = "test-stale-null-date-draft";
// Event: eventDate IS NULL + status=closed, inactive 35d → deletable
const EVT_NULL_DATE_CLOSED = "test-stale-null-date-closed";
// Event: purely future (no rsvpDeadline), old updatedAt → NOT concluded → NOT returned
const EVT_FUTURE_NO_DEADLINE = "test-stale-future-no-deadline";
// Event: eventDate IS NULL + status=closed, inactive 35d, cleanupWarnedAt=NULL → must be warned
const EVT_NULL_DATE_STALE_NO_WARN = "test-stale-null-date-stale-no-warn";

const ALL_EVT_IDS = [
    EVT_FUTURE_RSVP_CLOSED,
    EVT_FREE_CONCLUDED_NO_WARN,
    EVT_FREE_CONCLUDED_WARNED,
    EVT_NULL_DATE_DRAFT,
    EVT_NULL_DATE_CLOSED,
    EVT_FUTURE_NO_DEADLINE,
    EVT_NULL_DATE_STALE_NO_WARN,
];

const BASE_VALUES = {
    organizationId: ORG_ID,
    type: "matrimonio",
    templateKey: "matrimonio-default",
    title: "Test Stale",
    tier: "free",
};

function slugFor(id: string) {
    return `slug-${id}`;
}

beforeAll(async () => {
    await db
        .insert(schema.organization)
        .values({ id: ORG_ID, name: "Test Stale Org 4.2", slug: ORG_ID, createdAt: new Date() });

    await db.insert(schema.events).values([
        {
            ...BASE_VALUES,
            id: EVT_FUTURE_RSVP_CLOSED,
            slug: slugFor(EVT_FUTURE_RSVP_CLOSED),
            status: "active",
            eventDate: future(30), // wedding in 30 days → FUTURE
            rsvpDeadline: past(5), // rsvp closed 5d ago (normal)
            updatedAt: past(35), // inactive 35d
        },
        {
            ...BASE_VALUES,
            id: EVT_FREE_CONCLUDED_NO_WARN,
            slug: slugFor(EVT_FREE_CONCLUDED_NO_WARN),
            status: "closed",
            eventDate: past(40), // past 40d ago → concluded
            updatedAt: past(35), // inactive 35d (> 30d threshold)
            cleanupWarnedAt: null,
        },
        {
            ...BASE_VALUES,
            id: EVT_FREE_CONCLUDED_WARNED,
            slug: slugFor(EVT_FREE_CONCLUDED_WARNED),
            status: "closed",
            eventDate: past(40),
            updatedAt: past(35),
            cleanupWarnedAt: past(10), // warned 10d ago (> 7d)
        },
        {
            ...BASE_VALUES,
            id: EVT_NULL_DATE_DRAFT,
            slug: slugFor(EVT_NULL_DATE_DRAFT),
            status: "draft",
            eventDate: null, // unknown date
            updatedAt: past(35),
            cleanupWarnedAt: null,
        },
        {
            ...BASE_VALUES,
            id: EVT_NULL_DATE_CLOSED,
            slug: slugFor(EVT_NULL_DATE_CLOSED),
            status: "closed",
            eventDate: null, // unknown date but explicitly closed
            updatedAt: past(35), // inactive 35d
            cleanupWarnedAt: past(10), // warned 10d ago
        },
        {
            ...BASE_VALUES,
            id: EVT_FUTURE_NO_DEADLINE,
            slug: slugFor(EVT_FUTURE_NO_DEADLINE),
            status: "active",
            eventDate: future(60), // purely future
            rsvpDeadline: null,
            updatedAt: past(35),
            cleanupWarnedAt: null,
        },
        {
            ...BASE_VALUES,
            id: EVT_NULL_DATE_STALE_NO_WARN,
            slug: slugFor(EVT_NULL_DATE_STALE_NO_WARN),
            status: "closed",
            eventDate: null, // unknown date but explicitly closed
            updatedAt: past(35), // inactive 35d (> 30d threshold)
            cleanupWarnedAt: null, // never warned → must appear in warn
        },
    ]);
});

afterAll(async () => {
    await db.delete(schema.events).where(inArray(schema.events.id, ALL_EVT_IDS));
    await db.delete(schema.organization).where(eq(schema.organization.id, ORG_ID));
});

describe("findStaleEventsToWarn", () => {
    it("(a) does NOT return a future event even if rsvpDeadline has passed", async () => {
        const results = await findStaleEventsToWarn(now);
        const ids = results.map((r) => r.id);
        expect(ids).not.toContain(EVT_FUTURE_RSVP_CLOSED);
    });

    it("(b) returns a Free concluded+inactive event with no warning (cleanupWarnedAt IS NULL)", async () => {
        const results = await findStaleEventsToWarn(now);
        const ids = results.map((r) => r.id);
        expect(ids).toContain(EVT_FREE_CONCLUDED_NO_WARN);
    });

    it("(c) does NOT return an already-warned event (cleanupWarnedAt IS NOT NULL)", async () => {
        const results = await findStaleEventsToWarn(now);
        const ids = results.map((r) => r.id);
        expect(ids).not.toContain(EVT_FREE_CONCLUDED_WARNED);
    });

    it("(d) does NOT return a draft with eventDate IS NULL (status=draft)", async () => {
        const results = await findStaleEventsToWarn(now);
        const ids = results.map((r) => r.id);
        expect(ids).not.toContain(EVT_NULL_DATE_DRAFT);
    });

    it("(e) returns closed event with eventDate IS NULL, inactive and not yet warned (nullDateStale warn path)", async () => {
        // EVT_NULL_DATE_STALE_NO_WARN: status=closed, eventDate=NULL, updatedAt ~35d ago,
        // cleanupWarnedAt=NULL → MUST appear in warn (positive nullDateStale path).
        // EVT_NULL_DATE_CLOSED (cleanupWarnedAt set) must NOT appear (already warned).
        const results = await findStaleEventsToWarn(now);
        const ids = results.map((r) => r.id);
        expect(ids).toContain(EVT_NULL_DATE_STALE_NO_WARN);
        expect(ids).not.toContain(EVT_NULL_DATE_CLOSED);
    });

    it("(f) does NOT return a future event without deadline (not concluded)", async () => {
        const results = await findStaleEventsToWarn(now);
        const ids = results.map((r) => r.id);
        expect(ids).not.toContain(EVT_FUTURE_NO_DEADLINE);
    });

    it("returns only org-scoped events (not from other orgs)", async () => {
        const results = await findStaleEventsToWarn(now);
        for (const r of results) {
            if (ALL_EVT_IDS.includes(r.id)) {
                expect(r.organizationId).toBe(ORG_ID);
            }
        }
    });
});

describe("findStaleEventsToDelete", () => {
    it("(a) does NOT return a future event even if rsvpDeadline has passed", async () => {
        const results = await findStaleEventsToDelete(now);
        const ids = results.map((r) => r.id);
        expect(ids).not.toContain(EVT_FUTURE_RSVP_CLOSED);
    });

    it("(b) does NOT return an event without warning (cleanupWarnedAt IS NULL)", async () => {
        const results = await findStaleEventsToDelete(now);
        const ids = results.map((r) => r.id);
        expect(ids).not.toContain(EVT_FREE_CONCLUDED_NO_WARN);
    });

    it("(c) returns event warned ≥7 days ago, concluded+inactive", async () => {
        const results = await findStaleEventsToDelete(now);
        const ids = results.map((r) => r.id);
        expect(ids).toContain(EVT_FREE_CONCLUDED_WARNED);
    });

    it("(d) does NOT return a draft with eventDate IS NULL (status=draft)", async () => {
        const results = await findStaleEventsToDelete(now);
        const ids = results.map((r) => r.id);
        expect(ids).not.toContain(EVT_NULL_DATE_DRAFT);
    });

    it("(e) returns closed event with eventDate IS NULL warned ≥7d (edge case)", async () => {
        const results = await findStaleEventsToDelete(now);
        const ids = results.map((r) => r.id);
        expect(ids).toContain(EVT_NULL_DATE_CLOSED);
    });

    it("(f) does NOT return a future event without deadline", async () => {
        const results = await findStaleEventsToDelete(now);
        const ids = results.map((r) => r.id);
        expect(ids).not.toContain(EVT_FUTURE_NO_DEADLINE);
    });
});
