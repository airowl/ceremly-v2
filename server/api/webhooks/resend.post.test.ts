import { describe, it, expect, vi, beforeEach } from "vitest";

// Nitro auto-import globals must be set BEFORE the module under test is evaluated.
// vi.hoisted() runs before any import/vi.mock() in the file.
const { readRawBodyMock, getHeaderMock, createErrorMock } = vi.hoisted(() => {
    const readRawBodyMock = vi.fn(() => Promise.resolve('{"type":"email.delivered"}'));
    const getHeaderMock = vi.fn((_e: unknown, n: string) => (n === "svix-id" ? "id1" : "x"));
    const createErrorMock = vi.fn((o: { statusCode: number }) => Object.assign(new Error("err"), o));

    // Stub globals before module evaluation
    Object.assign(globalThis, {
        defineEventHandler: (h: unknown) => h,
        readRawBody: readRawBodyMock,
        getHeader: getHeaderMock,
        createError: createErrorMock,
    });

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

import handler from "./resend.post";

beforeEach(() => {
    vi.clearAllMocks();
    // Reset stubs to defaults after each test
    readRawBodyMock.mockImplementation(() => Promise.resolve('{"type":"email.delivered"}'));
    getHeaderMock.mockImplementation((_e: unknown, n: string) => (n === "svix-id" ? "id1" : "x"));
    get.mockImplementation((): Promise<string | null> => Promise.resolve(null));
});

describe("POST /api/webhooks/resend", () => {
    it("processa e setta il dedup a successo", async () => {
        const r = await (handler as any)({});
        expect(handleResendEvent).toHaveBeenCalledOnce();
        expect(set).toHaveBeenCalledWith("resend:webhook:id1", "1", 86400);
        expect(r).toEqual({ ok: true });
    });

    it("dedup hit → non riprocessa", async () => {
        get.mockResolvedValueOnce("1");
        const r = await (handler as any)({});
        expect(handleResendEvent).not.toHaveBeenCalled();
        expect(r).toEqual({ ok: true, deduped: true });
    });

    it("firma invalida → lancia 401", async () => {
        verifyResendEvent.mockImplementationOnce(() => {
            throw new Error("bad signature");
        });
        const err = await (handler as any)({}).catch((e: unknown) => e);
        expect((err as any).statusCode).toBe(401);
    });

    it("dominio esterno → skip senza processare", async () => {
        isOwnDomain.mockReturnValueOnce(false);
        const r = await (handler as any)({});
        expect(handleResendEvent).not.toHaveBeenCalled();
        expect(r).toEqual({ ok: true, skipped: "foreign-domain" });
    });

    it("body vuoto → lancia 400", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (readRawBodyMock as any).mockImplementationOnce(() => Promise.resolve(undefined));
        const err = await (handler as any)({}).catch((e: unknown) => e);
        expect((err as any).statusCode).toBe(400);
    });
});
