/**
 * Test per il route POST /api/events/:id/reconcile-unlock (fix 7.3).
 *
 * Stubbano gli auto-import Nitro prima che il modulo venga caricato:
 * - defineEventHandler: in vi.hoisted() (eseguito prima del parsing del modulo)
 * - getRouterParam / createError / requireAuth: via globalThis
 *
 * createError è già polyfillato da test/setup.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- vi.hoisted: inizializzato PRIMA che vi.mock hoisti le factory ---
const mocks = vi.hoisted(() => {
    (globalThis as Record<string, unknown>).defineEventHandler = (fn: unknown) => fn;

    return {
        requireAuth: vi.fn(),
        requireWrite: vi.fn(),
        reconcileEventUnlock: vi.fn(),
    };
});

vi.mock("~~/server/utils/permissions", () => ({
    requireWrite: mocks.requireWrite,
}));

vi.mock("~~/server/services/eventReconcile.service", () => ({
    reconcileEventUnlock: mocks.reconcileEventUnlock,
}));

// Import dopo i mock
import handler from "./reconcile-unlock.post";

describe("events/[id]/reconcile-unlock.post", () => {
    const ORG_ID = "org-abc";
    const EVENT_ID = "evt-123";

    function fakeEvent(routerParams: Record<string, string | undefined> = {}) {
        return {
            context: {},
            _routerParams: routerParams,
        } as unknown as Parameters<typeof handler>[0];
    }

    beforeEach(() => {
        vi.resetAllMocks();

        // requireAuth e requireWrite sono auto-import Nitro / alias; mock globalThis
        (globalThis as Record<string, unknown>).requireAuth = mocks.requireAuth;
        (globalThis as Record<string, unknown>).getRouterParam = (
            _event: unknown,
            key: string,
        ) => {
            const e = _event as { _routerParams: Record<string, string | undefined> };
            return e._routerParams[key];
        };

        mocks.requireAuth.mockResolvedValue(undefined);
        mocks.requireWrite.mockResolvedValue({ id: ORG_ID, role: "owner" });
        mocks.reconcileEventUnlock.mockResolvedValue({ reconciled: false });
    });

    it("(a) happy path → delega a reconcileEventUnlock e ritorna { reconciled }", async () => {
        mocks.reconcileEventUnlock.mockResolvedValue({ reconciled: true });

        const event = fakeEvent({ id: EVENT_ID });
        const result = await handler(event);

        expect(mocks.requireWrite).toHaveBeenCalledOnce();
        expect(mocks.reconcileEventUnlock).toHaveBeenCalledWith(EVENT_ID, ORG_ID);
        expect(result).toEqual({ reconciled: true });
    });

    it("(b) id mancante → 400", async () => {
        const event = fakeEvent({});

        await expect(handler(event)).rejects.toMatchObject({
            statusCode: 400,
            statusMessage: "Missing event id",
        });

        expect(mocks.reconcileEventUnlock).not.toHaveBeenCalled();
    });
});
