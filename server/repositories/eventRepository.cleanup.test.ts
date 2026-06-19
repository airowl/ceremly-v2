/**
 * Test DB-backed per i helper task 4.3:
 *   - markEventCleanupWarned
 *   - findEventWarnTargetInfo
 *
 * + Boundary critica del predicato stale (task 4.5):
 *   - evento avvisato <7gg fa NON appare in findStaleEventsToDelete
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
    findStaleEventsToDelete,
    deleteEventScoped,
} from "~~/server/repositories/eventRepository";

const DB_ORG_ID = "test-org-cleanup-4-3";
const DB_USER_ID = "test-user-cleanup-4-3";

// Evento principale: stale concluso senza avviso
const DB_EVT_ID = "test-evt-cleanup-4-3";

// Evento per test boundary 7gg: avvisato 3gg fa (dentro la finestra → NON da eliminare)
const DB_EVT_WARNED_RECENT = "test-evt-warned-recent-4-3";

// Evento per test FK cascade: verrà eliminato con guest collegato
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

    // Evento stale concluso senza avviso (cleanupWarnedAt=null)
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
        // Evento avvisato 3gg fa — dentro la finestra 7gg → NON eliminabile
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
        // Evento avvisato 10gg fa + stale → da eliminare (per testare FK cascade)
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
            cleanupWarnedAt: past(10), // avvisato 10gg fa (> 7gg) → da eliminare
        },
    ]);

    // Ospite collegato all'evento cascade — deve scomparire con FK cascade
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
    // La pulizia degli ospiti è ridondante se il cascade ha funzionato,
    // ma la includiamo per robustezza (il test cascade potrebbe non girare).
    try {
        await db
            .delete(schema.guests)
            .where(eq(schema.guests.id, "test-guest-cascade-4-3"));
    } catch {
        // già eliminato da cascade — ignorato
    }
    await db.delete(schema.events).where(
        eq(schema.events.organizationId, DB_ORG_ID),
    );
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

describe("findStaleEventsToDelete — boundary 7gg (DB-backed — task 4.5)", () => {
    it("NON elimina evento avvisato <7gg fa (cleanupWarnedAt dentro la finestra)", async () => {
        // DB_EVT_WARNED_RECENT ha cleanupWarnedAt = 3gg fa — sotto la soglia di 7gg
        const results = await findStaleEventsToDelete(new Date());
        const ids = results.map((r) => r.id);
        expect(ids).not.toContain(DB_EVT_WARNED_RECENT);
    });

    it("include evento avvisato ≥7gg fa (cleanupWarnedAt fuori dalla finestra)", async () => {
        // DB_EVT_CASCADE ha cleanupWarnedAt = 10gg fa — sopra la soglia → eliminabile
        const results = await findStaleEventsToDelete(new Date());
        const ids = results.map((r) => r.id);
        expect(ids).toContain(DB_EVT_CASCADE);
    });
});

describe("deleteEventScoped — FK cascade (DB-backed)", () => {
    it("elimina l'evento e il guest collegato via FK cascade", async () => {
        const db = getDB();

        // Verifica che il guest esista prima del delete
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

        // Il guest deve essere scomparso via FK cascade
        const guestAfter = await db
            .select({ id: schema.guests.id })
            .from(schema.guests)
            .where(eq(schema.guests.id, "test-guest-cascade-4-3"))
            .limit(1);
        expect(guestAfter).toHaveLength(0);
    });
});
