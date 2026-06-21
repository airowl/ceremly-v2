import { describe, it, expect } from "vitest";
import { getSender } from "./email";

describe("getSender", () => {
    it("usa il from eventi quando context.eventId è presente", () => {
        const s = getSender({ type: "custom", to: "g@x.com", subject: "s", html: "h", text: "t", context: { eventId: "ev1" } });
        expect(s).toContain("events.airowlgasga.dev");
    });
    it("usa il from principale per i transazionali", () => {
        const s = getSender({ type: "verification", to: "u@x.com", verificationUrl: "https://x" });
        expect(s).toContain("noreply@airowlgasga.dev");
        expect(s).not.toContain("events.");
    });
});
