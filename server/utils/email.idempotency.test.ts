import { describe, it, expect, vi, beforeEach } from "vitest";

const send = vi.fn();

vi.mock("~~/server/utils/drivers", () => ({
    getResendInstance: () => ({ emails: { send: (...a: unknown[]) => send(...a) } }),
}));
vi.mock("~~/server/utils/audit", () => ({ logAudit: vi.fn() }));
vi.mock("~~/server/repositories/emailSuppression.repository", () => ({
    isEmailSuppressed: vi.fn().mockResolvedValue(false),
}));
vi.mock("~~/server/repositories/emailEvent.repository", () => ({
    insertEmailSeed: vi.fn(),
}));

describe("sendEmail idempotencyKey pass-through", () => {
    beforeEach(() => {
        vi.resetModules();
        send.mockReset();
        send.mockResolvedValue({ data: { id: "msg_1" }, error: null });
    });

    it("forwards idempotencyKey as the Resend request option", async () => {
        const { sendEmail } = await import("~~/server/utils/email");
        const res = await sendEmail({
            type: "custom",
            to: "g@x.com",
            subject: "s",
            html: "<p>h</p>",
            text: "t",
            idempotencyKey: "reminder:r1:g1",
        });
        expect(res.success).toBe(true);
        expect(send).toHaveBeenCalledWith(
            expect.objectContaining({ to: "g@x.com" }),
            { idempotencyKey: "reminder:r1:g1" },
        );
    });

    it("omits the request options when no key is given", async () => {
        const { sendEmail } = await import("~~/server/utils/email");
        await sendEmail({ type: "custom", to: "g@x.com", subject: "s", html: "<p>h</p>", text: "t" });
        expect(send).toHaveBeenCalledWith(expect.anything(), undefined);
    });
});
