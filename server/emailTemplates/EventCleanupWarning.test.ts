import { describe, it, expect } from "vitest";
import { renderEventCleanupWarningEmail, emailSubjects } from "./index";

describe("EventCleanupWarning email", () => {
    it("renderizza HTML + text con titolo evento e link dashboard (it)", async () => {
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
    it("renderizza copy inglese con language=en", async () => {
        const { html } = await renderEventCleanupWarningEmail({
            language: "en", eventTitle: "Party", dashboardUrl: "https://app.test/x", daysLeft: 5,
        });
        expect(html).toContain("Party");
    });
    it("espone un subject localizzato", () => {
        const s = emailSubjects.eventCleanupWarning("Festa");
        expect(s.it).toContain("Festa");
        expect(s.en).toContain("Festa");
    });
});
