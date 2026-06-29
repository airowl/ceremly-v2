import { describe, it, expect } from "vitest";
import { renderEventCleanupWarningEmail, emailSubjects } from "./index";

describe("EventCleanupWarning email", () => {
    it("renders HTML + text with event title and dashboard link (it)", async () => {
        const { html, text } = await renderEventCleanupWarningEmail({
            language: "it",
            eventTitle: "Matrimonio Anna & Luca",
            dashboardUrl: "https://app.test/dashboard/events/evt_1",
            daysLeft: 7,
        });
        expect(html).toContain("Matrimonio Anna &amp; Luca");
        expect(html).toContain("https://app.test/dashboard/events/evt_1");
        expect(text).toContain("Matrimonio Anna & Luca");
    });
    it("renders English copy with language=en", async () => {
        const { html } = await renderEventCleanupWarningEmail({
            language: "en", eventTitle: "Party", dashboardUrl: "https://app.test/x", daysLeft: 5,
        });
        expect(html).toContain("Party");
    });
    it("exposes a localised subject", () => {
        const s = emailSubjects.eventCleanupWarning("Festa");
        expect(s.it).toContain("Festa");
        expect(s.en).toContain("Festa");
    });
});
