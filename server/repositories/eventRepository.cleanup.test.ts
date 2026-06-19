/**
 * Test DB-backed per i helper task 4.3:
 *   - markEventCleanupWarned
 *   - findEventWarnTargetInfo
 *
 * Usa righe reali sul branch Neon dev/test (stesso pattern di
 * eventRepository.stale.test.ts). Pulizia garantita in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDB } from "~~/server/utils/db";
import * as schema from "~~/server/database/schema";
import {
    markEventCleanupWarned,
    findEventWarnTargetInfo,
} from "~~/server/repositories/eventRepository";

const DB_ORG_ID = "test-org-cleanup-4-3";
const DB_USER_ID = "test-user-cleanup-4-3";
const DB_EVT_ID = "test-evt-cleanup-4-3";

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

    // Evento stale concluso senza avviso (cleanupWarnedAt=null)
    await db.insert(schema.events).values({
        id: DB_EVT_ID,
        organizationId: DB_ORG_ID,
        type: "matrimonio",
        templateKey: "matrimonio-default",
        title: "Evento Test Cleanup 4.3",
        tier: "free",
        slug: `slug-${DB_EVT_ID}`,
        status: "closed",
        eventDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), // 40gg fa
        updatedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), // inattivo 35gg
        cleanupWarnedAt: null,
    });
});

afterAll(async () => {
    const db = getDB();
    await db.delete(schema.events).where(eq(schema.events.id, DB_EVT_ID));
    await db.delete(schema.user).where(eq(schema.user.id, DB_USER_ID));
    await db.delete(schema.organization).where(eq(schema.organization.id, DB_ORG_ID));
});

describe("markEventCleanupWarned (DB-backed — task 4.3)", () => {
    it("imposta cleanupWarnedAt sull'evento", async () => {
        const db = getDB();
        const warnedAt = new Date();
        await markEventCleanupWarned(DB_ORG_ID, DB_EVT_ID, warnedAt);

        const rows = await db
            .select({ cleanupWarnedAt: schema.events.cleanupWarnedAt })
            .from(schema.events)
            .where(eq(schema.events.id, DB_EVT_ID))
            .limit(1);

        expect(rows[0]?.cleanupWarnedAt).toBeDefined();
        // Confronto approssimativo: stessa data a meno di 2 secondi (latenza Neon)
        const diff = Math.abs(
            (rows[0]?.cleanupWarnedAt?.getTime() ?? 0) - warnedAt.getTime(),
        );
        expect(diff).toBeLessThan(2000);
    });

    it("è org-scoped: non aggiorna eventi di org diverse", async () => {
        const db = getDB();
        const before = await db
            .select({ cleanupWarnedAt: schema.events.cleanupWarnedAt })
            .from(schema.events)
            .where(eq(schema.events.id, DB_EVT_ID))
            .limit(1);

        // Tenta update con org_id sbagliato — non deve modificare nulla
        await markEventCleanupWarned("altra-org-id", DB_EVT_ID, new Date(0));

        const after = await db
            .select({ cleanupWarnedAt: schema.events.cleanupWarnedAt })
            .from(schema.events)
            .where(eq(schema.events.id, DB_EVT_ID))
            .limit(1);

        // Il valore deve restare invariato rispetto al test precedente
        expect(after[0]?.cleanupWarnedAt?.getTime()).toBe(
            before[0]?.cleanupWarnedAt?.getTime(),
        );
    });
});

describe("findEventWarnTargetInfo (DB-backed — task 4.3)", () => {
    it("restituisce title, email e locale dell'owner", async () => {
        const info = await findEventWarnTargetInfo(DB_ORG_ID, DB_EVT_ID, DB_USER_ID);

        expect(info).toBeDefined();
        expect(info?.title).toBe("Evento Test Cleanup 4.3");
        expect(info?.email).toBe("cleanup-test-4-3@test.ceremly.it");
        expect(info?.locale).toBe("it");
    });

    it("restituisce undefined se l'eventId non esiste nell'org", async () => {
        const info = await findEventWarnTargetInfo(
            DB_ORG_ID,
            "evento-inesistente-xyz",
            DB_USER_ID,
        );
        expect(info).toBeUndefined();
    });

    it("restituisce undefined se l'evento appartiene a un'altra org", async () => {
        const info = await findEventWarnTargetInfo("altra-org", DB_EVT_ID, DB_USER_ID);
        expect(info).toBeUndefined();
    });
});
