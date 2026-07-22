import { describe, it, expect, vi, beforeEach } from "vitest";

const batchSendMock = vi.fn(() =>
    Promise.resolve({ data: { data: [{ id: "a" }, { id: "b" }] }, error: null })
);
vi.mock("./drivers", () => ({ getResendInstance: () => ({ batch: { send: batchSendMock } }) }));

const mocks = vi.hoisted(() => ({
    isEmailSuppressed: vi.fn(),
}));
vi.mock("../repositories/emailSuppression.repository", () => ({ isEmailSuppressed: mocks.isEmailSuppressed }));
vi.mock("../repositories/emailEvent.repository", () => ({ insertEmailSeed: vi.fn() }));
vi.mock("./audit", () => ({ logAudit: vi.fn() }));

import { sendBatchEmails } from "./email";

beforeEach(() => vi.clearAllMocks());

describe("sendBatchEmails", () => {
    it("sends via resend.batch.send in a single call for <=100 emails (no per-email concurrency)", async () => {
        mocks.isEmailSuppressed.mockResolvedValue(false);
        const res = await sendBatchEmails([
            { type: "custom", to: "a@x.com", subject: "s", html: "<p>a</p>", text: "a" },
            { type: "custom", to: "b@x.com", subject: "s", html: "<p>b</p>", text: "b" },
        ]);
        expect(batchSendMock).toHaveBeenCalledTimes(1);
        expect(res).toHaveLength(2);
        expect(res.every((r) => r.success)).toBe(true);
    });

    it("filters suppressed recipients out of the batch", async () => {
        mocks.isEmailSuppressed.mockImplementation((to: string) => Promise.resolve(to === "a@x.com"));
        const res = await sendBatchEmails([
            { type: "custom", to: "a@x.com", subject: "s", html: "<p>a</p>", text: "a" },
            { type: "custom", to: "b@x.com", subject: "s", html: "<p>b</p>", text: "b" },
        ]);
        expect(res[0]).toMatchObject({ success: false, skipped: true });
        // only b@x.com reaches the batch
        expect(batchSendMock).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ to: "b@x.com" })])
        );
    });
});
