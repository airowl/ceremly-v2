/**
 * DB-backed test — Fix 7.4: cleanupWarnedAt reset on significant activity.
 *
 * REGRESSION FIXED: `cleanupWarnedAt` was never reset after the first warn.
 * Failure sequence:
 *   1. Event becomes stale → warned (cleanupWarnedAt = T).
 *   2. Organizer edits the event or a guest submits an RSVP (real activity).
 *   3. Event becomes stale again → findStaleEventsToDelete sees it (cleanupWarnedAt = T,
 *      already > 7d ago) and deletes it WITHOUT a new warning. Data loss without notice.
 *
 * FIX: every significant activity resets cleanupWarnedAt → NULL, ensuring
 * the cron sends a new warning with a 7-day window before any delete.
 *
 * PATHS TESTED:
 *   (A) updateEventScoped — organizer edit
 *   (B) clearEventCleanupWarned — guest RSVP submit
 *
 * NOTE on end-to-end test: we do not test "→ findStaleEventsToWarn sees it again"
 * within the same test because the activity changes updatedAt (A) or creates
 * a recent guest_activity (B), making the event non-stale and the query misleading.
 * The discriminating proof is direct: cleanupWarnedAt → NULL.
 * The "NULL → warn" chain is already covered by eventRepository.stale.test.ts case (b).
 */
import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDB } from "~~/server/utils/db";
import * as schema from "~~/server/database/schema";
import {
    updateEventScoped,
    clearEventCleanupWarned,
    findStaleEventsToWarn,
} from "~~/server/repositories/eventRepository";

const db = getDB();
const DAY = 24 * 60 * 60 * 1000;
let cleanupOrgId = "";

async function makeOrg(): Promise<string> {
    const id = `org-fix74-${randomUUID()}`;
    await db.insert(schema.organization).values({
        id,
        name: "Fix 7.4 Test Org",
        slug: `fix74-${randomUUID()}`,
        createdAt: new Date(),
    });
    return id;
}

/** Inserts an already-warned event (cleanupWarnedAt = daysAgo ago). */
async function insertWarnedEvent(orgId: string, warnedDaysAgo: number): Promise<string> {
    const id = `evt-fix74-${randomUUID()}`;
    const now = new Date();
    await db.insert(schema.events).values({
        id,
        organizationId: orgId,
        type: "matrimonio",
        templateKey: "matrimonio-default",
        title: "Evento Fix 7.4 Test",
        slug: `slug-fix74-${randomUUID()}`,
        status: "closed",
        tier: "free",
        eventDate: new Date(now.getTime() - 40 * DAY), // 40d ago (in the past → concluded)
        updatedAt: new Date(now.getTime() - 35 * DAY),  // inactive 35d (> 30d threshold)
        cleanupWarnedAt: new Date(now.getTime() - warnedDaysAgo * DAY),
    });
    return id;
}

afterEach(async () => {
    if (!cleanupOrgId) return;
    await db.delete(schema.events).where(eq(schema.events.organizationId, cleanupOrgId));
    await db.delete(schema.organization).where(eq(schema.organization.id, cleanupOrgId));
    cleanupOrgId = "";
});

describe("Fix 7.4 — cleanupWarnedAt reset on significant activity", () => {
    describe("(A) updateEventScoped — organizer edit", () => {
        it("resets cleanupWarnedAt to NULL after an organizer update", async () => {
            cleanupOrgId = await makeOrg();
            const eventId = await insertWarnedEvent(cleanupOrgId, 10); // warned 10d ago

            // Verify precondition: cleanupWarnedAt is set
            const before = await db
                .select({ cleanupWarnedAt: schema.events.cleanupWarnedAt })
                .from(schema.events)
                .where(eq(schema.events.id, eventId))
                .limit(1);
            expect(before[0]?.cleanupWarnedAt).not.toBeNull();

            // Action: organizer update (e.g. title change)
            await updateEventScoped(cleanupOrgId, eventId, { title: "Titolo Aggiornato" });

            // Discriminating assertion: cleanupWarnedAt must be NULL
            const after = await db
                .select({ cleanupWarnedAt: schema.events.cleanupWarnedAt })
                .from(schema.events)
                .where(eq(schema.events.id, eventId))
                .limit(1);
            expect(after[0]?.cleanupWarnedAt).toBeNull();
        });

        it("is org-scoped: does not reset cleanupWarnedAt for events from other orgs", async () => {
            cleanupOrgId = await makeOrg();
            const eventId = await insertWarnedEvent(cleanupOrgId, 10);

            // Attempt update with wrong orgId → no effect
            await updateEventScoped("altra-org-xyz", eventId, { title: "Hacking" });

            const after = await db
                .select({ cleanupWarnedAt: schema.events.cleanupWarnedAt })
                .from(schema.events)
                .where(eq(schema.events.id, eventId))
                .limit(1);
            // Value must remain non-null (not touched by the update with wrong org)
            expect(after[0]?.cleanupWarnedAt).not.toBeNull();
        });

        it("does not reset cleanupWarnedAt on no-op (empty patch)", async () => {
            cleanupOrgId = await makeOrg();
            const eventId = await insertWarnedEvent(cleanupOrgId, 10);

            // No-op: empty patch → no actual write
            await updateEventScoped(cleanupOrgId, eventId, {});

            const after = await db
                .select({ cleanupWarnedAt: schema.events.cleanupWarnedAt })
                .from(schema.events)
                .where(eq(schema.events.id, eventId))
                .limit(1);
            // The no-op must not reset cleanupWarnedAt (no update executed)
            expect(after[0]?.cleanupWarnedAt).not.toBeNull();
        });

        it("after the reset, the event (made stale again) reappears in findStaleEventsToWarn", async () => {
            // End-to-end test of the re-warn cycle: warned seed → update (reset) →
            // manually age updatedAt → event is now stale+noWarn → findStaleEventsToWarn includes it.
            cleanupOrgId = await makeOrg();
            const now = new Date();
            const eventId = await insertWarnedEvent(cleanupOrgId, 10);

            // Action: update (resets cleanupWarnedAt → NULL)
            await updateEventScoped(cleanupOrgId, eventId, { title: "Re-Warn Test" });

            // Verify that cleanupWarnedAt is null
            const checkNull = await db
                .select({ cleanupWarnedAt: schema.events.cleanupWarnedAt })
                .from(schema.events)
                .where(eq(schema.events.id, eventId))
                .limit(1);
            expect(checkNull[0]?.cleanupWarnedAt).toBeNull();

            // Restore updatedAt to 35d ago (the update set updatedAt=now,
            // making the event non-stale; we need to age it again for the test).
            await db
                .update(schema.events)
                .set({ updatedAt: new Date(now.getTime() - 35 * DAY) })
                .where(eq(schema.events.id, eventId));

            // findStaleEventsToWarn must now include the event (cleanupWarnedAt=NULL + stale)
            const warnList = await findStaleEventsToWarn(now);
            const ids = warnList.filter((r) => r.organizationId === cleanupOrgId).map((r) => r.id);
            expect(ids).toContain(eventId);
        });
    });

    describe("(B) clearEventCleanupWarned — guest RSVP submit", () => {
        it("resets cleanupWarnedAt to NULL after a guest RSVP", async () => {
            cleanupOrgId = await makeOrg();
            const eventId = await insertWarnedEvent(cleanupOrgId, 10);

            // Verify precondition
            const before = await db
                .select({ cleanupWarnedAt: schema.events.cleanupWarnedAt })
                .from(schema.events)
                .where(eq(schema.events.id, eventId))
                .limit(1);
            expect(before[0]?.cleanupWarnedAt).not.toBeNull();

            // Action: reset via clearEventCleanupWarned (RSVP submit path)
            await clearEventCleanupWarned(cleanupOrgId, eventId);

            // Discriminating assertion: cleanupWarnedAt must be NULL
            const after = await db
                .select({ cleanupWarnedAt: schema.events.cleanupWarnedAt })
                .from(schema.events)
                .where(eq(schema.events.id, eventId))
                .limit(1);
            expect(after[0]?.cleanupWarnedAt).toBeNull();
        });

        it("is org-scoped: does not reset cleanupWarnedAt for events from other orgs", async () => {
            cleanupOrgId = await makeOrg();
            const eventId = await insertWarnedEvent(cleanupOrgId, 10);

            // Attempt clear with wrong orgId → no effect
            await clearEventCleanupWarned("altra-org-xyz", eventId);

            const after = await db
                .select({ cleanupWarnedAt: schema.events.cleanupWarnedAt })
                .from(schema.events)
                .where(eq(schema.events.id, eventId))
                .limit(1);
            expect(after[0]?.cleanupWarnedAt).not.toBeNull();
        });

        it("is idempotent: double call does not cause errors (already NULL stays NULL)", async () => {
            cleanupOrgId = await makeOrg();
            const eventId = await insertWarnedEvent(cleanupOrgId, 10);

            await clearEventCleanupWarned(cleanupOrgId, eventId);
            // Second call: silent no-op (NULL → NULL)
            await expect(clearEventCleanupWarned(cleanupOrgId, eventId)).resolves.not.toThrow();

            const after = await db
                .select({ cleanupWarnedAt: schema.events.cleanupWarnedAt })
                .from(schema.events)
                .where(eq(schema.events.id, eventId))
                .limit(1);
            expect(after[0]?.cleanupWarnedAt).toBeNull();
        });
    });
});
