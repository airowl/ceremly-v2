/**
 * Test DB-backed per findStaleEventsToWarn / findStaleEventsToDelete.
 *
 * Casi critici di sicurezza (predicato "concluso AND inattivo"):
 * (a) Evento FUTURO con rsvpDeadline passata → mai restituito (evita wedding-in-2-weeks deleted)
 * (b) Evento Free concluso+inattivo senza avviso → warn (cleanupWarnedAt IS NULL)
 * (c) Evento Free concluso+inattivo avvisato ≥7gg fa → delete
 * (d) Evento con eventDate IS NULL + draft → NON eliminabile
 * (e) Evento con eventDate IS NULL + closed + inattivo → eliminabile
 * (f) Evento futuro senza rsvpDeadline → NON concluso → NON restituito
 *
 * Nota: Esclusione Atelier NON testata qui (è nel service via isOrgAtelier —
 * il repository non ha accesso alle subscription; vedere task-4.3).
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

// --- helpers temporali ---
const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date();
const past = (days: number) => new Date(now.getTime() - days * DAY_MS);
const future = (days: number) => new Date(now.getTime() + days * DAY_MS);

// --- IDs isolati ---
const ORG_ID = "test-org-stale-4-2";

// Evento: free, eventDate=futuro+30d, rsvpDeadline passata 5d fa, inattivo 35d → NON da eliminare
const EVT_FUTURE_RSVP_CLOSED = "test-stale-future-rsvp-closed";
// Evento: free, eventDate=passato-40d (quindi "concluso"), inattivo 35d → da warnare
const EVT_FREE_CONCLUDED_NO_WARN = "test-stale-free-concluded-no-warn";
// Evento: free, eventDate=passato-40d, inattivo 35d, avvisato 10d fa → da eliminare
const EVT_FREE_CONCLUDED_WARNED = "test-stale-free-concluded-warned";
// Evento: eventDate IS NULL + status=draft → NON eliminabile (bozza con data ignota)
const EVT_NULL_DATE_DRAFT = "test-stale-null-date-draft";
// Evento: eventDate IS NULL + status=closed, inattivo 35d → eliminabile
const EVT_NULL_DATE_CLOSED = "test-stale-null-date-closed";
// Evento: futuro puro (nessuna rsvpDeadline), updatedAt vecchio → NON concluso → NON restituito
const EVT_FUTURE_NO_DEADLINE = "test-stale-future-no-deadline";
// Evento: eventDate IS NULL + status=closed, inattivo 35d, cleanupWarnedAt=NULL → DA warnare
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
            eventDate: future(30), // wedding in 30 days → FUTURO
            rsvpDeadline: past(5), // rsvp chiuso 5gg fa (normale)
            updatedAt: past(35), // inattivo 35gg
        },
        {
            ...BASE_VALUES,
            id: EVT_FREE_CONCLUDED_NO_WARN,
            slug: slugFor(EVT_FREE_CONCLUDED_NO_WARN),
            status: "closed",
            eventDate: past(40), // passato 40gg fa → concluso
            updatedAt: past(35), // inattivo 35gg (> 30gg threshold)
            cleanupWarnedAt: null,
        },
        {
            ...BASE_VALUES,
            id: EVT_FREE_CONCLUDED_WARNED,
            slug: slugFor(EVT_FREE_CONCLUDED_WARNED),
            status: "closed",
            eventDate: past(40),
            updatedAt: past(35),
            cleanupWarnedAt: past(10), // avvisato 10gg fa (> 7gg)
        },
        {
            ...BASE_VALUES,
            id: EVT_NULL_DATE_DRAFT,
            slug: slugFor(EVT_NULL_DATE_DRAFT),
            status: "draft",
            eventDate: null, // data ignota
            updatedAt: past(35),
            cleanupWarnedAt: null,
        },
        {
            ...BASE_VALUES,
            id: EVT_NULL_DATE_CLOSED,
            slug: slugFor(EVT_NULL_DATE_CLOSED),
            status: "closed",
            eventDate: null, // data ignota ma chiuso esplicitamente
            updatedAt: past(35), // inattivo 35gg
            cleanupWarnedAt: past(10), // avvisato 10gg fa
        },
        {
            ...BASE_VALUES,
            id: EVT_FUTURE_NO_DEADLINE,
            slug: slugFor(EVT_FUTURE_NO_DEADLINE),
            status: "active",
            eventDate: future(60), // futuro puro
            rsvpDeadline: null,
            updatedAt: past(35),
            cleanupWarnedAt: null,
        },
        {
            ...BASE_VALUES,
            id: EVT_NULL_DATE_STALE_NO_WARN,
            slug: slugFor(EVT_NULL_DATE_STALE_NO_WARN),
            status: "closed",
            eventDate: null, // data ignota ma chiuso esplicitamente
            updatedAt: past(35), // inattivo 35gg (> 30gg threshold)
            cleanupWarnedAt: null, // mai avvisato → deve apparire in warn
        },
    ]);
});

afterAll(async () => {
    await db.delete(schema.events).where(inArray(schema.events.id, ALL_EVT_IDS));
    await db.delete(schema.organization).where(eq(schema.organization.id, ORG_ID));
});

describe("findStaleEventsToWarn", () => {
    it("(a) NON restituisce un evento futuro anche se rsvpDeadline è passata", async () => {
        const results = await findStaleEventsToWarn(now);
        const ids = results.map((r) => r.id);
        expect(ids).not.toContain(EVT_FUTURE_RSVP_CLOSED);
    });

    it("(b) restituisce evento Free concluso+inattivo senza avviso (cleanupWarnedAt IS NULL)", async () => {
        const results = await findStaleEventsToWarn(now);
        const ids = results.map((r) => r.id);
        expect(ids).toContain(EVT_FREE_CONCLUDED_NO_WARN);
    });

    it("(c) NON restituisce evento già avvisato (cleanupWarnedAt IS NOT NULL)", async () => {
        const results = await findStaleEventsToWarn(now);
        const ids = results.map((r) => r.id);
        expect(ids).not.toContain(EVT_FREE_CONCLUDED_WARNED);
    });

    it("(d) NON restituisce bozza con eventDate IS NULL (status=draft)", async () => {
        const results = await findStaleEventsToWarn(now);
        const ids = results.map((r) => r.id);
        expect(ids).not.toContain(EVT_NULL_DATE_DRAFT);
    });

    it("(e) restituisce evento closed con eventDate IS NULL inattivo e non ancora avvisato (nullDateStale warn path)", async () => {
        // EVT_NULL_DATE_STALE_NO_WARN: status=closed, eventDate=NULL, updatedAt ~35gg fa,
        // cleanupWarnedAt=NULL → DEVE apparire in warn (percorso nullDateStale positivo).
        // EVT_NULL_DATE_CLOSED (cleanupWarnedAt impostato) NON deve apparire (già avvisato).
        const results = await findStaleEventsToWarn(now);
        const ids = results.map((r) => r.id);
        expect(ids).toContain(EVT_NULL_DATE_STALE_NO_WARN);
        expect(ids).not.toContain(EVT_NULL_DATE_CLOSED);
    });

    it("(f) NON restituisce evento futuro senza deadline (non concluso)", async () => {
        const results = await findStaleEventsToWarn(now);
        const ids = results.map((r) => r.id);
        expect(ids).not.toContain(EVT_FUTURE_NO_DEADLINE);
    });

    it("restituisce solo eventi org-scoped (non di altre org)", async () => {
        const results = await findStaleEventsToWarn(now);
        for (const r of results) {
            if (ALL_EVT_IDS.includes(r.id)) {
                expect(r.organizationId).toBe(ORG_ID);
            }
        }
    });
});

describe("findStaleEventsToDelete", () => {
    it("(a) NON restituisce un evento futuro anche se rsvpDeadline è passata", async () => {
        const results = await findStaleEventsToDelete(now);
        const ids = results.map((r) => r.id);
        expect(ids).not.toContain(EVT_FUTURE_RSVP_CLOSED);
    });

    it("(b) NON restituisce evento senza avviso (cleanupWarnedAt IS NULL)", async () => {
        const results = await findStaleEventsToDelete(now);
        const ids = results.map((r) => r.id);
        expect(ids).not.toContain(EVT_FREE_CONCLUDED_NO_WARN);
    });

    it("(c) restituisce evento avvisato ≥7gg fa, concluso+inattivo", async () => {
        const results = await findStaleEventsToDelete(now);
        const ids = results.map((r) => r.id);
        expect(ids).toContain(EVT_FREE_CONCLUDED_WARNED);
    });

    it("(d) NON restituisce bozza con eventDate IS NULL (status=draft)", async () => {
        const results = await findStaleEventsToDelete(now);
        const ids = results.map((r) => r.id);
        expect(ids).not.toContain(EVT_NULL_DATE_DRAFT);
    });

    it("(e) restituisce evento closed con eventDate IS NULL avvisato ≥7gg (edge case)", async () => {
        const results = await findStaleEventsToDelete(now);
        const ids = results.map((r) => r.id);
        expect(ids).toContain(EVT_NULL_DATE_CLOSED);
    });

    it("(f) NON restituisce evento futuro senza deadline", async () => {
        const results = await findStaleEventsToDelete(now);
        const ids = results.map((r) => r.id);
        expect(ids).not.toContain(EVT_FUTURE_NO_DEADLINE);
    });
});
