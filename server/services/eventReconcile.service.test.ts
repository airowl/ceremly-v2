/**
 * TDD — eventReconcile.service.ts
 *
 * Mock strategy (mirrors checkout.service.test.ts):
 * - @creem_io/better-auth/server → searchTransactions mocked
 * - server/repositories/eventRepository → unlockEvent mocked
 * - server/utils/runtimeConfig → runtimeConfig mocked
 *
 * NOTE (CRITICAL): The real creem SDK response has `items` (not `transactions`),
 * and `TransactionEntity` has NO `metadata` field (it is stripped by the Zod
 * schema parser before returning). The implementation works against the declared
 * `@creem_io/better-auth` wrapper contract (`transactions`, `TransactionData.metadata`)
 * with an `items` fallback, and these tests use mock data.
 * See fix-7.1-report.md for full details.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mock handles (declared before vi.mock hoisting) ----
const searchTransactions = vi.fn();
const unlockEvent = vi.fn();

vi.mock("@creem_io/better-auth/server", () => ({
    searchTransactions: (...a: unknown[]) => searchTransactions(...a),
}));

vi.mock("~~/server/repositories/eventRepository", () => ({
    unlockEvent: (...a: unknown[]) => unlockEvent(...a),
}));

vi.mock("~~/server/utils/runtimeConfig", () => ({
    runtimeConfig: {
        creemApiKey: "test_api_key",
        creemProductIdCelebration: "prod_celebration_test",
        public: {
            appEnv: "development",
        },
    },
}));

// ---- Test helpers ----
const EVENT_ID = "evt_abc";
const ORG_ID = "org_xyz";
const ORDER_ID = "ord_111";
const PRODUCT_ID = "prod_celebration_test";

/** Build a paid one-time transaction with metadata (declared shape) */
function makePaidTx(overrides: Record<string, unknown> = {}) {
    return {
        id: "tx_001",
        type: "payment",
        status: "paid",
        amount: 1500,
        currency: "EUR",
        customer: { id: "cust_1", email: "a@b.com" },
        order_id: ORDER_ID,
        created_at: Date.now(),
        metadata: { eventId: EVENT_ID, organizationId: ORG_ID },
        ...overrides,
    };
}

/** Return a SearchTransactionsResponse (declared wrapper shape) */
function mockSearchResult(txs: unknown[]) {
    return { transactions: txs, total: txs.length, page: 1 };
}

describe("reconcileOneTimeUnlocks", () => {
    beforeEach(() => {
        vi.resetModules();
        [searchTransactions, unlockEvent].forEach((m) => m.mockReset());
        unlockEvent.mockResolvedValue(undefined);
    });

    it("happy path: paid one-time tx with metadata → unlockEvent called with correct args", async () => {
        searchTransactions.mockResolvedValue(mockSearchResult([makePaidTx()]));

        const { reconcileOneTimeUnlocks } = await import(
            "~~/server/services/eventReconcile.service"
        );
        const result = await reconcileOneTimeUnlocks();

        expect(searchTransactions).toHaveBeenCalledOnce();
        const [config, filters] = searchTransactions.mock.calls[0] as [
            Record<string, unknown>,
            Record<string, unknown>,
        ];
        expect(config).toMatchObject({ apiKey: "test_api_key", testMode: true });
        expect(filters).toMatchObject({ productId: PRODUCT_ID });

        expect(unlockEvent).toHaveBeenCalledOnce();
        expect(unlockEvent).toHaveBeenCalledWith(EVENT_ID, ORG_ID, ORDER_ID);

        expect(result).toMatchObject({ checked: 1, reconciled: 1 });
    });

    it("recurring transaction (type='invoice') is NOT unlocked", async () => {
        searchTransactions.mockResolvedValue(
            mockSearchResult([makePaidTx({ type: "invoice" })]),
        );

        const { reconcileOneTimeUnlocks } = await import(
            "~~/server/services/eventReconcile.service"
        );
        const result = await reconcileOneTimeUnlocks();

        expect(unlockEvent).not.toHaveBeenCalled();
        expect(result).toMatchObject({ checked: 0, reconciled: 0 });
    });

    it("pending/refunded status is NOT unlocked", async () => {
        searchTransactions.mockResolvedValue(
            mockSearchResult([
                makePaidTx({ status: "pending" }),
                makePaidTx({ status: "refunded" }),
                makePaidTx({ status: "failed" }),
            ]),
        );

        const { reconcileOneTimeUnlocks } = await import(
            "~~/server/services/eventReconcile.service"
        );
        const result = await reconcileOneTimeUnlocks();

        expect(unlockEvent).not.toHaveBeenCalled();
        expect(result).toMatchObject({ checked: 0, reconciled: 0 });
    });

    it("tx missing metadata.eventId is NOT unlocked", async () => {
        searchTransactions.mockResolvedValue(
            mockSearchResult([makePaidTx({ metadata: { organizationId: ORG_ID } })]),
        );

        const { reconcileOneTimeUnlocks } = await import(
            "~~/server/services/eventReconcile.service"
        );
        const result = await reconcileOneTimeUnlocks();

        expect(unlockEvent).not.toHaveBeenCalled();
        expect(result).toMatchObject({ checked: 0, reconciled: 0 });
    });

    it("tx missing metadata.organizationId is NOT unlocked", async () => {
        searchTransactions.mockResolvedValue(
            mockSearchResult([makePaidTx({ metadata: { eventId: EVENT_ID } })]),
        );

        const { reconcileOneTimeUnlocks } = await import(
            "~~/server/services/eventReconcile.service"
        );
        const result = await reconcileOneTimeUnlocks();

        expect(unlockEvent).not.toHaveBeenCalled();
        expect(result).toMatchObject({ checked: 0, reconciled: 0 });
    });

    it("tx with no order_id is NOT unlocked", async () => {
        searchTransactions.mockResolvedValue(
            mockSearchResult([makePaidTx({ order_id: undefined })]),
        );

        const { reconcileOneTimeUnlocks } = await import(
            "~~/server/services/eventReconcile.service"
        );
        const result = await reconcileOneTimeUnlocks();

        expect(unlockEvent).not.toHaveBeenCalled();
        expect(result).toMatchObject({ checked: 0, reconciled: 0 });
    });

    it("opts.eventId filters to only that event", async () => {
        const otherTx = makePaidTx({
            id: "tx_002",
            order_id: "ord_222",
            metadata: { eventId: "evt_OTHER", organizationId: ORG_ID },
        });
        searchTransactions.mockResolvedValue(
            mockSearchResult([makePaidTx(), otherTx]),
        );

        const { reconcileOneTimeUnlocks } = await import(
            "~~/server/services/eventReconcile.service"
        );
        const result = await reconcileOneTimeUnlocks({ eventId: EVENT_ID });

        expect(unlockEvent).toHaveBeenCalledOnce();
        expect(unlockEvent).toHaveBeenCalledWith(EVENT_ID, ORG_ID, ORDER_ID);
        expect(result).toMatchObject({ checked: 1, reconciled: 1 });
    });

    it("celebration product id missing/placeholder → returns {0,0}, searchTransactions NOT called", async () => {
        // Use the main module import (hoisted mocks still active) but patch runtimeConfig
        // by temporarily overriding creemProductIdCelebration to undefined.
        // We re-import after module reset so the guard path is exercised.
        vi.resetModules();
        // Re-register all mocks after reset
        vi.doMock("@creem_io/better-auth/server", () => ({
            searchTransactions: (...a: unknown[]) => searchTransactions(...a),
        }));
        vi.doMock("~~/server/repositories/eventRepository", () => ({
            unlockEvent: (...a: unknown[]) => unlockEvent(...a),
        }));
        vi.doMock("~~/server/utils/runtimeConfig", () => ({
            runtimeConfig: {
                creemApiKey: "test_api_key",
                creemProductIdCelebration: undefined, // missing → no-op
                public: { appEnv: "development" },
            },
        }));

        const { reconcileOneTimeUnlocks } = await import(
            "~~/server/services/eventReconcile.service"
        );
        const result = await reconcileOneTimeUnlocks();

        expect(searchTransactions).not.toHaveBeenCalled();
        expect(result).toEqual({ checked: 0, reconciled: 0 });

        // Restore module registry for subsequent tests
        vi.resetModules();
        vi.doMock("@creem_io/better-auth/server", () => ({
            searchTransactions: (...a: unknown[]) => searchTransactions(...a),
        }));
        vi.doMock("~~/server/repositories/eventRepository", () => ({
            unlockEvent: (...a: unknown[]) => unlockEvent(...a),
        }));
        vi.doMock("~~/server/utils/runtimeConfig", () => ({
            runtimeConfig: {
                creemApiKey: "test_api_key",
                creemProductIdCelebration: "prod_celebration_test",
                public: { appEnv: "development" },
            },
        }));
    });

    it(".env.example placeholder sentinel 'prod_celebration_id' → returns {0,0}, searchTransactions NOT called", async () => {
        vi.resetModules();
        vi.doMock("@creem_io/better-auth/server", () => ({
            searchTransactions: (...a: unknown[]) => searchTransactions(...a),
        }));
        vi.doMock("~~/server/repositories/eventRepository", () => ({
            unlockEvent: (...a: unknown[]) => unlockEvent(...a),
        }));
        vi.doMock("~~/server/utils/runtimeConfig", () => ({
            runtimeConfig: {
                creemApiKey: "test_api_key",
                creemProductIdCelebration: "prod_celebration_id", // .env.example sentinel
                public: { appEnv: "development" },
            },
        }));

        const { reconcileOneTimeUnlocks } = await import(
            "~~/server/services/eventReconcile.service"
        );
        const result = await reconcileOneTimeUnlocks();

        expect(searchTransactions).not.toHaveBeenCalled();
        expect(result).toEqual({ checked: 0, reconciled: 0 });

        // Restore for subsequent tests
        vi.resetModules();
        vi.doMock("@creem_io/better-auth/server", () => ({
            searchTransactions: (...a: unknown[]) => searchTransactions(...a),
        }));
        vi.doMock("~~/server/repositories/eventRepository", () => ({
            unlockEvent: (...a: unknown[]) => unlockEvent(...a),
        }));
        vi.doMock("~~/server/utils/runtimeConfig", () => ({
            runtimeConfig: {
                creemApiKey: "test_api_key",
                creemProductIdCelebration: "prod_celebration_test",
                public: { appEnv: "development" },
            },
        }));
    });

    it("one failing unlock does not abort others", async () => {
        const tx1 = makePaidTx({ id: "tx_001", order_id: "ord_001" });
        const tx2 = makePaidTx({
            id: "tx_002",
            order_id: "ord_002",
            metadata: { eventId: "evt_TWO", organizationId: ORG_ID },
        });
        searchTransactions.mockResolvedValue(mockSearchResult([tx1, tx2]));

        // First call throws, second succeeds
        unlockEvent
            .mockRejectedValueOnce(new Error("DB error"))
            .mockResolvedValueOnce(undefined);

        const { reconcileOneTimeUnlocks } = await import(
            "~~/server/services/eventReconcile.service"
        );
        // Must not throw even though one unlock fails
        const result = await reconcileOneTimeUnlocks();

        expect(unlockEvent).toHaveBeenCalledTimes(2);
        // Both transactions were "kept": checked=2.
        // reconciled=1: only the successful unlock increments reconciled.
        expect(result.checked).toBe(2);
        expect(result.reconciled).toBe(1);
    });

    it("runtime fallback: response with `items` array works (real SDK shape)", async () => {
        // The real creem SDK returns { items: [...], pagination: {...} }, not { transactions: [...] }
        // The implementation must handle both shapes.
        const tx = makePaidTx();
        searchTransactions.mockResolvedValue({ items: [tx] });

        const { reconcileOneTimeUnlocks } = await import(
            "~~/server/services/eventReconcile.service"
        );
        const result = await reconcileOneTimeUnlocks();

        expect(unlockEvent).toHaveBeenCalledOnce();
        expect(result).toMatchObject({ checked: 1, reconciled: 1 });
    });
});
