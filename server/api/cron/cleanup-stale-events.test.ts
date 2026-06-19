/**
 * Test per il cron route cleanup-stale-events.get.ts (task 4.6, TDD).
 *
 * Stubbano gli auto-import Nitro prima che il modulo venga caricato:
 * - defineEventHandler: in vi.hoisted() (eseguito prima del parsing del modulo)
 * - getHeader / useRuntimeConfig / createError: in beforeEach (invocazione)
 *
 * createError è già polyfillato da test/setup.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Import dopo i mock
import handler from "./cleanup-stale-events.get";

// --- vi.hoisted: inizializzato PRIMA che vi.mock hoisti le factory ---
const mocks = vi.hoisted(() => {
    // defineEventHandler deve esistere su globalThis PRIMA dell'import del modulo.
    // Lo trasformiamo in identity così il default export del route = la handler fn.
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

// Salva i valori originali dei globali che mutiamo in beforeEach
const originalGetHeader = (globalThis as Record<string, unknown>).getHeader;
const originalUseRuntimeConfig = (globalThis as Record<string, unknown>).useRuntimeConfig;

describe("cron/cleanup-stale-events", () => {
    const CRON_SECRET = "test-secret-xyz";

    // Factory per creare un fake H3Event con headers configurabili
    function fakeEvent(headers: Record<string, string | undefined> = {}) {
        return {
            _headers: headers,
        } as unknown as Parameters<typeof handler>[0];
    }

    beforeEach(() => {
        vi.resetAllMocks();

        // Default: warn e delete ritornano valori validi
        mocks.warn.mockResolvedValue({ warned: 0, skipped: 0 });
        mocks.del.mockResolvedValue({ deleted: 0, skipped: 0 });
        mocks.requireAdminApiKey.mockResolvedValue(undefined);
    });

    afterEach(() => {
        // Ripristina i globali per non leakare in altri test file
        (globalThis as Record<string, unknown>).getHeader = originalGetHeader;
        (globalThis as Record<string, unknown>).useRuntimeConfig = originalUseRuntimeConfig;
    });

    it("(a) x-vercel-cron presente → warn poi delete, requireAdminApiKey NON chiamato", async () => {
        (globalThis as Record<string, unknown>).getHeader = (
            _event: unknown,
            name: string
        ) => (name === "x-vercel-cron" ? "1" : undefined);

        (globalThis as Record<string, unknown>).useRuntimeConfig = () => ({
            cronSecret: undefined,
        });

        const event = fakeEvent();
        const result = await handler(event);

        // warn deve essere chiamato PRIMA di delete (ordine di invocazione)
        const warnOrder = mocks.warn.mock.invocationCallOrder[0];
        const delOrder = mocks.del.mock.invocationCallOrder[0];
        expect(warnOrder).toBeDefined();
        expect(delOrder).toBeDefined();
        expect(warnOrder).toBeLessThan(delOrder!);

        expect(mocks.requireAdminApiKey).not.toHaveBeenCalled();
        expect(result).toEqual({ warn: { warned: 0, skipped: 0 }, delete: { deleted: 0, skipped: 0 } });
    });

    it("(b) Authorization: Bearer cronSecret → requireAdminApiKey NON chiamato", async () => {
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

    it("(c) nessuna auth cron → requireAdminApiKey chiamato una volta", async () => {
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
