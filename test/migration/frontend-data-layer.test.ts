// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createApp, inject } from "vue";
import { ConvexHttpClient } from "convex/browser";
import type { ConvexVueContext } from "convex-vue";
import { installConvexHttp } from "~/lib/convexInstall";
import {
    isoOrNull,
    timestampOrNull,
    toEventDistribution,
    toEventStatus,
} from "~/composables/useEvents";
import { toProjectItem, toProjectStatus } from "~/composables/useProjects";

/**
 * Task 14, Step 1 — il gate anti-CRUD Nuxt.
 *
 * Il port del frontend non è "usare Convex": è **smettere** di avere due strade
 * per gli stessi dati. Una strada che resta aperta viene riusata (è più corta da
 * scrivere), e il giorno del cutover il frontend parla a due backend diversi
 * senza che nessun test lo dica. Questo file è quel test: scansiona il data layer
 * (`app/composables`, `app/stores`) e fallisce su ogni chiamata `/api/**` che non
 * sia una delle eccezioni dichiarate.
 *
 * L'allowlist non è un permesso: è un **debito con una scadenza**. Ogni voce
 * nomina lo step del piano che la cancellerà, e il test verifica anche che la
 * voce sia ancora vera — se qualcuno migra un file senza togliere la riga, il
 * test diventa rosso lo stesso. Una allowlist che non si accorge di essere
 * inutile è una allowlist che cresce.
 */

// `process.cwd()` e non `import.meta.url`: sotto jsdom l'URL del modulo non è
// `file:`, e il percorso del progetto è comunque la radice di vitest.
const PROJECT_ROOT = process.cwd();
const COMPOSABLES_DIR = join(PROJECT_ROOT, "app/composables");
const STORES_DIR = join(PROJECT_ROOT, "app/stores");

/** I tre (e soli) `$fetch` anonimi che il frontend può ancora fare. */
const ALLOWED_API_PREFIXES = ["/api/auth"];

/**
 * File ancora sul trasporto legacy, ognuno con lo step che lo migra.
 *
 * `feedbackStore` è **fuori dal piano**: le `suggestions` non hanno (e non
 * avranno in questo piano) una controparte Convex, quindi la voce non scade —
 * per questo è elencata a parte e non ha uno step.
 */
const PENDING: Record<string, string> = {
    "app/composables/useEventGuests.ts": "Step 3 (ospiti/RSVP)",
    "app/composables/usePublicInvite.ts": "Step 3 (invito pubblico)",
    "app/composables/useSubscription.ts": "Step 4 (organizzazione e billing)",
    "app/stores/profileStore.ts": "Step 5 (profilo ed export)",
};

const OUT_OF_SCOPE: Record<string, string> = {
    "app/stores/feedbackStore.ts": "le suggestions non sono nel piano di migrazione",
};

/**
 * I commenti contengono esempi di codice (`useApi.ts` documenta `$fetch`):
 * scansionarli segnalerebbe la documentazione come violazione. Si rimuovono
 * prima di cercare, così il test misura il codice e non la prosa che lo spiega.
 */
function stripComments(source: string): string {
    return source
        .replaceAll(/\/\*[\s\S]*?\*\//g, "")
        .replaceAll(/^\s*\/\/.*$/gm, "");
}

/** Ogni percorso `/api/...` citato davvero nel codice del file. */
function apiPathsIn(file: string, source: string): string[] {
    const cleaned = stripComments(source);
    // Il percorso può essere un template literal con segmenti dinamici
    // (`` `/api/events/${id}/guests` ``): senza `{` e `}` nella classe di
    // caratteri il gate non vedeva proprio le chiamate più comuni, ed è la
    // seconda asserzione ("ogni voce è ancora vera") che l'ha rivelato.
    const matches = cleaned.matchAll(/["'`](\/api\/[A-Za-z0-9/_\-[\].${}]*)["'`]/g);
    return [...matches].map((match) => match[1]!);
}

function dataLayerFiles(): { relative: string; source: string }[] {
    const files: { relative: string; source: string }[] = [];

    for (const [dir, prefix] of [
        [COMPOSABLES_DIR, "app/composables/"],
        [STORES_DIR, "app/stores/"],
    ] as const) {
        for (const entry of readdirSync(dir)) {
            if (!entry.endsWith(".ts")) continue;
            files.push({
                relative: `${prefix}${entry}`,
                source: readFileSync(`${dir}/${entry}`, "utf8"),
            });
        }
    }

    return files;
}

const isAllowed = (path: string): boolean =>
    ALLOWED_API_PREFIXES.some((allowed) => path.startsWith(allowed));

describe("frontend data layer: una strada sola per i dati di dominio", () => {
    it("nessun composable o store chiama più il CRUD Nuxt fuori dalle eccezioni dichiarate", () => {
        const violations = dataLayerFiles()
            .map(({ relative, source }) => ({
                relative,
                paths: apiPathsIn(relative, source).filter((path) => !isAllowed(path)),
            }))
            .filter(({ paths }) => paths.length > 0);

        const unexpected = violations.filter(
            ({ relative }) => !(relative in PENDING) && !(relative in OUT_OF_SCOPE),
        );

        expect(
            unexpected,
            "questi file hanno aperto una seconda strada verso i dati di dominio:\n"
            + unexpected.map((v) => `  ${v.relative}: ${v.paths.join(", ")}`).join("\n"),
        ).toEqual([]);
    });

    it("ogni voce della allowlist è ancora vera (la lista può solo accorciarsi)", () => {
        const violations = new Set(
            dataLayerFiles()
                .filter(({ relative, source }) =>
                    apiPathsIn(relative, source).some((path) => !isAllowed(path)))
                .map(({ relative }) => relative),
        );

        const stale = Object.keys(PENDING).filter((relative) => !violations.has(relative));

        expect(
            stale,
            "questi file sono stati migrati (o non violano più) ma la voce di debito è ancora "
            + "in elenco: va tolta, altrimenti la prossima deriva passa inosservata",
        ).toEqual([]);
    });

    it("nessun file del data layer importa il client HTTP di Convex per aggirare la reattività", () => {
        // `useConvexClient().query(...)` è legittimo in un punto solo
        // (`useEventActions.getEventOnce`, per le pagine a form) e illegittimo
        // come modo per reintrodurre una chiamata una-tantum al posto di una
        // query viva.
        const manualCalls = dataLayerFiles()
            .filter(({ relative, source }) =>
                relative !== "app/composables/useEvents.ts"
                && /useConvexClient\s*\(/.test(stripComments(source)))
            .map(({ relative }) => relative);

        expect(manualCalls).toEqual([]);
    });
});

describe("frontend data layer: gli adattatori fra Convex e la UI", () => {
    it("le date viaggiano in millisecondi verso Convex e in ISO verso la UI", () => {
        const iso = "2026-09-12T00:00:00.000Z";
        expect(timestampOrNull(iso)).toBe(Date.parse(iso));
        expect(isoOrNull(Date.parse(iso))).toBe(iso);

        // `null` significa "azzera il campo" e non va confuso con "assente":
        // sono due istruzioni diverse per `events.update`.
        expect(timestampOrNull(null)).toBeNull();
        expect(isoOrNull(undefined)).toBeNull();
    });

    it("una data non valida è un errore, non un NaN salvato", () => {
        expect(() => timestampOrNull("non-una-data")).toThrow(/non valida/);
    });

    it("uno status inatteso degrada su active, come faceva il repository legacy", () => {
        expect(toEventStatus("archived")).toBe("active");
        expect(toEventStatus("draft")).toBe("draft");
        expect(toEventStatus("closed")).toBe("closed");
        expect(toEventStatus("active")).toBe("active");
        expect(toEventStatus("boh")).toBe("active");
        expect(toProjectStatus("archived")).toBe("archived");
        expect(toProjectStatus("boh")).toBe("active");
    });

    it("una distribution parziale resta leggibile dalla UI", () => {
        const full = toEventDistribution({
            emailSubject: "Oggetto",
            emailBody: "Corpo",
            whatsappTemplate: "WA",
            senderName: "Mittente",
        });
        expect(full).toEqual({
            emailSubject: "Oggetto",
            emailBody: "Corpo",
            whatsappTemplate: "WA",
            senderName: "Mittente",
        });

        // Il caso che lo schema Convex ammette (campi opzionali) e che la UI deve
        // poter mostrare senza `undefined` in un `v-model`.
        expect(toEventDistribution(undefined)).toEqual({
            emailSubject: "",
            emailBody: "",
            whatsappTemplate: "",
            senderName: "",
        });
    });

    it("una riga progetto diventa l'item della tabella, date ISO comprese", () => {
        const item = toProjectItem({
            _id: "p1",
            organizationId: "o1",
            name: "Progetto",
            status: "archived",
            createdAt: Date.parse("2026-01-02T03:04:05.000Z"),
            updatedAt: Date.parse("2026-01-03T03:04:05.000Z"),
        });

        expect(item).toEqual({
            id: "p1",
            organizationId: "o1",
            name: "Progetto",
            description: null,
            status: "archived",
            createdAt: "2026-01-02T03:04:05.000Z",
            updatedAt: "2026-01-03T03:04:05.000Z",
        });
    });
});

describe("frontend data layer: l'install server-side non apre un websocket", () => {
    it("fornisce il context con il solo client HTTP", () => {
        const app = createApp({ render: () => null });
        const httpClient = installConvexHttp(app, "https://example.convex.cloud");

        const context = app.runWithContext(() => inject<ConvexVueContext | undefined>("convex-vue"));

        expect(context).toBeDefined();
        expect(context!.httpClientRef.value).toBeInstanceOf(ConvexHttpClient);
        expect(httpClient).toBeInstanceOf(ConvexHttpClient);

        // Il punto del test: nessun `ConvexClient`. Il suo costruttore costruisce
        // un `WebSocketManager` che chiama `connect()` → `new WebSocket(uri)`, e su
        // un Worker quel costruttore non esiste nemmeno.
        expect(context!.clientRef.value).toBeUndefined();
    });
});
