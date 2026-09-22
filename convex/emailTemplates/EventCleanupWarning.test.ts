import { describe, it, expect } from "vitest";
import { emailSubjects, renderEmail, resolveBrand } from "./index";

/**
 * Il test è stato riscritto con il renderer puro (plan Task 13): non esiste più un
 * `renderEventCleanupWarningEmail` che legge la configurazione Nuxt, perché in Convex
 * `useRuntimeConfig()` non esiste. Il brand è un input esplicito, quindi il test non
 * dipende più dall'ambiente in cui gira — ed è per questo che ora può verificare
 * anche che i link legali finiscano davvero nel footer.
 */

const brand = resolveBrand({ appName: "Ceremly", siteUrl: "https://app.test" });

describe("EventCleanupWarning email", () => {
    it("renderizza HTML + text con titolo evento e link dashboard (it)", async () => {
        const { html, text } = await renderEmail(
            {
                template: "event-cleanup-warning",
                language: "it",
                eventTitle: "Matrimonio Anna & Luca",
                dashboardUrl: "https://app.test/dashboard/events/evt_1",
                daysLeft: 7,
            },
            brand,
        );

        expect(html).toContain("Matrimonio Anna &amp; Luca");
        expect(html).toContain("https://app.test/dashboard/events/evt_1");
        expect(text).toContain("Matrimonio Anna & Luca");
    });

    it("renderizza copy inglese con language=en", async () => {
        const { html } = await renderEmail(
            {
                template: "event-cleanup-warning",
                language: "en",
                eventTitle: "Party",
                dashboardUrl: "https://app.test/x",
                daysLeft: 5,
            },
            brand,
        );

        expect(html).toContain("Party");
    });

    it("espone un subject localizzato", () => {
        const subject = emailSubjects.eventCleanupWarning("Festa");
        expect(subject.it).toContain("Festa");
        expect(subject.en).toContain("Festa");
    });

    it("deriva il subject dalla richiesta, non da una costante globale", async () => {
        const rendered = await renderEmail(
            {
                template: "event-cleanup-warning",
                eventTitle: "Festa",
                dashboardUrl: "https://app.test/e/1",
                daysLeft: 7,
            },
            brand,
        );

        expect(rendered.subject).toBe('Stiamo per archiviare "Festa"');
    });

    it("prende host e nome dal brand, non dall'ambiente", async () => {
        const { html } = await renderEmail(
            {
                template: "event-cleanup-warning",
                eventTitle: "Festa",
                dashboardUrl: "https://app.test/e/1",
                daysLeft: 7,
            },
            resolveBrand({ appName: "Ceremly", siteUrl: "https://ceremly.example/" }),
        );

        // Il footer di questo template porta host e nome brand: sono la prova che le
        // props arrivano dal brand passato e non da una configurazione letta a runtime.
        expect(html).toContain("Ceremly · ceremly.example");
    });

    it("costruisce i link legali dal site URL, senza doppio slash", () => {
        const brand = resolveBrand({ appName: "Ceremly", siteUrl: "https://ceremly.example/" });

        expect(brand.legalLinks.privacy).toBe("https://ceremly.example/legal/privacy");
        expect(brand.legalLinks.tos).toBe("https://ceremly.example/legal/tos");
        // L'host è derivato e non contiene schema: è quello che finisce nel footer.
        expect(brand.host).toBe("ceremly.example");
    });
});
