/**
 * Test per il route POST /api/events/:id/unlock (fix 7.5b).
 *
 * Stubbano gli auto-import Nitro prima che il modulo venga caricato:
 * - defineEventHandler: in vi.hoisted() (eseguito prima del parsing del modulo)
 * - getRouterParam / createError / requireAuth: via globalThis
 *
 * createError è già polyfillato da test/setup.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Import dopo i mock
import handler from "./unlock.post";

// --- vi.hoisted: inizializzato PRIMA che vi.mock hoisti le factory ---
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

        // requireAuth e getRouterParam sono auto-import Nitro; mock globalThis
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

    it("(a) happy path → delega a createCelebrationCheckout e ritorna { url }", async () => {
        const checkoutUrl = "https://checkout.example.com/pay";
        mocks.createCelebrationCheckout.mockResolvedValue({ url: checkoutUrl });

        const event = fakeEvent({ id: EVENT_ID });
        const result = await handler(event);

        expect(mocks.requireAuth).toHaveBeenCalledOnce();
        expect(mocks.requireWrite).toHaveBeenCalledOnce();
        expect(mocks.createCelebrationCheckout).toHaveBeenCalledWith(event, EVENT_ID);
        expect(result).toEqual({ url: checkoutUrl });
    });

    it("(b) id mancante → 400 e service NON chiamato", async () => {
        const event = fakeEvent({});

        await expect(handler(event)).rejects.toMatchObject({
            statusCode: 400,
            statusMessage: "Missing event id",
        });

        expect(mocks.createCelebrationCheckout).not.toHaveBeenCalled();
    });
});
