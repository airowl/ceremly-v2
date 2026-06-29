/**
 * Tests for the POST /api/events/:id/unlock route (fix 7.5b).
 *
 * Stubs Nitro auto-imports before the module is loaded:
 * - defineEventHandler: in vi.hoisted() (executed before module parsing)
 * - getRouterParam / createError / requireAuth: via globalThis
 *
 * createError is already polyfilled in test/setup.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Import after mocks
import handler from "./unlock.post";

// --- vi.hoisted: initialized BEFORE vi.mock hoists the factories ---
const mocks = vi.hoisted(() => {
    (globalThis as Record<string, unknown>).defineEventHandler = (fn: unknown) => fn;

    return {
        requireAuth: vi.fn(),
        requireWrite: vi.fn(),
        createCelebrationCheckout: vi.fn(),
    };
});

vi.mock("~~/server/utils/permissions", () => ({
    requireWrite: mocks.requireWrite,
}));

vi.mock("~~/server/services/checkout.service", () => ({
    createCelebrationCheckout: mocks.createCelebrationCheckout,
}));

describe("events/[id]/unlock.post", () => {
    const EVENT_ID = "evt-123";

    function fakeEvent(routerParams: Record<string, string | undefined> = {}) {
        return {
            context: {},
            _routerParams: routerParams,
        } as unknown as Parameters<typeof handler>[0];
    }

    beforeEach(() => {
        vi.resetAllMocks();

        // requireAuth and getRouterParam are Nitro auto-imports; mock globalThis
        (globalThis as Record<string, unknown>).requireAuth = mocks.requireAuth;
        (globalThis as Record<string, unknown>).getRouterParam = (
            _event: unknown,
            key: string,
        ) => {
            const e = _event as { _routerParams: Record<string, string | undefined> };
            return e._routerParams[key];
        };

        mocks.requireAuth.mockResolvedValue(undefined);
        mocks.requireWrite.mockResolvedValue({ id: "org-abc", role: "owner" });
        mocks.createCelebrationCheckout.mockResolvedValue({ url: "https://checkout.example.com/pay" });
    });

    it("(a) happy path → delegates to createCelebrationCheckout and returns { url }", async () => {
        const checkoutUrl = "https://checkout.example.com/pay";
        mocks.createCelebrationCheckout.mockResolvedValue({ url: checkoutUrl });

        const event = fakeEvent({ id: EVENT_ID });
        const result = await handler(event);

        expect(mocks.requireAuth).toHaveBeenCalledOnce();
        expect(mocks.requireWrite).toHaveBeenCalledOnce();
        expect(mocks.createCelebrationCheckout).toHaveBeenCalledWith(event, EVENT_ID);
        expect(result).toEqual({ url: checkoutUrl });
    });

    it("(b) missing id → 400 and service NOT called", async () => {
        const event = fakeEvent({});

        await expect(handler(event)).rejects.toMatchObject({
            statusCode: 400,
            statusMessage: "Missing event id",
        });

        expect(mocks.createCelebrationCheckout).not.toHaveBeenCalled();
    });
});
