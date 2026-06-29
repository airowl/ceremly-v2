/**
 * Tests for the cron route cleanup-stale-events.get.ts (task 4.6, TDD).
 *
 * Stubs for Nitro auto-imports are set up before the module is loaded:
 * - defineEventHandler: in vi.hoisted() (executed before the module is parsed)
 * - getHeader / useRuntimeConfig / createError: in beforeEach (invocation)
 *
 * createError is already polyfilled by test/setup.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Import dopo i mock
import handler from "./cleanup-stale-events.get";

// --- vi.hoisted: initialized BEFORE vi.mock hoists the factories ---
const mocks = vi.hoisted(() => {
    // defineEventHandler must exist on globalThis BEFORE the module is imported.
    // We transform it to an identity so the route's default export = the handler fn.
    (globalThis as Record<string, unknown>).defineEventHandler = (fn: unknown) => fn;

    return {
        warn: vi.fn(),
        del: vi.fn(),
        requireAdminApiKey: vi.fn(),
    };
});

vi.mock("~~/server/services/eventCleanup.service", () => ({
    processStaleEventsWarn: mocks.warn,
    processStaleEventsDelete: mocks.del,
}));

vi.mock("~~/server/utils/requireAdminApiKey", () => ({
    requireAdminApiKey: mocks.requireAdminApiKey,
}));

// Save original values of globals we mutate in beforeEach
const originalGetHeader = (globalThis as Record<string, unknown>).getHeader;
const originalUseRuntimeConfig = (globalThis as Record<string, unknown>).useRuntimeConfig;

describe("cron/cleanup-stale-events", () => {
    const CRON_SECRET = "test-secret-xyz";

    // Factory for creating a fake H3Event with configurable headers
    function fakeEvent(headers: Record<string, string | undefined> = {}) {
        return {
            _headers: headers,
        } as unknown as Parameters<typeof handler>[0];
    }

    beforeEach(() => {
        vi.resetAllMocks();

        // Default: warn and delete return valid values
        mocks.warn.mockResolvedValue({ warned: 0, skipped: 0 });
        mocks.del.mockResolvedValue({ deleted: 0, skipped: 0 });
        mocks.requireAdminApiKey.mockResolvedValue(undefined);
    });

    afterEach(() => {
        // Restore globals to avoid leaking into other test files
        (globalThis as Record<string, unknown>).getHeader = originalGetHeader;
        (globalThis as Record<string, unknown>).useRuntimeConfig = originalUseRuntimeConfig;
    });

    it("(a) x-vercel-cron present → warn then delete, requireAdminApiKey NOT called", async () => {
        (globalThis as Record<string, unknown>).getHeader = (
            _event: unknown,
            name: string
        ) => (name === "x-vercel-cron" ? "1" : undefined);

        (globalThis as Record<string, unknown>).useRuntimeConfig = () => ({
            cronSecret: undefined,
        });

        const event = fakeEvent();
        const result = await handler(event);

        // warn must be called BEFORE delete (invocation order)
        const warnOrder = mocks.warn.mock.invocationCallOrder[0];
        const delOrder = mocks.del.mock.invocationCallOrder[0];
        expect(warnOrder).toBeDefined();
        expect(delOrder).toBeDefined();
        expect(warnOrder).toBeLessThan(delOrder!);

        expect(mocks.requireAdminApiKey).not.toHaveBeenCalled();
        expect(result).toEqual({ warn: { warned: 0, skipped: 0 }, delete: { deleted: 0, skipped: 0 } });
    });

    it("(b) Authorization: Bearer cronSecret → requireAdminApiKey NOT called", async () => {
        (globalThis as Record<string, unknown>).getHeader = (
            _event: unknown,
            name: string
        ) => {
            if (name === "x-vercel-cron") return undefined;
            if (name === "authorization") return `Bearer ${CRON_SECRET}`;
            return undefined;
        };

        (globalThis as Record<string, unknown>).useRuntimeConfig = () => ({
            cronSecret: CRON_SECRET,
        });

        const event = fakeEvent();
        await handler(event);

        expect(mocks.requireAdminApiKey).not.toHaveBeenCalled();
        expect(mocks.warn).toHaveBeenCalledOnce();
        expect(mocks.del).toHaveBeenCalledOnce();
    });

    it("(c) no cron auth → requireAdminApiKey called once", async () => {
        (globalThis as Record<string, unknown>).getHeader = (
            _event: unknown,
            _name: string
        ) => undefined;

        (globalThis as Record<string, unknown>).useRuntimeConfig = () => ({
            cronSecret: CRON_SECRET,
        });

        const event = fakeEvent();
        await handler(event);

        expect(mocks.requireAdminApiKey).toHaveBeenCalledOnce();
        expect(mocks.requireAdminApiKey).toHaveBeenCalledWith(event);
    });
});
