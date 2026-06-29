/**
 * DB-backed tests for task 4.3 helpers:
 *   - markEventCleanupWarned
 *   - findEventWarnTargetInfo
 *
 * + Critical boundary of the stale predicate (task 4.5):
 *   - event warned <7d ago does NOT appear in findStaleEventsToDelete
 *
 * Uses real rows on the Neon dev/test branch (same pattern as
 * eventRepository.stale.test.ts). Cleanup guaranteed in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDB } from "~~/server/utils/db";
import * as schema from "~~/server/database/schema";
import {
    markEventCleanupWarned,
    findEventWarnTargetInfo,
    findStaleEventsToDelete,
    deleteEventScoped,
} from "~~/server/repositories/eventRepository";

const DB_ORG_ID = "test-org-cleanup-4-3";
const DB_USER_ID = "test-user-cleanup-4-3";

// Main event: stale concluded without warning
const DB_EVT_ID = "test-evt-cleanup-4-3";

// Event for 7-day boundary test: warned 3d ago (within the window → must NOT be deleted)
const DB_EVT_WARNED_RECENT = "test-evt-warned-recent-4-3";

// Event for FK cascade test: will be deleted along with the linked guest
const DB_EVT_CASCADE = "test-evt-cascade-4-3";

beforeAll(async () => {
    const db = getDB();

    await db.insert(schema.organization).values({
        id: DB_ORG_ID,
        name: "Test Cleanup 4.3 Org",
        slug: DB_ORG_ID,
        createdAt: new Date(),
    });

    await db.insert(schema.user).values({
        id: DB_USER_ID,
        name: "Test Owner",
        email: "cleanup-test-4-3@test.ceremly.it",
        emailVerified: true,
        locale: "it",
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    const DAY_MS = 24 * 60 * 60 * 1000;
    const past = (days: number) => new Date(Date.now() - days * DAY_MS);

    // Stale concluded event without warning (cleanupWarnedAt=null)
    await db.insert(schema.events).values([
        {
            id: DB_EVT_ID,
            organizationId: DB_ORG_ID,
            type: "matrimonio",
            templateKey: "matrimonio-default",
            title: "Evento Test Cleanup 4.3",
            tier: "free",
            slug: `slug-${DB_EVT_ID}`,
            status: "closed",
            eventDate: past(40), // 40gg fa → concluso
            updatedAt: past(35), // inattivo 35gg
            cleanupWarnedAt: null,
        },
        // Event warned 3d ago — within the 7d window → NOT deletable
        {
            id: DB_EVT_WARNED_RECENT,
            organizationId: DB_ORG_ID,
            type: "matrimonio",
            templateKey: "matrimonio-default",
            title: "Evento Warned Recent",
            tier: "free",
            slug: `slug-${DB_EVT_WARNED_RECENT}`,
            status: "closed",
            eventDate: past(40),
            updatedAt: past(35),
            cleanupWarnedAt: past(3), // avvisato 3gg fa (< 7gg threshold)
        },
        // Event warned 10d ago + stale → to be deleted (to test FK cascade)
        {
            id: DB_EVT_CASCADE,
            organizationId: DB_ORG_ID,
            type: "matrimonio",
            templateKey: "matrimonio-default",
            title: "Evento Cascade Delete",
            tier: "free",
            slug: `slug-${DB_EVT_CASCADE}`,
            status: "closed",
            eventDate: past(40),
            updatedAt: past(35),
            cleanupWarnedAt: past(10), // warned 10d ago (> 7d) → to delete
        },
    ]);

    // Guest linked to the cascade event — must disappear via FK cascade
    await db.insert(schema.guests).values({
        id: "test-guest-cascade-4-3",
        eventId: DB_EVT_CASCADE,
        organizationId: DB_ORG_ID,
        firstName: "Ospite",
        lastName: "Test",
        email: "ospite-cascade@test.ceremly.it",
        token: "tok-cascade-test",
        createdAt: new Date(),
        updatedAt: new Date(),
    });
});

afterAll(async () => {
    const db = getDB();
    // Guest cleanup is redundant if cascade worked,
    // but included for robustness (cascade test might not run).
    try {
        await db
            .delete(schema.guests)
            .where(eq(schema.guests.id, "test-guest-cascade-4-3"));
    } catch {
        // already deleted by cascade — ignored
    }
    await db.delete(schema.events).where(
        eq(schema.events.organizationId, DB_ORG_ID),
    );
    await db.delete(schema.user).where(eq(schema.user.id, DB_USER_ID));
    await db.delete(schema.organization).where(eq(schema.organization.id, DB_ORG_ID));
});

describe("markEventCleanupWarned (DB-backed — task 4.3)", () => {
    it("sets cleanupWarnedAt on the event", async () => {
        const db = getDB();
        const warnedAt = new Date();
        await markEventCleanupWarned(DB_ORG_ID, DB_EVT_ID, warnedAt);

        const rows = await db
            .select({ cleanupWarnedAt: schema.events.cleanupWarnedAt })
            .from(schema.events)
            .where(eq(schema.events.id, DB_EVT_ID))
            .limit(1);

        expect(rows[0]?.cleanupWarnedAt).toBeDefined();
        // Approximate comparison: same date within 2 seconds (Neon latency)
        const diff = Math.abs(
            (rows[0]?.cleanupWarnedAt?.getTime() ?? 0) - warnedAt.getTime(),
        );
        expect(diff).toBeLessThan(2000);
    });

    it("is org-scoped: does not update events from other orgs", async () => {
        const db = getDB();
        const before = await db
            .select({ cleanupWarnedAt: schema.events.cleanupWarnedAt })
            .from(schema.events)
            .where(eq(schema.events.id, DB_EVT_ID))
            .limit(1);

        // Attempt update with wrong org_id — must not modify anything
        await markEventCleanupWarned("altra-org-id", DB_EVT_ID, new Date(0));

        const after = await db
            .select({ cleanupWarnedAt: schema.events.cleanupWarnedAt })
            .from(schema.events)
            .where(eq(schema.events.id, DB_EVT_ID))
            .limit(1);

        // Value must remain unchanged from the previous test
        expect(after[0]?.cleanupWarnedAt?.getTime()).toBe(
            before[0]?.cleanupWarnedAt?.getTime(),
        );
    });
});

describe("findEventWarnTargetInfo (DB-backed — task 4.3)", () => {
    it("returns title, email and locale of the owner", async () => {
        const info = await findEventWarnTargetInfo(DB_ORG_ID, DB_EVT_ID, DB_USER_ID);

        expect(info).toBeDefined();
        expect(info?.title).toBe("Evento Test Cleanup 4.3");
        expect(info?.email).toBe("cleanup-test-4-3@test.ceremly.it");
        expect(info?.locale).toBe("it");
    });

    it("returns undefined if the eventId does not exist in the org", async () => {
        const info = await findEventWarnTargetInfo(
            DB_ORG_ID,
            "evento-inesistente-xyz",
            DB_USER_ID,
        );
        expect(info).toBeUndefined();
    });

    it("returns undefined if the event belongs to another org", async () => {
        const info = await findEventWarnTargetInfo("altra-org", DB_EVT_ID, DB_USER_ID);
        expect(info).toBeUndefined();
    });
});

describe("findStaleEventsToDelete — 7-day boundary (DB-backed — task 4.5)", () => {
    it("does NOT delete event warned <7 days ago (cleanupWarnedAt within the window)", async () => {
        // DB_EVT_WARNED_RECENT has cleanupWarnedAt = 3d ago — below the 7d threshold
        const results = await findStaleEventsToDelete(new Date());
        const ids = results.map((r) => r.id);
        expect(ids).not.toContain(DB_EVT_WARNED_RECENT);
    });

    it("includes event warned ≥7 days ago (cleanupWarnedAt outside the window)", async () => {
        // DB_EVT_CASCADE has cleanupWarnedAt = 10d ago — above the threshold → deletable
        const results = await findStaleEventsToDelete(new Date());
        const ids = results.map((r) => r.id);
        expect(ids).toContain(DB_EVT_CASCADE);
    });
});

describe("deleteEventScoped — FK cascade (DB-backed)", () => {
    it("deletes the event and linked guest via FK cascade", async () => {
        const db = getDB();

        // Verify the guest exists before the delete
        const guestBefore = await db
            .select({ id: schema.guests.id })
            .from(schema.guests)
            .where(eq(schema.guests.id, "test-guest-cascade-4-3"))
            .limit(1);
        expect(guestBefore).toHaveLength(1);

        // Delete scoped
        const removed = await deleteEventScoped(DB_ORG_ID, DB_EVT_CASCADE);
        expect(removed).toBeDefined();
        expect(removed?.id).toBe(DB_EVT_CASCADE);

        // The guest must have disappeared via FK cascade
        const guestAfter = await db
            .select({ id: schema.guests.id })
            .from(schema.guests)
            .where(eq(schema.guests.id, "test-guest-cascade-4-3"))
            .limit(1);
        expect(guestAfter).toHaveLength(0);
    });
});
