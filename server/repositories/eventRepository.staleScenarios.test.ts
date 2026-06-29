/**
 * DETERMINISTIC DB-backed test — Task 4.7 (spec §9.1)
 *
 * Most dangerous destructive scenario: a FUTURE event must never be
 * auto-deleted by findStaleEventsToDelete, even when all other deletion
 * criteria are satisfied (concluded via status, inactive, warned ≥7d ago).
 *
 * Determinism lives in the SEED:
 * - updatedAt EXPLICITLY set in the past (not the default now()) — required because
 *   the stalePredicate predicate requires updatedAt < freeCutoff (30d ago).
 * - The future event (B) has cleanupWarnedAt set on purpose: so the ONLY reason
 *   for exclusion is that eventDate is in the future (not-concluded),
 *   not the warn-gate. Green for the RIGHT reason.
 */
import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDB } from "~~/server/utils/db";
import * as schema from "~~/server/database/schema";
import { findStaleEventsToDelete } from "~~/server/repositories/eventRepository";

const db = getDB();
let orgId = "";
const DAY = 24 * 60 * 60 * 1000;

async function makeOrg(): Promise<string> {
    const id = `org_test_${randomUUID()}`;
    await db.insert(schema.organization).values({
        id,
        name: "test-stale",
        slug: `test-stale-${randomUUID()}`,
        createdAt: new Date(),
    });
    return id;
}

// Inserts an event with EXPLICIT updatedAt/cleanupWarnedAt/eventDate (no default now()).
async function insertEvent(o: string, over: Record<string, unknown>): Promise<string> {
    const id = `evt_${randomUUID()}`;
    await db.insert(schema.events).values({
        id,
        organizationId: o,
        type: "compleanno",
        templateKey: "compleanno-default",
        title: "t",
        slug: `slug-${randomUUID()}`,
        status: "draft",
        tier: "free",
        ...over,
    });
    return id;
}

afterEach(async () => {
    if (!orgId) return;
    await db.delete(schema.events).where(eq(schema.events.organizationId, orgId));
    await db.delete(schema.organization).where(eq(schema.organization.id, orgId));
    orgId = "";
});

describe("findStaleEventsToDelete — destructive scenarios (spec §9.1)", () => {
    it("EXCLUDES the future/active event; INCLUDES only concluded+inactive+warned", async () => {
        orgId = await makeOrg();
        const now = new Date();
        const past60 = new Date(now.getTime() - 60 * DAY);
        const warned10 = new Date(now.getTime() - 10 * DAY);

        // (A) TO DELETE: concluded (past eventDate) + inactive (updatedAt -60d)
        //     + warned 10d ago. All temporal fields EXPLICIT.
        const toDelete = await insertEvent(orgId, {
            status: "closed",
            eventDate: past60,
            updatedAt: past60,
            cleanupWarnedAt: warned10,
        });

        // (B) FUTURE ACTIVE: eventDate +30d. warned on purpose (cleanupWarnedAt
        //     set): so the ONLY reason for exclusion is 'concluded'=false —
        //     the heart of test §9.1. Do NOT null cleanupWarnedAt, it would be excluded
        //     by the warn-gate instead of non-conclusion (green for the
        //     wrong reason).
        await insertEvent(orgId, {
            status: "active",
            eventDate: new Date(now.getTime() + 30 * DAY),
            updatedAt: past60,
            cleanupWarnedAt: warned10,
        });

        // (C) CONCLUDED+INACTIVE but NOT yet warned (cleanupWarnedAt NULL):
        //     must not be deleted (missing the prior warning).
        await insertEvent(orgId, {
            status: "closed",
            eventDate: past60,
            updatedAt: past60,
            cleanupWarnedAt: null,
        });

        const rows = await findStaleEventsToDelete(now);
        const ids = rows.filter((r) => r.organizationId === orgId).map((r) => r.id);

        expect(ids).toContain(toDelete); // (A) included
        expect(ids).toHaveLength(1); // only (A): (B) future and (C) non-warned excluded
    });
});
