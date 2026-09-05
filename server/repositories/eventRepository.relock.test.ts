import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDB } from "~~/server/utils/db";
import * as schema from "~~/server/database/schema";
import { relockEventByOrder } from "~~/server/repositories/eventRepository";

const db = getDB();

const ORG_ID = "test-org-relock-3-2";
const EVT_ID = "test-evt-relock-3-2";
const ORDER_ID = "order_relock_3_2";

beforeAll(async () => {
    // Crea l'org sintetica
    await db
        .insert(schema.organization)
        .values({ id: ORG_ID, name: "Test Relock Org", slug: ORG_ID, createdAt: new Date() });

    // Crea l'evento già sbloccato (celebration) con un orderId noto
    await db.insert(schema.events).values({
        id: EVT_ID,
        organizationId: ORG_ID,
        type: "matrimonio",
        templateKey: "matrimonio-default",
        title: "Test Event Relock",
        slug: "test-evt-relock-3-2-slug",
        status: "draft",
        tier: "celebration",
        creemOrderId: ORDER_ID,
        unlockedAt: new Date(),
    });
});

afterAll(async () => {
    await db.delete(schema.events).where(eq(schema.events.id, EVT_ID));
    await db.delete(schema.organization).where(eq(schema.organization.id, ORG_ID));
});

describe("relockEventByOrder", () => {
    it("(a) re-locka un evento celebration e conserva l'orderId per bloccare webhook ritardati", async () => {
        await relockEventByOrder(ORDER_ID);

        const rows = await db
            .select()
            .from(schema.events)
            .where(eq(schema.events.id, EVT_ID));
        const evt = rows[0];

        expect(evt).toBeDefined();
        expect(evt.tier).toBe("free");
        expect(evt.unlockedAt).toBeNull();
        expect(evt.creemOrderId).toBe(ORDER_ID);
    });

    it("(b) no-op silenzioso per orderId sconosciuto: nessun errore, nessuna modifica", async () => {
        // L'evento è già 'free' dal test (a). Passa un orderId inesistente.
        await expect(relockEventByOrder("order_unknown_xyz")).resolves.toBeUndefined();

        // Lo stato dell'evento non è cambiato
        const rows = await db
            .select()
            .from(schema.events)
            .where(eq(schema.events.id, EVT_ID));
        const evt = rows[0];

        expect(evt.tier).toBe("free");
    });
});
