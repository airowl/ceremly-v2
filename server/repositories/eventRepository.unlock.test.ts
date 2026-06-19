import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDB } from "~~/server/utils/db";
import * as schema from "~~/server/database/schema";
import { unlockEvent } from "~~/server/repositories/eventRepository";

const db = getDB();

const ORG_ID = "test-org-unlock-3-1";
const OTHER_ORG_ID = "test-org-unlock-3-1-other";
const EVT_ID = "test-evt-unlock-3-1";

beforeAll(async () => {
    // Crea le due org sintetiche
    await db
        .insert(schema.organization)
        .values({ id: ORG_ID, name: "Test Unlock Org", slug: ORG_ID, createdAt: new Date() });
    await db
        .insert(schema.organization)
        .values({ id: OTHER_ORG_ID, name: "Test Unlock Other Org", slug: OTHER_ORG_ID, createdAt: new Date() });

    // Crea l'evento free
    await db.insert(schema.events).values({
        id: EVT_ID,
        organizationId: ORG_ID,
        type: "matrimonio",
        templateKey: "matrimonio-default",
        title: "Test Event Unlock",
        slug: "test-evt-unlock-3-1-slug",
        status: "draft",
        tier: "free",
    });
});

afterAll(async () => {
    await db.delete(schema.events).where(eq(schema.events.id, EVT_ID));
    await db.delete(schema.organization).where(eq(schema.organization.id, ORG_ID));
    await db.delete(schema.organization).where(eq(schema.organization.id, OTHER_ORG_ID));
});

describe("unlockEvent", () => {
    it("(a) sblocca un evento free → tier='celebration' con orderId e unlockedAt", async () => {
        await unlockEvent(EVT_ID, ORG_ID, "order_A");

        const rows = await db
            .select()
            .from(schema.events)
            .where(eq(schema.events.id, EVT_ID));
        const evt = rows[0];

        expect(evt).toBeDefined();
        expect(evt.tier).toBe("celebration");
        expect(evt.creemOrderId).toBe("order_A");
        expect(evt.unlockedAt).toBeInstanceOf(Date);
    });

    it("(b) idempotente: secondo unlock con order diverso NON sovrascrive (tier non è più 'free')", async () => {
        // Secondo unlock con order_B — il WHERE tier='free' lo blocca
        await unlockEvent(EVT_ID, ORG_ID, "order_B");

        const rows = await db
            .select()
            .from(schema.events)
            .where(eq(schema.events.id, EVT_ID));
        const evt = rows[0];

        // Deve ancora avere order_A, NON order_B
        expect(evt.creemOrderId).toBe("order_A");
        expect(evt.tier).toBe("celebration");
    });

    it("(c) org-scope: unlock con org diversa NON sblocca l'evento", async () => {
        // Reset del tier a 'free' per testare lo scope org
        await db
            .update(schema.events)
            .set({ tier: "free", creemOrderId: null, unlockedAt: null })
            .where(eq(schema.events.id, EVT_ID));

        // Tentativo di unlock con org sbagliata
        await unlockEvent(EVT_ID, OTHER_ORG_ID, "order_C");

        const rows = await db
            .select()
            .from(schema.events)
            .where(eq(schema.events.id, EVT_ID));
        const evt = rows[0];

        // L'evento deve essere ancora free
        expect(evt.tier).toBe("free");
        expect(evt.creemOrderId).toBeNull();
    });
});
