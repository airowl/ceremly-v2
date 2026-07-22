import { describe, it, expect, vi, beforeEach } from "vitest";

const send = vi.fn(() => Promise.resolve({ data: { id: "m1" }, error: null }));
vi.mock("./drivers", () => ({ getResendInstance: () => ({ emails: { send } }) }));

const mocks = vi.hoisted(() => ({
    isEmailSuppressed: vi.fn(),
    insertEmailSeed: vi.fn(),
}));
vi.mock("../repositories/emailSuppression.repository", () => ({ isEmailSuppressed: mocks.isEmailSuppressed }));
vi.mock("../repositories/emailEvent.repository", () => ({ insertEmailSeed: mocks.insertEmailSeed }));
vi.mock("./audit", () => ({ logAudit: vi.fn() }));

import { sendEmail } from "./email";

beforeEach(() => vi.clearAllMocks());

describe("sendEmail suppression", () => {
    it("skips sending if the recipient is suppressed", async () => {
        mocks.isEmailSuppressed.mockResolvedValue(true);
        const r = await sendEmail({ type: "verification", to: "x@x.com", verificationUrl: "https://x" });
        expect(r).toEqual({ success: false, skipped: true, error: "suppressed" });
        expect(send).not.toHaveBeenCalled();
    });
    it("sends if not suppressed", async () => {
        mocks.isEmailSuppressed.mockResolvedValue(false);
        const r = await sendEmail({ type: "verification", to: "x@x.com", verificationUrl: "https://x" });
        expect(r.success).toBe(true);
        expect(send).toHaveBeenCalledOnce();
    });
    it("returns skipped:true (not a retryable error) when the recipient is suppressed", async () => {
        mocks.isEmailSuppressed.mockResolvedValue(true);
        const res = await sendEmail({ type: "custom", to: "x@y.com", subject: "s", html: "<p>h</p>", text: "h" });
        expect(res.success).toBe(false);
        expect(res.skipped).toBe(true);
    });
    it("still reports success when the post-send seed write fails", async () => {
        mocks.isEmailSuppressed.mockResolvedValue(false);
        mocks.insertEmailSeed.mockRejectedValue(new Error("db down"));
        const res = await sendEmail({
            type: "custom",
            to: "x@y.com",
            subject: "s",
            html: "<p>h</p>",
            text: "h",
            context: { organizationId: "o1", guestId: "g1", eventId: "e1" },
        });
        expect(res.success).toBe(true);
        expect(res.messageId).toBe("m1");
    });
});
