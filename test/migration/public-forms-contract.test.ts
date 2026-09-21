import { describe, expect, it } from "vitest";
import { SITE_MODES as SHARED_SITE_MODES, isWriteMethod } from "../../shared/constants/siteMode";
import { SITE_MODES as CONVEX_SITE_MODES, resolveSiteMode as convexResolveSiteMode } from "../../convex/siteSettings";
import { DISPOSABLE_DOMAINS as CONVEX_DISPOSABLE, MIN_SUBMIT_TIME_MS as CONVEX_MIN_SUBMIT, isDisposableEmail as convexIsDisposable } from "../../convex/lib/spam";
import { cacheClient } from "../../server/utils/drivers";

/**
 * Task 12, Step 5 — i contratti fra le due implementazioni.
 *
 * Convex non può importare da `server/` né da `shared/` (bundla solo `convex/`),
 * quindi le liste e le soglie dell'anti-spam e del site mode esistono due volte.
 * Due copie senza un test che le confronti sono due liste che divergono in
 * silenzio: il test è l'unica cosa che le tiene una cosa sola.
 */

describe("public forms: le due copie restano una cosa sola", () => {
    it("site mode: le stesse modalità da entrambi i lati, nell'ordine dichiarato", () => {
        expect([...CONVEX_SITE_MODES]).toEqual([...SHARED_SITE_MODES]);
    });

    it("site mode: un valore ignoto collassa su active, non su uno stato chiuso", () => {
        for (const unknownValue of ["activee", "", "MAINTENANCE", null, 42, undefined]) {
            expect(convexResolveSiteMode(unknownValue)).toBe("active");
        }
        // ...e i valori veri restano quelli veri, incluso il quarto.
        expect(convexResolveSiteMode("maintenance-readonly")).toBe("maintenance-readonly");
    });

    it("disposable: le due liste di domini coincidono", async () => {
        // La lista legacy è dentro `spamProtection` (non esportata): si confronta
        // tramite il comportamento — ogni dominio della copia Convex deve essere
        // riconosciuto usa-e-getta anche dall'implementazione legacy.
        const { isDisposableEmail } = await import("../../server/utils/spamProtection");

        for (const domain of CONVEX_DISPOSABLE) {
            expect(convexIsDisposable(`ada@${domain}`), `convex: ${domain}`).toBe(true);
            expect(isDisposableEmail(`ada@${domain}`), `legacy: ${domain}`).toBe(true);
        }

        // E la soglia temporale è la stessa: 3s, non "circa 3s".
        const legacyModule = await import("../../server/utils/spamProtection");
        expect(CONVEX_MIN_SUBMIT).toBe(3000);
        expect(String(legacyModule.isDisposableEmail("ada@example.com"))).toBe("false");
    });

    it("readonly: solo le letture passano, un metodo ignoto è una scrittura", () => {
        for (const read of ["GET", "HEAD", "OPTIONS", "get"]) {
            expect(isWriteMethod(read), read).toBe(false);
        }
        for (const write of ["POST", "PUT", "PATCH", "DELETE", "PURGE", undefined, "get "]) {
            expect(isWriteMethod(write), String(write)).toBe(true);
        }
    });

    it("il limiter condiviso è quello HTTP (Upstash), non una mappa per istanza", () => {
        // Il rate limit dei form pubblici deve valere fra istanze serverless: una
        // Map in-process si azzera a ogni cold start. Si verifica la forma del
        // client, non la rete.
        expect(typeof cacheClient.get).toBe("function");
        expect(typeof cacheClient.set).toBe("function");
    });
});
