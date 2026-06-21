/**
 * Test DB-backed — Fix 7.4: cleanupWarnedAt reset su attività significativa.
 *
 * REGRESSIONE CORRETTA: `cleanupWarnedAt` non veniva mai resettato dopo il primo
 * warn. Sequenza di fallimento:
 *   1. Evento diventa stale → warned (cleanupWarnedAt = T).
 *   2. Organizzatore modifica l'evento o un ospite invia RSVP (attività reale).
 *   3. L'evento torna stale → findStaleEventsToDelete lo vede (cleanupWarnedAt = T,
 *      già > 7gg fa) e lo elimina SENZA un nuovo preavviso. Data loss senza notice.
 *
 * FIX: ogni attività significativa resetta cleanupWarnedAt → NULL, garantendo
 * che il cron invii un nuovo avviso con finestra di 7gg prima di qualsiasi delete.
 *
 * PERCORSI TESTATI:
 *   (A) updateEventScoped — edit organizzatore
 *   (B) clearEventCleanupWarned — submit RSVP ospite
 *
 * NOTA sul test end-to-end: non si testa "→ findStaleEventsToWarn lo vede di nuovo"
 * all'interno dello stesso test perché l'attività modifica updatedAt (A) o crea
 * una guest_activity recente (B), rendendo l'evento non-stale e la query confusa.
 * La prova discriminante è diretta: cleanupWarnedAt → NULL.
 * La catena "NULL → warn" è già coperta da eventRepository.stale.test.ts caso (b).
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

/** Inserisce un evento già avvisato (cleanupWarnedAt = daysAgo fa). */
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
        eventDate: new Date(now.getTime() - 40 * DAY), // 40gg fa (nel passato → concluso)
        updatedAt: new Date(now.getTime() - 35 * DAY),  // inattivo 35gg (> soglia 30gg)
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

describe("Fix 7.4 — cleanupWarnedAt reset su attività significativa", () => {
    describe("(A) updateEventScoped — edit organizzatore", () => {
        it("resetta cleanupWarnedAt a NULL dopo un update organizzatore", async () => {
            cleanupOrgId = await makeOrg();
            const eventId = await insertWarnedEvent(cleanupOrgId, 10); // avvisato 10gg fa

            // Verifica precondizione: cleanupWarnedAt è valorizzato
            const before = await db
                .select({ cleanupWarnedAt: schema.events.cleanupWarnedAt })
                .from(schema.events)
                .where(eq(schema.events.id, eventId))
                .limit(1);
            expect(before[0]?.cleanupWarnedAt).not.toBeNull();

            // Azione: update organizzatore (es. modifica titolo)
            await updateEventScoped(cleanupOrgId, eventId, { title: "Titolo Aggiornato" });

            // Asserzione discriminante: cleanupWarnedAt deve essere NULL
            const after = await db
                .select({ cleanupWarnedAt: schema.events.cleanupWarnedAt })
                .from(schema.events)
                .where(eq(schema.events.id, eventId))
                .limit(1);
            expect(after[0]?.cleanupWarnedAt).toBeNull();
        });

        it("è org-scoped: non resetta cleanupWarnedAt di eventi di altre org", async () => {
            cleanupOrgId = await makeOrg();
            const eventId = await insertWarnedEvent(cleanupOrgId, 10);

            // Tenta update con orgId sbagliato → nessun effetto
            await updateEventScoped("altra-org-xyz", eventId, { title: "Hacking" });

            const after = await db
                .select({ cleanupWarnedAt: schema.events.cleanupWarnedAt })
                .from(schema.events)
                .where(eq(schema.events.id, eventId))
                .limit(1);
            // Il valore deve restare non-null (non toccato dall'update a org errata)
            expect(after[0]?.cleanupWarnedAt).not.toBeNull();
        });

        it("non resetta cleanupWarnedAt sul no-op (patch vuoto)", async () => {
            cleanupOrgId = await makeOrg();
            const eventId = await insertWarnedEvent(cleanupOrgId, 10);

            // No-op: patch vuoto → nessuna scrittura effettiva
            await updateEventScoped(cleanupOrgId, eventId, {});

            const after = await db
                .select({ cleanupWarnedAt: schema.events.cleanupWarnedAt })
                .from(schema.events)
                .where(eq(schema.events.id, eventId))
                .limit(1);
            // Il no-op non deve resettare cleanupWarnedAt (nessun update eseguito)
            expect(after[0]?.cleanupWarnedAt).not.toBeNull();
        });

        it("dopo il reset, l'evento (reso stale di nuovo) riappare in findStaleEventsToWarn", async () => {
            // Test fine-a-fine del ciclo di re-warn: seed avvisato → update (reset) →
            // age manualmente updatedAt → l'evento è ora stale+noWarn → findStaleEventsToWarn lo include.
            cleanupOrgId = await makeOrg();
            const now = new Date();
            const eventId = await insertWarnedEvent(cleanupOrgId, 10);

            // Azione: update (resetta cleanupWarnedAt → NULL)
            await updateEventScoped(cleanupOrgId, eventId, { title: "Re-Warn Test" });

            // Verifica che cleanupWarnedAt sia null
            const checkNull = await db
                .select({ cleanupWarnedAt: schema.events.cleanupWarnedAt })
                .from(schema.events)
                .where(eq(schema.events.id, eventId))
                .limit(1);
            expect(checkNull[0]?.cleanupWarnedAt).toBeNull();

            // Ripristina updatedAt a 35gg fa (l'update ha settato updatedAt=now,
            // rendendo l'evento non-stale; dobbiamo invecchiarlo di nuovo per il test).
            await db
                .update(schema.events)
                .set({ updatedAt: new Date(now.getTime() - 35 * DAY) })
                .where(eq(schema.events.id, eventId));

            // findStaleEventsToWarn deve ora includere l'evento (cleanupWarnedAt=NULL + stale)
            const warnList = await findStaleEventsToWarn(now);
            const ids = warnList.filter((r) => r.organizationId === cleanupOrgId).map((r) => r.id);
            expect(ids).toContain(eventId);
        });
    });

    describe("(B) clearEventCleanupWarned — submit RSVP ospite", () => {
        it("resetta cleanupWarnedAt a NULL dopo un RSVP ospite", async () => {
            cleanupOrgId = await makeOrg();
            const eventId = await insertWarnedEvent(cleanupOrgId, 10);

            // Verifica precondizione
            const before = await db
                .select({ cleanupWarnedAt: schema.events.cleanupWarnedAt })
                .from(schema.events)
                .where(eq(schema.events.id, eventId))
                .limit(1);
            expect(before[0]?.cleanupWarnedAt).not.toBeNull();

            // Azione: reset via clearEventCleanupWarned (path RSVP submit)
            await clearEventCleanupWarned(cleanupOrgId, eventId);

            // Asserzione discriminante: cleanupWarnedAt deve essere NULL
            const after = await db
                .select({ cleanupWarnedAt: schema.events.cleanupWarnedAt })
                .from(schema.events)
                .where(eq(schema.events.id, eventId))
                .limit(1);
            expect(after[0]?.cleanupWarnedAt).toBeNull();
        });

        it("è org-scoped: non resetta cleanupWarnedAt di eventi di altre org", async () => {
            cleanupOrgId = await makeOrg();
            const eventId = await insertWarnedEvent(cleanupOrgId, 10);

            // Tenta clear con orgId sbagliato → nessun effetto
            await clearEventCleanupWarned("altra-org-xyz", eventId);

            const after = await db
                .select({ cleanupWarnedAt: schema.events.cleanupWarnedAt })
                .from(schema.events)
                .where(eq(schema.events.id, eventId))
                .limit(1);
            expect(after[0]?.cleanupWarnedAt).not.toBeNull();
        });

        it("è idempotente: doppia chiamata non causa errori (già NULL rimane NULL)", async () => {
            cleanupOrgId = await makeOrg();
            const eventId = await insertWarnedEvent(cleanupOrgId, 10);

            await clearEventCleanupWarned(cleanupOrgId, eventId);
            // Seconda chiamata: no-op silenzioso (NULL → NULL)
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
