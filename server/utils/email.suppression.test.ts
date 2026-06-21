import { describe, it, expect, vi, beforeEach } from "vitest";

const send = vi.fn(() => Promise.resolve({ data: { id: "m1" }, error: null }));
vi.mock("./drivers", () => ({ getResendInstance: () => ({ emails: { send } }) }));

const mocks = vi.hoisted(() => ({ isEmailSuppressed: vi.fn() }));
vi.mock("../repositories/emailSuppression.repository", () => ({ isEmailSuppressed: mocks.isEmailSuppressed }));
vi.mock("../repositories/emailEvent.repository", () => ({ insertEmailSeed: vi.fn() }));
vi.mock("./audit", () => ({ logAudit: vi.fn() }));

import { sendEmail } from "./email";

beforeEach(() => vi.clearAllMocks());

describe("sendEmail suppression", () => {
    it("salta l'invio se il destinatario è soppresso", async () => {
        mocks.isEmailSuppressed.mockResolvedValue(true);
        const r = await sendEmail({ type: "verification", to: "x@x.com", verificationUrl: "https://x" });
        expect(r).toEqual({ success: false, error: "suppressed" });
        expect(send).not.toHaveBeenCalled();
    });
    it("invia se non soppresso", async () => {
        mocks.isEmailSuppressed.mockResolvedValue(false);
        const r = await sendEmail({ type: "verification", to: "x@x.com", verificationUrl: "https://x" });
        expect(r.success).toBe(true);
        expect(send).toHaveBeenCalledOnce();
    });
});
