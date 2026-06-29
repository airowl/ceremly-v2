import { describe, it, expect, vi, beforeEach } from "vitest";

const { upsertSuppression, insertEmailEvent, recordGuestOpen, findSeedContext } = vi.hoisted(() => ({
    upsertSuppression: vi.fn(),
    insertEmailEvent: vi.fn(),
    recordGuestOpen: vi.fn(),
    findSeedContext: vi.fn(() => Promise.resolve({ organizationId: "o1", guestId: "g1", eventId: "e1", emailType: "custom" })),
}));

vi.mock("../repositories/emailSuppression.repository", () => ({ upsertSuppression }));
vi.mock("../repositories/emailEvent.repository", () => ({ insertEmailEvent, recordGuestOpen, findSeedContext }));

import { isOwnDomain, handleResendEvent } from "./emailWebhook.service";

beforeEach(() => vi.clearAllMocks());

describe("emailWebhook.service", () => {
    it("isOwnDomain recognizes domain and subdomain of the environment", () => {
        expect(isOwnDomain("Ceremly <noreply@airowlgasga.dev>")).toBe(true);
        expect(isOwnDomain("X <inviti@events.airowlgasga.dev>")).toBe(true);
        expect(isOwnDomain("X <a@altrodominio.com>")).toBe(false);
    });

    it("hard bounce → upsert suppression + insert event", async () => {
        await handleResendEvent({ type: "email.bounced", created_at: "2026-01-01T00:00:00Z",
            data: { email_id: "m1", from: "noreply@airowlgasga.dev", to: ["a@x.com"], bounce: { subType: "General" } } });
        expect(upsertSuppression).toHaveBeenCalledWith(expect.objectContaining({ email: "a@x.com", reason: "hard_bounce", bounceSubtype: "General" }));
        expect(insertEmailEvent).toHaveBeenCalledOnce();
    });

    it("opened with guest → recordGuestOpen", async () => {
        await handleResendEvent({ type: "email.opened", created_at: "2026-01-01T00:00:00Z",
            data: { email_id: "m1", from: "inviti@events.airowlgasga.dev", to: ["g@x.com"] } });
        expect(recordGuestOpen).toHaveBeenCalledWith("g1", expect.any(Date));
        expect(insertEmailEvent).toHaveBeenCalledOnce();
    });

    it("opened without guestId → NO recordGuestOpen, only insertEmailEvent", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findSeedContext.mockResolvedValueOnce({ organizationId: "o1", guestId: null, eventId: null, emailType: "verification" } as any);
        await handleResendEvent({ type: "email.opened", created_at: "2026-01-01T00:00:00Z",
            data: { email_id: "m2", from: "noreply@airowlgasga.dev", to: ["u@x.com"] } });
        expect(recordGuestOpen).not.toHaveBeenCalled();
        expect(insertEmailEvent).toHaveBeenCalledOnce();
    });
});
