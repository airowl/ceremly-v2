import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runtimeConfig } from "../../server/utils/runtimeConfig";
import { getServerSiteMode, setServerSiteMode } from "../../server/utils/siteMode";

/**
 * Task 12, Step 4–5 — la matrice di enforcement del site mode.
 *
 * Il middleware è la difesa vera (quello client è UX), e `maintenance-readonly` è
 * l'unica modalità che non è un interruttore on/off: *solo* le scritture chiudono.
 * Una modalità nuova senza un test che la eserciti è una modalità che nessuno ha
 * provato, e la direzione dell'errore qui non è simmetrica — un difetto in eccesso
 * toglie il sito ai visitatori, uno in difetto lascia scrivere durante una migrazione.
 *
 * Il modulo è caricato con un `import()` **dinamico** e non statico: un import
 * statico viene valutato prima delle righe di questo file, e il middleware chiama
 * `defineEventHandler` mentre viene costruito. I quattro polyfill dichiarano quello che
 * fuori da Nuxt non esiste (`defineEventHandler`, `sendRedirect`,
 * `setResponseHeader`, `useRuntimeConfig`); tutto il resto è reale, `getServerSiteMode` compreso.
 */

type FakeEvent = { path: string; method: string };

const g = globalThis as Record<string, unknown>;

g.defineEventHandler = (handler: unknown) => handler;
g.sendRedirect = (event: FakeEvent, location: string, status: number) => ({
    redirect: location,
    status,
    event,
});
// Task 17: read-only refusals carry `Retry-After` (asserted in readonly-mode.test.ts).
g.setResponseHeader = () => undefined;
g.useRuntimeConfig = () => ({ public: { siteMode: process.env.NUXT_PUBLIC_SITE_MODE ?? "active" } });

type Middleware = (event: FakeEvent) => unknown;

let siteModeMiddleware: Middleware;

beforeAll(async () => {
    // Il cache client deve restare in-memory: i valori di `.env` puntano a Upstash, e
    // un test che fa un round-trip di rete non è ermetico. Il backend `convex` del
    // site mode è già coperto altrove (`public-forms-bridge.test.ts`), quindi qui si
    // usa la sorgente legacy, che è quella con la cache in-process.
    runtimeConfig.upstashRedisRestUrl = undefined;
    runtimeConfig.upstashRedisRestToken = undefined;
    runtimeConfig.siteModeBackend = "legacy";

    siteModeMiddleware = ((await import("../../server/middleware/0.site-mode")).default ??
        undefined) as Middleware;
});

interface Redirect {
    redirect: string;
}

const call = async (path: string, method = "GET") => {
    try {
        return { result: (await siteModeMiddleware({ path, method })) as Redirect | undefined };
    } catch (error) {
        const err = error as { statusCode?: number };
        return { statusCode: err.statusCode };
    }
};

beforeEach(() => {
    // Il valore d'ambiente non deve decidere i casi: la modalità la imposta il test.
    process.env.NUXT_PUBLIC_SITE_MODE = "active";
});

describe("site mode: active", () => {
    it("lascia passare tutto e non serve la pagina di manutenzione", async () => {
        await setServerSiteMode("active");

        expect((await call("/dashboard")).result).toBeUndefined();
        expect((await call("/api/projects", "POST")).result).toBeUndefined();
        expect((await call("/maintenance")).result).toMatchObject({ redirect: "/" });
    });
});

describe("site mode: waitinglist", () => {
    it("chiude le API tranne la waiting list, e le pagine app", async () => {
        await setServerSiteMode("waitinglist");

        expect((await call("/api/projects")).statusCode).toBe(503);
        expect((await call("/api/waiting-list/subscribe", "POST")).result).toBeUndefined();
        expect((await call("/dashboard")).result).toMatchObject({ redirect: "/" });
        expect((await call("/blogs/post")).result).toBeUndefined();
    });
});

describe("site mode: maintenance", () => {
    it("chiude letture e scritture, e manda tutti alla pagina di manutenzione", async () => {
        await setServerSiteMode("maintenance");

        expect((await call("/api/projects")).statusCode).toBe(503);
        expect((await call("/api/projects", "POST")).statusCode).toBe(503);
        expect((await call("/dashboard")).result).toMatchObject({ redirect: "/maintenance" });
        expect((await call("/maintenance")).result).toBeUndefined();
    });

    it("lascia liberi i percorsi che non possono essere chiusi", async () => {
        await setServerSiteMode("maintenance");

        // Token già recapitati agli ospiti, job in coda, cron e il kill-switch stesso:
        // chiuderli renderebbe la maintenance irreversibile o perderebbe lavoro già
        // avviato.
        for (const path of [
            "/api/public/invite/tok/rsvp",
            "/api/jobs/email",
            "/api/cron/cleanup",
            "/api/admin/site-mode",
            "/api/auth/creem/webhook",
            "/api/webhooks/resend",
            "/_nuxt/entry.js",
        ]) {
            expect((await call(path, "POST")).result, path).toBeUndefined();
        }
    });
});

describe("site mode: maintenance-readonly", () => {
    it("chiude le scritture e lascia passare le letture", async () => {
        await setServerSiteMode("maintenance-readonly");

        // Letture: API e pagine.
        expect((await call("/api/projects")).result).toBeUndefined();
        expect((await call("/api/projects", "HEAD")).result).toBeUndefined();
        expect((await call("/dashboard")).result).toBeUndefined();

        // Scritture: chiuse, con lo stesso status della maintenance.
        expect((await call("/api/projects", "POST")).statusCode).toBe(503);
        expect((await call("/api/projects", "PATCH")).statusCode).toBe(503);
        expect((await call("/api/projects/1", "DELETE")).statusCode).toBe(503);

        // Un metodo che non conosciamo non è una lettura: si chiude.
        expect((await call("/api/projects", "PROPFIND")).statusCode).toBe(503);
    });

    it("lascia passare /api/auth/**, altrimenti 'le letture passano' sarebbe falso", async () => {
        await setServerSiteMode("maintenance-readonly");

        // Una schermata di lettura che richiede una sessione deve poterla ottenere:
        // senza questo, un utente con la sessione scaduta resterebbe fuori dal sito
        // "aperto".
        expect((await call("/api/auth/sign-in/email", "POST")).result).toBeUndefined();
        expect((await call("/api/auth/sign-out", "POST")).result).toBeUndefined();
    });

    it("non serve la pagina di manutenzione: il sito è aperto", async () => {
        await setServerSiteMode("maintenance-readonly");

        expect((await call("/maintenance")).result).toMatchObject({ redirect: "/" });
    });
});

describe("site mode: break-glass della console admin (Task 15)", () => {
    for (const mode of ["maintenance", "waitinglist"] as const) {
        it(`${mode}: la console e le API di sessione passano, il resto no`, async () => {
            await setServerSiteMode(mode);

            // La shell della console (ogni locale) e il login diretto alla console.
            for (const path of ["/admin", "/admin/jobs", "/en/admin/users", "/login?redirect=%2Fadmin", "/en/login?redirect=/en/admin"]) {
                expect((await call(path)).result, path).toBeUndefined();
            }
            // Le API che servono a una sessione.
            for (const [path, method] of [
                ["/api/auth/get-session", "GET"],
                ["/api/auth/convex/token", "GET"],
                ["/api/auth/sign-in/email", "POST"],
                ["/api/auth/two-factor/verify-totp", "POST"],
                ["/api/auth/two-factor/verify-backup-code", "POST"],
                ["/api/auth/sign-out", "POST"],
            ] as const) {
                expect((await call(path, method)).result, path).toBeUndefined();
                expect((await call(path, method)).statusCode, path).toBeUndefined();
            }

            // Final review I2: the break-glass signs in, it does not change
            // credentials or create users — on the blue stack after step 10 these
            // would be writes.
            for (const [path, method] of [
                ["/api/auth/two-factor/enable", "POST"],
                ["/api/auth/two-factor/disable", "POST"],
                ["/api/auth/two-factor/generate-backup-codes", "POST"],
                ["/api/auth/sign-in/social", "POST"],
                ["/api/auth/sign-in/magic-link", "POST"],
                ["/api/auth/convex/token", "POST"],
                ["/api/auth/sign-in/email/../../two-factor/enable", "POST"],
            ] as const) {
                expect((await call(path, method)).statusCode, `${method} ${path}`).toBe(503);
            }

            // Non è una porta generica: registrazione, login verso altre pagine, un
            // path che solo *somiglia* alla console e le altre API restano chiusi.
            expect((await call("/api/auth/sign-up/email", "POST")).statusCode).toBe(503);
            expect((await call("/api/projects")).statusCode).toBe(503);
            const expectedRedirect = mode === "maintenance" ? "/maintenance" : "/";
            expect((await call("/login")).result).toMatchObject({ redirect: expectedRedirect });
            expect((await call("/login?redirect=%2Fdashboard")).result).toMatchObject({ redirect: expectedRedirect });
            expect((await call("/dashboard")).result).toMatchObject({ redirect: expectedRedirect });
            if (mode === "maintenance") {
                expect((await call("/administrator")).result).toMatchObject({ redirect: "/maintenance" });
            }
        });
    }
});

describe("site mode: la modalità letta è quella effettiva", () => {
    it("ogni modalità sopravvive al giro completo set → get", async () => {
        for (const mode of ["active", "waitinglist", "maintenance", "maintenance-readonly"] as const) {
            await setServerSiteMode(mode);
            expect(await getServerSiteMode()).toBe(mode);
        }
    });
});
