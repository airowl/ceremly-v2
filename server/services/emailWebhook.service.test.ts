import { describe, it, expect, vi, beforeEach } from "vitest";

// Own-domain "from" address reused across cases (matches isOwnDomain via NUXT_PUBLIC_APP_NOTIFY_EMAIL).
const OWN_FROM = "noreply@airowlgasga.dev";

const { upsertSuppression, insertEmailEvent, recordGuestOpen, findSeedContext } = vi.hoisted(() => ({
    upsertSuppression: vi.fn(),
    insertEmailEvent: vi.fn(() => Promise.resolve({ inserted: true })),
    recordGuestOpen: vi.fn(),
    findSeedContext: vi.fn(() => Promise.resolve({ organizationId: "o1", guestId: "g1", eventId: "e1", emailType: "custom" })),
}));

vi.mock("../repositories/emailSuppression.repository", () => ({ upsertSuppression }));
vi.mock("../repositories/emailEvent.repository", () => ({ insertEmailEvent, recordGuestOpen, findSeedContext }));

import { isOwnDomain, handleResendEvent, isHardBounce } from "./emailWebhook.service";

beforeEach(() => {
    vi.clearAllMocks();
    insertEmailEvent.mockResolvedValue({ inserted: true }); // reset default after clearAllMocks wipes it
});

describe("isHardBounce", () => {
    it("treats permanent subtypes as hard", () => {
        expect(isHardBounce("Permanent")).toBe(true);
        expect(isHardBounce("General")).toBe(true);
        expect(isHardBounce("NoEmail")).toBe(true);
    });
    it("treats transient/unknown subtypes as soft", () => {
        expect(isHardBounce("Transient")).toBe(false);
        expect(isHardBounce("MailboxFull")).toBe(false);
        expect(isHardBounce(undefined)).toBe(false);
        expect(isHardBounce("SomethingNew")).toBe(false);
    });
});

describe("emailWebhook.service", () => {
    it("isOwnDomain recognizes domain and subdomain of the environment", () => {
        expect(isOwnDomain("Ceremly <noreply@airowlgasga.dev>")).toBe(true);
        expect(isOwnDomain("X <inviti@events.airowlgasga.dev>")).toBe(true);
        expect(isOwnDomain("X <a@altrodominio.com>")).toBe(false);
    });

    it("hard bounce → upsert suppression + insert event", async () => {
        await handleResendEvent({ type: "email.bounced", created_at: "2026-01-01T00:00:00Z",
            data: { email_id: "m1", from: OWN_FROM, to: ["a@x.com"], bounce: { subType: "General" } } }, "svix_1");
        expect(upsertSuppression).toHaveBeenCalledWith(expect.objectContaining({ email: "a@x.com", reason: "hard_bounce", bounceSubtype: "General" }));
        expect(insertEmailEvent).toHaveBeenCalledOnce();
    });

    it("opened with guest → recordGuestOpen", async () => {
        await handleResendEvent({ type: "email.opened", created_at: "2026-01-01T00:00:00Z",
            data: { email_id: "m1", from: "inviti@events.airowlgasga.dev", to: ["g@x.com"] } }, "svix_2");
        expect(recordGuestOpen).toHaveBeenCalledWith("g1", expect.any(Date));
        expect(insertEmailEvent).toHaveBeenCalledOnce();
    });

    it("opened without guestId → NO recordGuestOpen, only insertEmailEvent", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findSeedContext.mockResolvedValueOnce({ organizationId: "o1", guestId: null, eventId: null, emailType: "verification" } as any);
        await handleResendEvent({ type: "email.opened", created_at: "2026-01-01T00:00:00Z",
            data: { email_id: "m2", from: OWN_FROM, to: ["u@x.com"] } }, "svix_3");
        expect(recordGuestOpen).not.toHaveBeenCalled();
        expect(insertEmailEvent).toHaveBeenCalledOnce();
    });

    it("does not increment guest open counter when the event insert is a duplicate", async () => {
        insertEmailEvent.mockResolvedValue({ inserted: false });
        findSeedContext.mockResolvedValue({ guestId: "g1", organizationId: "o1", eventId: "e1", emailType: "custom" });
        await handleResendEvent(
            { type: "email.opened", created_at: new Date(0).toISOString(),
              data: { email_id: "m1", from: OWN_FROM, to: ["a@b.com"] } },
            "svix_dup_1",
        );
        expect(recordGuestOpen).not.toHaveBeenCalled();
    });

    it("increments guest open counter on a fresh open insert", async () => {
        insertEmailEvent.mockResolvedValue({ inserted: true });
        findSeedContext.mockResolvedValue({ guestId: "g1", organizationId: "o1", eventId: "e1", emailType: "custom" });
        await handleResendEvent(
            { type: "email.opened", created_at: new Date(0).toISOString(),
              data: { email_id: "m1", from: OWN_FROM, to: ["a@b.com"] } },
            "svix_fresh_1",
        );
        expect(recordGuestOpen).toHaveBeenCalledWith("g1", expect.any(Date));
    });

    it("does NOT suppress on a transient bounce, but still records the event", async () => {
        await handleResendEvent(
            { type: "email.bounced", created_at: new Date(0).toISOString(),
              data: { email_id: "m1", from: OWN_FROM, to: ["a@b.com"], bounce: { subType: "Transient" } } },
            "svix_soft_1",
        );
        expect(upsertSuppression).not.toHaveBeenCalled();
        expect(insertEmailEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "bounced" }));
    });
});
