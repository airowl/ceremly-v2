import { describe, it, expect, vi, beforeEach } from "vitest";

// Nitro auto-import globals must be set BEFORE the module under test is evaluated.
// vi.hoisted() runs before any import/vi.mock() in the file.
// vi.stubGlobal() is used so Vitest auto-restores these stubs after this file (no process-wide leaks).
const { readRawBodyMock, getHeaderMock, createErrorMock } = vi.hoisted(() => {
    const readRawBodyMock = vi.fn(() => Promise.resolve('{"type":"email.delivered"}'));
    const getHeaderMock = vi.fn((_e: unknown, n: string) => (n === "svix-id" ? "id1" : "x"));
    const createErrorMock = vi.fn((o: { statusCode: number }) => Object.assign(new Error("err"), o));

    // Use vi.stubGlobal so Vitest restores the originals after this file runs
    vi.stubGlobal("defineEventHandler", (h: unknown) => h);
    vi.stubGlobal("readRawBody", readRawBodyMock);
    vi.stubGlobal("getHeader", getHeaderMock);
    vi.stubGlobal("createError", createErrorMock);

    return { readRawBodyMock, getHeaderMock, createErrorMock };
});

const { handleResendEvent, verifyResendEvent, isOwnDomain } = vi.hoisted(() => ({
    handleResendEvent: vi.fn(),
    verifyResendEvent: vi.fn(() => ({
        type: "email.delivered",
        created_at: "2026-01-01T00:00:00Z",
        data: { from: "noreply@airowlgasga.dev", to: ["a@x.com"], email_id: "m1" },
    })),
    isOwnDomain: vi.fn(() => true),
}));

vi.mock("~~/server/services/emailWebhook.service", () => ({ verifyResendEvent, isOwnDomain, handleResendEvent }));

const { get, set } = vi.hoisted(() => ({
    get: vi.fn((): Promise<string | null> => Promise.resolve(null)),
    set: vi.fn(),
}));
vi.mock("~~/server/utils/drivers", () => ({ cacheClient: { get, set } }));

// Mutable mock object: tests reassign `resendWebhookSecret` directly to exercise
// the misconfig branch, restored to a truthy default in beforeEach.
const { mockRuntimeConfig } = vi.hoisted(() => ({
    mockRuntimeConfig: { resendWebhookSecret: "whsec_test" as string },
}));
vi.mock("~~/server/utils/runtimeConfig", () => ({ runtimeConfig: mockRuntimeConfig }));

import handler from "./resend.post";

beforeEach(() => {
    vi.clearAllMocks();
    // Reset stubs to defaults after each test
    readRawBodyMock.mockImplementation(() => Promise.resolve('{"type":"email.delivered"}'));
    getHeaderMock.mockImplementation((_e: unknown, n: string) => (n === "svix-id" ? "id1" : "x"));
    get.mockImplementation((): Promise<string | null> => Promise.resolve(null));
    mockRuntimeConfig.resendWebhookSecret = "whsec_test";
});

describe("POST /api/webhooks/resend", () => {
    it("processes and sets dedup to success", async () => {
        const r = await (handler as any)({});
        expect(handleResendEvent).toHaveBeenCalledOnce();
        expect(set).toHaveBeenCalledWith("resend:webhook:id1", "1", 86400);
        expect(r).toEqual({ ok: true });
    });

    it("dedup hit → does not reprocess", async () => {
        get.mockResolvedValueOnce("1");
        const r = await (handler as any)({});
        expect(handleResendEvent).not.toHaveBeenCalled();
        expect(r).toEqual({ ok: true, deduped: true });
    });

    it("invalid signature → throws 401", async () => {
        verifyResendEvent.mockImplementationOnce(() => {
            throw new Error("bad signature");
        });
        const err = await (handler as any)({}).catch((e: unknown) => e);
        expect((err as any).statusCode).toBe(401);
    });

    it("external domain → skip without processing", async () => {
        isOwnDomain.mockReturnValueOnce(false);
        const r = await (handler as any)({});
        expect(handleResendEvent).not.toHaveBeenCalled();
        expect(r).toEqual({ ok: true, skipped: "foreign-domain" });
    });

    it("empty body → throws 400", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (readRawBodyMock as any).mockImplementationOnce(() => Promise.resolve(undefined));
        const err = await (handler as any)({}).catch((e: unknown) => e);
        expect((err as any).statusCode).toBe(400);
    });

    it("responds 500 (not 401) when the webhook secret is not configured", async () => {
        mockRuntimeConfig.resendWebhookSecret = "";
        const err = await (handler as any)({}).catch((e: unknown) => e);
        expect((err as any).statusCode).toBe(500);
        expect(verifyResendEvent).not.toHaveBeenCalled();
    });
});
