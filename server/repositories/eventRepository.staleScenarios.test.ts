/**
 * Test DETERMINISTICO DB-backed — Task 4.7 (spec §9.1)
 *
 * Scenario distruttivo più pericoloso: un evento FUTURO non deve mai essere
 * auto-eliminato da findStaleEventsToDelete, anche quando tutti gli altri
 * criteri di eliminazione sono soddisfatti (concluso via status, inattivo,
 * avvisato ≥7gg fa).
 *
 * La determinatezza vive nel SEED:
 * - updatedAt ESPLICITO nel passato (non il default now()) — necessario perché
 *   il predicato stalePredicate richiede updatedAt < freeCutoff (30gg fa).
 * - L'evento futuro (B) ha cleanupWarnedAt valorizzato di proposito: così
 *   l'UNICA ragione di esclusione è che eventDate è nel futuro (non-concluso),
 *   non il warn-gate. Verde per la ragione GIUSTA.
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

// Inserisce un evento con updatedAt/cleanupWarnedAt/eventDate ESPLICITI (no default now()).
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

describe("findStaleEventsToDelete — scenari distruttivi (spec §9.1)", () => {
    it("ESCLUDE l'evento futuro/attivo; INCLUDE solo i conclusi+inattivi+warned", async () => {
        orgId = await makeOrg();
        const now = new Date();
        const past60 = new Date(now.getTime() - 60 * DAY);
        const warned10 = new Date(now.getTime() - 10 * DAY);

        // (A) DA ELIMINARE: concluso (eventDate passata) + inattivo (updatedAt -60gg)
        //     + warned 10gg fa. Tutti i campi temporali ESPLICITI.
        const toDelete = await insertEvent(orgId, {
            status: "closed",
            eventDate: past60,
            updatedAt: past60,
            cleanupWarnedAt: warned10,
        });

        // (B) FUTURO ATTIVO: eventDate +30gg. warned di proposito (cleanupWarnedAt
        //     valorizzato): così l'UNICA ragione di esclusione è 'concluso'=false —
        //     il cuore del test §9.1. NON nullare cleanupWarnedAt, lo escluderebbe
        //     per il warn-gate invece che per la non-conclusione (verde per la
        //     ragione sbagliata).
        await insertEvent(orgId, {
            status: "active",
            eventDate: new Date(now.getTime() + 30 * DAY),
            updatedAt: past60,
            cleanupWarnedAt: warned10,
        });

        // (C) CONCLUSO+INATTIVO ma NON ancora warned (cleanupWarnedAt NULL):
        //     non deve essere eliminato (manca il preavviso).
        await insertEvent(orgId, {
            status: "closed",
            eventDate: past60,
            updatedAt: past60,
            cleanupWarnedAt: null,
        });

        const rows = await findStaleEventsToDelete(now);
        const ids = rows.filter((r) => r.organizationId === orgId).map((r) => r.id);

        expect(ids).toContain(toDelete); // (A) incluso
        expect(ids).toHaveLength(1); // solo (A): (B) futuro e (C) non-warned esclusi
    });
});
