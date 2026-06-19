/**
 * Test webhook handlers: handleCheckoutCompleted + handleRefundCreated.
 * DB-backed: seed un evento free su `test-org-webhook-3-5` / `test-evt-webhook-3-5`,
 * poi verifica che il tier cambi dopo unlock/relock.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDB } from "~~/server/utils/db";
import * as schema from "~~/server/database/schema";
import type {
    FlatCheckoutCompleted,
    FlatRefundCreated,
} from "@creem_io/better-auth";
import { unlockEvent } from "~~/server/repositories/eventRepository";
import { handleCheckoutCompleted, handleRefundCreated } from "~~/server/utils/creem";

const db = getDB();

const ORG_ID = "test-org-webhook-3-5";
const EVT_ID = "test-evt-webhook-3-5";
const ORDER_ID = "order-webhook-3-5";

async function seedFreeEvent() {
    // Idempotente: cancella e ricrea sempre da zero
    await db.delete(schema.events).where(eq(schema.events.id, EVT_ID));
    await db.delete(schema.organization).where(eq(schema.organization.id, ORG_ID));

    await db.insert(schema.organization).values({
        id: ORG_ID,
        name: "Test Webhook Org 3.5",
        slug: ORG_ID,
        createdAt: new Date(),
    });

    await db.insert(schema.events).values({
        id: EVT_ID,
        organizationId: ORG_ID,
        type: "matrimonio",
        templateKey: "matrimonio-default",
        title: "Test Event Webhook 3.5",
        slug: "test-evt-webhook-3-5-slug",
        status: "draft",
        tier: "free",
    });
}

afterAll(async () => {
    await db.delete(schema.events).where(eq(schema.events.id, EVT_ID));
    await db.delete(schema.organization).where(eq(schema.organization.id, ORG_ID));
});

describe("handleCheckoutCompleted", () => {
    beforeEach(seedFreeEvent);

    it("(a) one-time + metadata.eventId → tier='celebration', creemOrderId impostato", async () => {
        const payload = {
            webhookEventType: "checkout.completed",
            webhookId: "wh_test_a",
            webhookCreatedAt: Date.now(),
            order: { id: ORDER_ID, type: "onetime" },
            metadata: { eventId: EVT_ID, organizationId: ORG_ID },
            product: { id: "prod_celeb_x", name: "Celebrazione" },
            customer: { id: "cust_test" },
        } as unknown as FlatCheckoutCompleted;

        await handleCheckoutCompleted(payload);

        const rows = await db.select().from(schema.events).where(eq(schema.events.id, EVT_ID));
        const evt = rows[0];
        expect(evt).toBeDefined();
        expect(evt.tier).toBe("celebration");
        expect(evt.creemOrderId).toBe(ORDER_ID);
        expect(evt.unlockedAt).toBeInstanceOf(Date);
    });

    it("(b) recurring order → nessuna mutazione (tier resta 'free')", async () => {
        const payload = {
            webhookEventType: "checkout.completed",
            webhookId: "wh_test_b",
            webhookCreatedAt: Date.now(),
            order: { id: ORDER_ID, type: "recurring" },
            metadata: { eventId: EVT_ID, organizationId: ORG_ID },
            product: { id: "prod_atelier_x", name: "Atelier" },
            customer: { id: "cust_test" },
        } as unknown as FlatCheckoutCompleted;

        await handleCheckoutCompleted(payload);

        const rows = await db.select().from(schema.events).where(eq(schema.events.id, EVT_ID));
        const evt = rows[0];
        expect(evt.tier).toBe("free");
        expect(evt.creemOrderId).toBeNull();
    });

    it("(c) manca metadata.eventId → nessuna mutazione", async () => {
        const payload = {
            webhookEventType: "checkout.completed",
            webhookId: "wh_test_c",
            webhookCreatedAt: Date.now(),
            order: { id: ORDER_ID, type: "onetime" },
            metadata: { organizationId: ORG_ID },
            product: { id: "prod_celeb_x", name: "Celebrazione" },
            customer: { id: "cust_test" },
        } as unknown as FlatCheckoutCompleted;

        await handleCheckoutCompleted(payload);

        const rows = await db.select().from(schema.events).where(eq(schema.events.id, EVT_ID));
        const evt = rows[0];
        expect(evt.tier).toBe("free");
        expect(evt.creemOrderId).toBeNull();
    });
});

describe("handleRefundCreated", () => {
    beforeEach(async () => {
        await seedFreeEvent();
        // Metti l'evento in stato celebration (come se fosse già pagato)
        await unlockEvent(EVT_ID, ORG_ID, ORDER_ID);
    });

    it("(d) order come oggetto → relock (tier='free')", async () => {
        const payload = {
            webhookEventType: "refund.created",
            webhookId: "wh_test_d",
            webhookCreatedAt: Date.now(),
            order: { id: ORDER_ID, type: "onetime" },
            transaction: { id: "txn_test" },
        } as unknown as FlatRefundCreated;

        await handleRefundCreated(payload);

        const rows = await db.select().from(schema.events).where(eq(schema.events.id, EVT_ID));
        const evt = rows[0];
        expect(evt.tier).toBe("free");
        expect(evt.creemOrderId).toBeNull();
        expect(evt.unlockedAt).toBeNull();
    });

    it("(e) order come stringa → relock (tier='free')", async () => {
        const payload = {
            webhookEventType: "refund.created",
            webhookId: "wh_test_e",
            webhookCreatedAt: Date.now(),
            order: ORDER_ID,
            transaction: { id: "txn_test" },
        } as unknown as FlatRefundCreated;

        await handleRefundCreated(payload);

        const rows = await db.select().from(schema.events).where(eq(schema.events.id, EVT_ID));
        const evt = rows[0];
        expect(evt.tier).toBe("free");
        expect(evt.creemOrderId).toBeNull();
        expect(evt.unlockedAt).toBeNull();
    });

    it("(f) orderId solo via checkout.order.id → relock (tier='free')", async () => {
        // Forza il branch 3 di extractCreemOrderId: nessun campo order (branch 1+2 falliscono),
        // orderId leggibile solo da checkout.order.id
        const payload = {
            webhookEventType: "refund.created",
            webhookId: "wh_test_f",
            webhookCreatedAt: Date.now(),
            checkout: { order: { id: ORDER_ID } },
            transaction: { id: "txn_test_f" },
        } as unknown as FlatRefundCreated;

        await handleRefundCreated(payload);

        const rows = await db.select().from(schema.events).where(eq(schema.events.id, EVT_ID));
        const evt = rows[0];
        expect(evt.tier).toBe("free");
        expect(evt.creemOrderId).toBeNull();
        expect(evt.unlockedAt).toBeNull();
    });
});
