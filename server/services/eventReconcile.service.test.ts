/**
 * TDD — eventReconcile.service.ts (fix 7.2)
 *
 * Replaces the old searchTransactions-based tests.
 * Strategy: per-event reconciliation via retrieveCheckout on the raw Creem client.
 *
 * Mock strategy:
 * - @creem_io/better-auth/server → createCreemClient mocked to return
 *   { retrieveCheckout: rawRetrieveCheckout }
 * - server/repositories/eventRepository → getEventCheckoutInfo + unlockEvent mocked
 * - server/utils/runtimeConfig → runtimeConfig mocked
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mock handles (declared before vi.mock hoisting) ----
const rawRetrieveCheckout = vi.fn();
const createCreemClient = vi.fn();
const getEventCheckoutInfo = vi.fn();
const unlockEvent = vi.fn();

vi.mock("@creem_io/better-auth/server", () => ({
    createCreemClient: (...a: unknown[]) => createCreemClient(...a),
}));

vi.mock("~~/server/repositories/eventRepository", () => ({
    getEventCheckoutInfo: (...a: unknown[]) => getEventCheckoutInfo(...a),
    unlockEvent: (...a: unknown[]) => unlockEvent(...a),
}));

vi.mock("~~/server/utils/runtimeConfig", () => ({
    runtimeConfig: {
        creemApiKey: "test_api_key",
        public: {
            appEnv: "development",
        },
    },
}));

// ---- Test helpers ----
const EVENT_ID = "evt_abc";
const ORG_ID = "org_xyz";
const ORDER_ID = "ord_111";
const CHECKOUT_ID = "chk_001";

/** Build a paid one-time CheckoutEntity */
function makePaidCheckout(overrides: Record<string, unknown> = {}) {
    return {
        id: CHECKOUT_ID,
        mode: "test",
        object: "checkout",
        status: "completed",
        product: "prod_cel",
        metadata: { eventId: EVENT_ID, organizationId: ORG_ID },
        checkoutUrl: "https://checkout.creem.io/chk_001",
        order: {
            id: ORDER_ID,
            type: "onetime",
            status: "paid",
            mode: "test",
            object: "order",
            product: "prod_cel",
            amount: 1500,
            currency: "EUR",
            createdAt: new Date(),
            updatedAt: new Date(),
        },
        ...overrides,
    };
}

describe("reconcileEventUnlock", () => {
    beforeEach(() => {
        vi.resetModules();
        [rawRetrieveCheckout, createCreemClient, getEventCheckoutInfo, unlockEvent].forEach((m) =>
            m.mockReset(),
        );
        unlockEvent.mockResolvedValue(undefined);
        createCreemClient.mockReturnValue({ retrieveCheckout: rawRetrieveCheckout });
    });

    it("happy path: paid onetime + metadata.eventId match → unlockEvent called, reconciled: true", async () => {
        getEventCheckoutInfo.mockResolvedValue({
            tier: "free",
            creemCheckoutId: CHECKOUT_ID,
        });
        rawRetrieveCheckout.mockResolvedValue(makePaidCheckout());

        const { reconcileEventUnlock } = await import(
            "~~/server/services/eventReconcile.service"
        );
        const result = await reconcileEventUnlock(EVENT_ID, ORG_ID);

        expect(createCreemClient).toHaveBeenCalledOnce();
        expect(createCreemClient).toHaveBeenCalledWith({
            apiKey: "test_api_key",
            testMode: true,
        });
        expect(rawRetrieveCheckout).toHaveBeenCalledOnce();
        expect(rawRetrieveCheckout).toHaveBeenCalledWith({
            checkoutId: CHECKOUT_ID,
            xApiKey: "test_api_key",
        });
        expect(unlockEvent).toHaveBeenCalledOnce();
        expect(unlockEvent).toHaveBeenCalledWith(EVENT_ID, ORG_ID, ORDER_ID);
        expect(result).toEqual({ reconciled: true });
    });

    it("order.status = 'pending' → NO unlock, reconciled: false", async () => {
        getEventCheckoutInfo.mockResolvedValue({ tier: "free", creemCheckoutId: CHECKOUT_ID });
        rawRetrieveCheckout.mockResolvedValue(
            makePaidCheckout({ order: { id: ORDER_ID, type: "onetime", status: "pending", mode: "test", object: "order", product: "p", amount: 0, currency: "EUR", createdAt: new Date(), updatedAt: new Date() } }),
        );

        const { reconcileEventUnlock } = await import(
            "~~/server/services/eventReconcile.service"
        );
        const result = await reconcileEventUnlock(EVENT_ID, ORG_ID);

        expect(unlockEvent).not.toHaveBeenCalled();
        expect(result).toEqual({ reconciled: false });
    });

    it("order.type = 'recurring' → NO unlock, reconciled: false", async () => {
        getEventCheckoutInfo.mockResolvedValue({ tier: "free", creemCheckoutId: CHECKOUT_ID });
        rawRetrieveCheckout.mockResolvedValue(
            makePaidCheckout({ order: { id: ORDER_ID, type: "recurring", status: "paid", mode: "test", object: "order", product: "p", amount: 0, currency: "EUR", createdAt: new Date(), updatedAt: new Date() } }),
        );

        const { reconcileEventUnlock } = await import(
            "~~/server/services/eventReconcile.service"
        );
        const result = await reconcileEventUnlock(EVENT_ID, ORG_ID);

        expect(unlockEvent).not.toHaveBeenCalled();
        expect(result).toEqual({ reconciled: false });
    });

    it("metadata.eventId mismatch → NO unlock, reconciled: false", async () => {
        getEventCheckoutInfo.mockResolvedValue({ tier: "free", creemCheckoutId: CHECKOUT_ID });
        rawRetrieveCheckout.mockResolvedValue(
            makePaidCheckout({ metadata: { eventId: "evt_DIFFERENT", organizationId: ORG_ID } }),
        );

        const { reconcileEventUnlock } = await import(
            "~~/server/services/eventReconcile.service"
        );
        const result = await reconcileEventUnlock(EVENT_ID, ORG_ID);

        expect(unlockEvent).not.toHaveBeenCalled();
        expect(result).toEqual({ reconciled: false });
    });

    it("tier already 'celebration' → NO API call, reconciled: false (early return)", async () => {
        getEventCheckoutInfo.mockResolvedValue({
            tier: "celebration",
            creemCheckoutId: CHECKOUT_ID,
        });

        const { reconcileEventUnlock } = await import(
            "~~/server/services/eventReconcile.service"
        );
        const result = await reconcileEventUnlock(EVENT_ID, ORG_ID);

        expect(createCreemClient).not.toHaveBeenCalled();
        expect(rawRetrieveCheckout).not.toHaveBeenCalled();
        expect(unlockEvent).not.toHaveBeenCalled();
        expect(result).toEqual({ reconciled: false });
    });

    it("creemCheckoutId is null → NO API call, reconciled: false (early return)", async () => {
        getEventCheckoutInfo.mockResolvedValue({ tier: "free", creemCheckoutId: null });

        const { reconcileEventUnlock } = await import(
            "~~/server/services/eventReconcile.service"
        );
        const result = await reconcileEventUnlock(EVENT_ID, ORG_ID);

        expect(createCreemClient).not.toHaveBeenCalled();
        expect(rawRetrieveCheckout).not.toHaveBeenCalled();
        expect(unlockEvent).not.toHaveBeenCalled();
        expect(result).toEqual({ reconciled: false });
    });

    it("event not found (getEventCheckoutInfo returns undefined) → NO API call, reconciled: false", async () => {
        getEventCheckoutInfo.mockResolvedValue(undefined);

        const { reconcileEventUnlock } = await import(
            "~~/server/services/eventReconcile.service"
        );
        const result = await reconcileEventUnlock(EVENT_ID, ORG_ID);

        expect(createCreemClient).not.toHaveBeenCalled();
        expect(rawRetrieveCheckout).not.toHaveBeenCalled();
        expect(unlockEvent).not.toHaveBeenCalled();
        expect(result).toEqual({ reconciled: false });
    });

    it("Creem API throws → catches error, returns reconciled: false (never re-throws)", async () => {
        getEventCheckoutInfo.mockResolvedValue({ tier: "free", creemCheckoutId: CHECKOUT_ID });
        rawRetrieveCheckout.mockRejectedValue(new Error("Network error"));

        const { reconcileEventUnlock } = await import(
            "~~/server/services/eventReconcile.service"
        );

        // Must not throw
        const result = await reconcileEventUnlock(EVENT_ID, ORG_ID);

        expect(unlockEvent).not.toHaveBeenCalled();
        expect(result).toEqual({ reconciled: false });
    });

    it("checkout with no order object → reconciled: false", async () => {
        getEventCheckoutInfo.mockResolvedValue({ tier: "free", creemCheckoutId: CHECKOUT_ID });
        rawRetrieveCheckout.mockResolvedValue(
            makePaidCheckout({ order: undefined }),
        );

        const { reconcileEventUnlock } = await import(
            "~~/server/services/eventReconcile.service"
        );
        const result = await reconcileEventUnlock(EVENT_ID, ORG_ID);

        expect(unlockEvent).not.toHaveBeenCalled();
        expect(result).toEqual({ reconciled: false });
    });
});
