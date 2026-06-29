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
    // Create the two synthetic orgs
    await db
        .insert(schema.organization)
        .values({ id: ORG_ID, name: "Test Unlock Org", slug: ORG_ID, createdAt: new Date() });
    await db
        .insert(schema.organization)
        .values({ id: OTHER_ORG_ID, name: "Test Unlock Other Org", slug: OTHER_ORG_ID, createdAt: new Date() });

    // Create the free event
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
    it("(a) unlocks a free event → tier='celebration' with orderId and unlockedAt", async () => {
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

    it("(b) idempotent: second unlock with different order does NOT overwrite (tier is no longer 'free')", async () => {
        // Second unlock with order_B — the WHERE tier='free' blocks it
        await unlockEvent(EVT_ID, ORG_ID, "order_B");

        const rows = await db
            .select()
            .from(schema.events)
            .where(eq(schema.events.id, EVT_ID));
        const evt = rows[0];

        // Must still have order_A, NOT order_B
        expect(evt.creemOrderId).toBe("order_A");
        expect(evt.tier).toBe("celebration");
    });

    it("(c) org-scope: unlock with different org does NOT unlock the event", async () => {
        // Reset tier to 'free' to test org scope
        await db
            .update(schema.events)
            .set({ tier: "free", creemOrderId: null, unlockedAt: null })
            .where(eq(schema.events.id, EVT_ID));

        // Attempt unlock with wrong org
        await unlockEvent(EVT_ID, OTHER_ORG_ID, "order_C");

        const rows = await db
            .select()
            .from(schema.events)
            .where(eq(schema.events.id, EVT_ID));
        const evt = rows[0];

        // The event must still be free
        expect(evt.tier).toBe("free");
        expect(evt.creemOrderId).toBeNull();
    });
});
