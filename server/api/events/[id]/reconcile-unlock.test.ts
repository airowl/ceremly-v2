/**
 * Tests for the route POST /api/events/:id/reconcile-unlock (fix 7.3).
 *
 * Stubs for Nitro auto-imports are set up before the module is loaded:
 * - defineEventHandler: in vi.hoisted() (executed before the module is parsed)
 * - getRouterParam / createError / requireAuth: via globalThis
 *
 * createError is already polyfilled by test/setup.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Import dopo i mock
import handler from "./reconcile-unlock.post";

// --- vi.hoisted: initialized BEFORE vi.mock hoists the factories ---
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

        // requireAuth and requireWrite are Nitro auto-imports / aliases; mock via globalThis
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

    it("(a) happy path → delegates to reconcileEventUnlock and returns { reconciled }", async () => {
        mocks.reconcileEventUnlock.mockResolvedValue({ reconciled: true });

        const event = fakeEvent({ id: EVENT_ID });
        const result = await handler(event);

        expect(mocks.requireWrite).toHaveBeenCalledOnce();
        expect(mocks.reconcileEventUnlock).toHaveBeenCalledWith(EVENT_ID, ORG_ID);
        expect(result).toEqual({ reconciled: true });
    });

    it("(b) missing id → 400", async () => {
        const event = fakeEvent({});

        await expect(handler(event)).rejects.toMatchObject({
            statusCode: 400,
            statusMessage: "Missing event id",
        });

        expect(mocks.reconcileEventUnlock).not.toHaveBeenCalled();
    });
});
