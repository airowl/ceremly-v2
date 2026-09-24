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
import { toGuestDetail, toGuestWithStatus } from "~/composables/useEventGuests";
import { toPublicInvitePayload, toPublicRsvpResponse } from "~/lib/publicInvite";
import { toEventReminderData } from "~/composables/useEventReminders";
import {
    isInvitationToken,
    toInvitationPreview,
    toOrganizationInvitation,
    toOrganizationListItem,
    toOrganizationMember,
    toOrganizationSummary,
} from "~/lib/organizations";
import { nextExpiryDelay, toExportView } from "~/lib/dataExports";

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
 * Bridge anonimi del Worker (Task 12) che il **data layer** chiama. Non sono
 * debito: sono il trasporto scelto, perché è lì che l'IP diventa un digest firmato
 * e Convex non vede mai l'indirizzo. Contact e waiting list vivono nei componenti
 * (fuori dalla scansione); il submit RSVP vive in `usePublicInvite`.
 *
 * Una regex esatta e non un prefisso: `/api/public/invite/…` senza `/rsvp` è la
 * GET legacy dell'invito, che è proprio la strada che questo gate deve chiudere.
 */
const ALLOWED_API_PATTERNS: readonly RegExp[] = [
    /^\/api\/public\/invite\/\$\{[^}]+\}\/rsvp$/,
];

/**
 * File ancora sul trasporto legacy, ognuno con lo step che lo migra.
 *
 * `feedbackStore` è **fuori dal piano**: le `suggestions` non hanno (e non
 * avranno in questo piano) una controparte Convex, quindi la voce non scade —
 * per questo è elencata a parte e non ha uno step.
 */
const PENDING: Record<string, string> = {
    // Task 14, part c: empty. `profileStore` (the last entry, Step 5) now talks to
    // `api.profile`. Kept as a ledger so a new debt entry has somewhere to go —
    // with a step that retires it.
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
    // Stessa storia per `(` e `)` (Task 14, part a): `` `/api/public/invite/${encodeURIComponent(token)}` ``
    // era invisibile, e `usePublicInvite` stava in allowlist per una sola riga su tre.
    const matches = cleaned.matchAll(/["'`](\/api\/[A-Za-z0-9/_\-[\].${}()]*)["'`]/g);
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
    ALLOWED_API_PREFIXES.some((allowed) => path.startsWith(allowed))
    || ALLOWED_API_PATTERNS.some((pattern) => pattern.test(path));

/**
 * Dove `useConvexClient()` è ammesso, e perché.
 *
 * - `useEvents.ts`: `getEventOnce`, la lettura una-tantum delle pagine a form.
 * - `useEventGuests.ts`: `client.onUpdate` (il dettaglio ospite, una
 *   sottoscrizione **viva** che si apre solo a drawer aperto: `convex-vue` non ha
 *   uno "skip"). Mai `client.query`: lo verifica l'asserzione dedicata.
 */
const MANUAL_CLIENT_ALLOWED: Record<string, string> = {
    "app/composables/useEvents.ts": "getEventOnce (pagine a form)",
    "app/composables/useEventGuests.ts": "sottoscrizione opzionale del dettaglio (onUpdate)",
    // Task 14, part b: convex-vue has no action composable; billing is actions
    // (Creem). The file may only call `client.action` — asserted below.
    "app/composables/useConvexAction.ts": "azioni Convex (billing: checkout, portal)",
    // Task 14, part c: the profile page copies the profile into a form, so it
    // reads it once (`fetchProfile`) — a live query would rewrite the fields
    // under the user's fingers, the same reason as `getEventOnce`.
    "app/stores/profileStore.ts": "fetchProfile (lettura una-tantum del form profilo)",
};

/** Files allowed to do a one-shot `client.query(...)`: the form-backed reads. */
const READ_ONCE_ALLOWED: readonly string[] = [
    "app/composables/useEvents.ts",
    "app/stores/profileStore.ts",
];

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
                !(relative in MANUAL_CLIENT_ALLOWED)
                && /useConvexClient\s*\(/.test(stripComments(source)))
            .map(({ relative }) => relative);

        expect(manualCalls).toEqual([]);
    });

    it("chi ha il client manuale per altro non lo usa per una lettura una-tantum", () => {
        // L'eccezione di `useEventGuests` è per `onUpdate`: un
        // `client.query(...)` lì sarebbe la lettura morta che il gate vieta.
        const oneShotReads = dataLayerFiles()
            .filter(({ relative, source }) =>
                relative in MANUAL_CLIENT_ALLOWED
                && !READ_ONCE_ALLOWED.includes(relative)
                && /\.query\s*\(/.test(stripComments(source)))
            .map(({ relative }) => relative);

        expect(oneShotReads).toEqual([]);
    });

    it("l'invito pubblico non passa più dalla GET legacy e non apre un websocket", () => {
        const source = stripComments(
            readFileSync(join(COMPOSABLES_DIR, "usePublicInvite.ts"), "utf8"),
        );

        // L'apertura è `api.rsvp.publicInvite`, l'anteprima `api.rsvp.previewInvite`,
        // entrambe sul client HTTP (l'unico che esiste nel render server).
        expect(source).toMatch(/api\.rsvp\.publicInvite/);
        expect(source).toMatch(/api\.rsvp\.previewInvite/);
        expect(source).toMatch(/useConvexHttpClient\s*\(/);
        expect(source).not.toMatch(/useConvexClient\s*\(/);
        // Il submit resta sul bridge: l'unico percorso `/api/**` del file.
        expect(apiPathsIn("usePublicInvite.ts", source)).toEqual([
            "/api/public/invite/${encodeURIComponent(token)}/rsvp",
        ]);
    });
});

/**
 * Task 14 part b, fix round 1 — the `/api/**` scan above covers only
 * `app/composables` and `app/stores`, and that blind spot was real: the
 * `ceremly` layout read the event with `$fetch("/api/events/:id")` after Step 3
 * had "finished" events. This second scan covers the UI layer (`app/layouts`,
 * `app/pages`, `app/components`) with its own ledger, split by reason:
 *
 * - `UI_TRANSPORT`: not debt — anonymous Worker bridges (the IP becomes a signed
 *   digest there) and binary/signed downloads opened as a URL;
 * - `UI_PENDING`: debt with a deadline, like `PENDING` above;
 * - `UI_DEAD`: a template leftover whose endpoint does not exist.
 *
 * Each entry names the exact path, and a second assertion demands every entry is
 * still present — the list can only shrink.
 */
const UI_DIRS = ["app/layouts", "app/pages", "app/components"] as const;

const UI_TRANSPORT: Record<string, readonly string[]> = {
    "app/pages/index.vue": ["/api/waiting-list/subscribe"],
    "app/components/landing/Contact.vue": ["/api/contact"],
    "app/components/landing/WaitingListCTA.vue": ["/api/waiting-list/subscribe"],
    "app/components/blog/BlogSidebar.vue": ["/api/waiting-list/subscribe"],
    "app/components/blog/BlogNewsletter.vue": ["/api/waiting-list/subscribe"],
    // CSV and PNG downloads opened in a new tab (binary transport).
    "app/pages/dashboard/events/[id]/index.vue": ["/api/events/${eventId.value}/export"],
    "app/pages/dashboard/events/[id]/distribution.vue": ["/api/events/${eventId.value}/guests/${g.id}/qr"],
};

const UI_PENDING: Record<string, { paths: readonly string[]; step: string }> = {
    // Task 14, part c: empty. Uploads go presign (Convex) → PUT (R2) → confirm
    // (Convex) through `useStorageUpload`; the export components read
    // `api.dataExports` and download through a short-lived signed URL minted by
    // `api.dataExports.downloadUrl` (the legacy `/download/:token` route cannot
    // serve a Convex export: Convex rows carry no download token by design).
};

const UI_DEAD: Record<string, readonly string[]> = {
    // Task 14, part c: empty. The Nuxt UI template page `profile/members.vue`
    // (`/api/members`, a route that never existed) is now a redirect to the
    // active organization's members page (fix round 1: deep links keep working).
};

function uiFiles(): { relative: string; source: string }[] {
    return UI_DIRS.flatMap((dir) => appSourceFiles(join(PROJECT_ROOT, dir)));
}

function declaredUiPaths(relative: string): readonly string[] {
    return [
        ...(UI_TRANSPORT[relative] ?? []),
        ...(UI_PENDING[relative]?.paths ?? []),
        ...(UI_DEAD[relative] ?? []),
    ];
}

describe("frontend UI layer: no undeclared road to the Nuxt CRUD", () => {
    it("no layout, page or component calls /api/** outside the declared ledger", () => {
        const violations = uiFiles()
            .map(({ relative, source }) => ({
                relative,
                paths: apiPathsIn(relative, source)
                    .filter((path) => !isAllowed(path))
                    .filter((path) => !declaredUiPaths(relative).includes(path)),
            }))
            .filter(({ paths }) => paths.length > 0);

        expect(
            violations,
            "these UI files opened a road to /api/** that is neither transport nor declared debt:\n"
            + violations.map((v) => `  ${v.relative}: ${v.paths.join(", ")}`).join("\n"),
        ).toEqual([]);
    });

    it("every UI ledger entry is still true (the ledger can only shrink)", () => {
        const present = new Map(
            uiFiles().map(({ relative, source }) => [relative, new Set(apiPathsIn(relative, source))]),
        );
        const stale = [...Object.keys(UI_TRANSPORT), ...Object.keys(UI_PENDING), ...Object.keys(UI_DEAD)]
            .flatMap((relative) => declaredUiPaths(relative)
                .filter((path) => !present.get(relative)?.has(path))
                .map((path) => `${relative}: ${path}`));

        expect(stale).toEqual([]);
    });
});

/**
 * Task 14, Step 4 — the second road nobody sees in a `/api/**` scan.
 *
 * The organization store never called `$fetch`: it talked to the Better Auth
 * **organization client plugin** (`client.organization.*`), and billing talked to
 * the Creem client plugin (`client.creem.*`). Both are HTTP calls to
 * `/api/auth/*` — the one prefix the scan above allows — so the gate was green
 * while tenancy and billing still ran on the legacy plugins. The plan is explicit:
 * Better Auth stays the identity provider, the Organization plugin is not used,
 * and organizations/billing are Convex functions (`api.organizations.*`,
 * `api.billing.*`).
 *
 * This scan covers all of `app/` (pages, components and layouts too, not only the
 * data layer), because the invite acceptance page called the plugin directly.
 * There is no allowlist: after Step 4 there is nothing left to excuse.
 */
const APP_DIR = join(PROJECT_ROOT, "app");

function appSourceFiles(dir: string = APP_DIR): { relative: string; source: string }[] {
    const files: { relative: string; source: string }[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const absolute = join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...appSourceFiles(absolute));
            continue;
        }
        if (!/\.(ts|vue)$/.test(entry.name)) continue;
        files.push({
            relative: absolute.slice(PROJECT_ROOT.length + 1),
            source: readFileSync(absolute, "utf8"),
        });
    }
    return files;
}

const AUTH_PLUGIN_PATTERNS: readonly { label: string; pattern: RegExp }[] = [
    // `client.organization.list()`, `authClient.organization.setActive(...)`, ...
    { label: "organization plugin call", pattern: /\.\s*organization\s*\.\s*[A-Za-z]+\s*\(/ },
    // `creem.createPortal()`, `client.creem.hasAccessGranted()`, ...
    { label: "creem plugin call", pattern: /\bcreem\s*\.\s*[A-Za-z]+\s*\(/ },
    // `const { organization } = useAuth()` / `const { creem } = useAuth()`
    {
        label: "plugin namespace taken from useAuth()",
        pattern: /\{[^}]*\b(organization|creem)\b[^}]*\}\s*=\s*useAuth\s*\(/,
    },
    // The client plugins themselves: without them the calls above cannot exist.
    { label: "client plugin installed", pattern: /\b(organizationClient|creemClient)\s*\(/ },
];

/** Every Better Auth organization/Creem client-plugin use in a source file. */
function authPluginUsesIn(source: string): string[] {
    const cleaned = stripComments(source);
    return AUTH_PLUGIN_PATTERNS
        .filter(({ pattern }) => pattern.test(cleaned))
        .map(({ label }) => label);
}

describe("frontend: organizations and billing do not go through Better Auth client plugins", () => {
    it("the action helper only runs actions, never a one-shot read or write", () => {
        const source = stripComments(readFileSync(join(COMPOSABLES_DIR, "useConvexAction.ts"), "utf8"));
        expect(source).toMatch(/client\.action\s*\(/);
        expect(source).not.toMatch(/\.(query|mutation|onUpdate)\s*\(/);
    });

    it("the organization store and the billing composable read Convex, live", () => {
        const store = stripComments(readFileSync(join(STORES_DIR, "organizationStore.ts"), "utf8"));
        for (const read of ["listMyOrganizations", "getActiveOrganization", "listMembers", "listPendingInvitations"]) {
            expect(store).toMatch(new RegExp(`useConvexQuery\\(api\\.organizations\\.${read}\\b`));
        }
        expect(store).toMatch(/api\.organizations\.setActive/);

        const billing = stripComments(readFileSync(join(COMPOSABLES_DIR, "useSubscription.ts"), "utf8"));
        expect(billing).toMatch(/useConvexQuery\(\s*api\.billing\.planForActiveOrganization/);
        expect(billing).toMatch(/api\.billing\.checkoutsCreate/);
        expect(billing).toMatch(/api\.billing\.customersPortalUrl/);
        // The browser never names the billing entity.
        expect(billing).not.toMatch(/organizationId/);
    });

    it("no app file calls the organization or Creem client plugin", () => {
        const offenders = appSourceFiles()
            .map(({ relative, source }) => ({ relative, uses: authPluginUsesIn(source) }))
            .filter(({ uses }) => uses.length > 0);

        expect(
            offenders,
            "these files still reach tenancy/billing through a Better Auth client plugin:\n"
            + offenders.map((o) => `  ${o.relative}: ${o.uses.join(", ")}`).join("\n"),
        ).toEqual([]);
    });

    it("the detector sees every shape the legacy code used, and not the Convex API", () => {
        // Pinned so a "simplified" regex cannot go blind silently (the `{`/`}`
        // lesson of assertion 2 above).
        expect(authPluginUsesIn("await client.organization.getFullOrganization()")).toEqual([
            "organization plugin call",
        ]);
        expect(authPluginUsesIn("const { data } = await creem.hasAccessGranted();")).toEqual([
            "creem plugin call",
        ]);
        expect(authPluginUsesIn("const { creem } = useAuth();")).toEqual([
            "plugin namespace taken from useAuth()",
        ]);
        expect(authPluginUsesIn("plugins: [organizationClient(), creemClient()]")).toEqual([
            "client plugin installed",
        ]);
        expect(authPluginUsesIn([
            "useConvexQuery(api.organizations.listMembers, {});",
            "useConvexMutation(api.organizations.setActive);",
            "t('organization.createModal.title')",
            "// client.organization.list() in a comment is prose, not code",
        ].join("\n"))).toEqual([]);
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

describe("frontend data layer: gli adattatori di ospiti, invito e reminder", () => {
    const guestRow = {
        _id: "g1",
        _creationTime: 0,
        organizationId: "o1",
        eventId: "e1",
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        token: "tok0000001",
        openCount: 2,
        remindersDisabled: false,
        sentAt: Date.parse("2026-09-01T10:00:00.000Z"),
        sentChannel: "email" as const,
        firstOpenedAt: Date.parse("2026-09-02T10:00:00.000Z"),
        createdAt: Date.parse("2026-08-01T10:00:00.000Z"),
        updatedAt: Date.parse("2026-09-02T10:00:00.000Z"),
    };

    it("un ospite Convex diventa la riga della tabella, con null dove il campo manca", () => {
        const guest = toGuestWithStatus({
            ...guestRow,
            rsvpStatus: "confirmed",
            respondedAt: Date.parse("2026-09-03T10:00:00.000Z"),
            totalPeople: 3,
        } as never);

        expect(guest).toMatchObject({
            id: "g1",
            eventId: "e1",
            phone: null,
            groupName: null,
            notes: null,
            removedAt: null,
            emailOpenedAt: null,
            sentAt: "2026-09-01T10:00:00.000Z",
            firstOpenedAt: "2026-09-02T10:00:00.000Z",
            respondedAt: "2026-09-03T10:00:00.000Z",
            rsvpStatus: "confirmed",
            totalPeople: 3,
        });
        // Nessun campo Convex interno trapela nella shape della UI.
        expect(guest).not.toHaveProperty("_id");
        expect(guest).not.toHaveProperty("organizationId");
    });

    it("il dettaglio converte risposta e attività, e una risposta mai aggiornata resta null", () => {
        const detail = toGuestDetail({
            guest: guestRow,
            response: {
                _id: "r1",
                _creationTime: 0,
                organizationId: "o1",
                eventId: "e1",
                guestId: "g1",
                attending: "yes",
                companionsCount: 1,
                answers: { q_menu: "Carne" },
                submittedAt: Date.parse("2026-09-03T10:00:00.000Z"),
            },
            activities: [
                {
                    _id: "a1",
                    _creationTime: 0,
                    organizationId: "o1",
                    eventId: "e1",
                    guestId: "g1",
                    type: "link_opened",
                    meta: { nth: 2 },
                    createdAt: Date.parse("2026-09-02T10:00:00.000Z"),
                },
            ],
        } as never);

        expect(detail.response).toEqual({
            attending: "yes",
            companionsCount: 1,
            answers: { q_menu: "Carne" },
            declineMessage: null,
            submittedAt: "2026-09-03T10:00:00.000Z",
            updatedAt: null,
        });
        expect(detail.activities).toEqual([
            { id: "a1", guestId: "g1", type: "link_opened", meta: { nth: 2 }, createdAt: "2026-09-02T10:00:00.000Z" },
        ]);
    });

    it("il payload dell'invito passa da millisecondi a ISO, e l'anteprima resta marcata", () => {
        const event = {
            title: "Giulia & Tommaso",
            type: "matrimonio",
            templateKey: "toscana",
            theme: null,
            inviteFont: null,
            eventDate: Date.parse("2026-10-10T00:00:00.000Z"),
            eventTime: "16:00",
            blocks: [],
            rsvpConfig: [],
            rsvpDeadline: null,
            rsvpClosedMessage: "Chiuso",
            slug: "giulia-tommaso",
        };

        const invite = toPublicInvitePayload({
            event,
            guest: { firstName: "Ada", lastName: "Lovelace" },
            response: {
                attending: "no",
                companionsCount: 0,
                answers: {},
                declineMessage: "Mi dispiace",
                updatedAt: Date.parse("2026-09-05T10:00:00.000Z"),
            },
            deadlinePassed: false,
        } as never);

        expect(invite.event.eventDate).toBe("2026-10-10T00:00:00.000Z");
        expect(invite.event.rsvpDeadline).toBeNull();
        expect(invite.response?.updatedAt).toBe("2026-09-05T10:00:00.000Z");
        expect(invite).not.toHaveProperty("preview");

        const preview = toPublicInvitePayload({
            event,
            guest: { firstName: "Anna", lastName: "" },
            response: null,
            deadlinePassed: false,
            preview: true,
        } as never);
        expect(preview.preview).toBe(true);
    });

    it("la risposta del submit è la stessa shape dai due backend del bridge", () => {
        // Convex (millisecondi) e legacy Drizzle (ISO) durante il blue-green.
        const fromConvex = toPublicRsvpResponse({
            attending: "yes",
            companionsCount: 0,
            answers: {},
            updatedAt: Date.parse("2026-09-05T10:00:00.000Z"),
        });
        const fromLegacy = toPublicRsvpResponse({
            attending: "yes",
            companionsCount: 0,
            answers: {},
            declineMessage: null,
            updatedAt: "2026-09-05T10:00:00.000Z",
        });
        expect(fromConvex).toEqual(fromLegacy);
    });

    it("un reminder inviato porta la data ISO, uno in attesa null", () => {
        const base = {
            _creationTime: 0,
            organizationId: "o1",
            eventId: "e1",
            daysBefore: 7,
            subject: "S",
            message: "M",
            enabled: true,
            pending: true,
            createdAt: 0,
            updatedAt: 0,
        };
        expect(toEventReminderData({ ...base, _id: "r1" } as never).sentAt).toBeNull();
        expect(
            toEventReminderData({ ...base, _id: "r2", sentAt: Date.parse("2026-09-01T00:00:00.000Z") } as never)
                .sentAt,
        ).toBe("2026-09-01T00:00:00.000Z");
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

describe("frontend: organization adapters (Task 14, part b)", () => {
    it("an organization row keeps the UI shape, with ISO dates and the caller's role", () => {
        expect(toOrganizationListItem({
            organizationId: "o1",
            name: "Atelier",
            slug: "atelier",
            logo: null,
            createdAt: Date.parse("2026-09-01T10:00:00.000Z"),
            role: "admin",
            isActive: true,
        })).toEqual({
            id: "o1",
            name: "Atelier",
            slug: "atelier",
            logo: null,
            createdAt: "2026-09-01T10:00:00.000Z",
            role: "admin",
            isActive: true,
        });
        expect(toOrganizationSummary(null)).toBeNull();
        expect(toOrganizationSummary({ organizationId: "o1", name: "A", slug: "a", logo: null, role: "owner" }))
            .toEqual({ id: "o1", name: "A", slug: "a", logo: null, role: "owner" });
    });

    it("a member becomes the plugin-shaped row, keyed by membership, written by app user id", () => {
        const member = toOrganizationMember({
            membershipId: "m1",
            userId: "u1",
            email: "bob@example.com",
            name: null,
            image: null,
            role: "member",
            createdAt: Date.parse("2026-09-02T10:00:00.000Z"),
            isSelf: false,
        });
        expect(member).toEqual({
            id: "m1",
            userId: "u1",
            role: "member",
            createdAt: "2026-09-02T10:00:00.000Z",
            isSelf: false,
            // No display name: shown by address, never blank.
            user: { name: "bob@example.com", email: "bob@example.com", image: null },
        });
    });

    it("pending invitations and the /invite preview convert dates and fall back on the inviter email", () => {
        expect(toOrganizationInvitation({
            invitationId: "i1",
            email: "carol@example.com",
            role: "member",
            expiresAt: Date.parse("2026-09-03T10:00:00.000Z"),
        })).toEqual({
            id: "i1",
            email: "carol@example.com",
            role: "member",
            status: "pending",
            expiresAt: "2026-09-03T10:00:00.000Z",
        });

        expect(toInvitationPreview(null)).toBeNull();
        expect(toInvitationPreview({
            email: "carol@example.com",
            role: "member",
            status: "expired",
            expiresAt: 0,
            organizationName: "Atelier",
            inviterName: null,
            inviterEmail: "alice@example.com",
        })).toMatchObject({ status: "expired", organizationName: "Atelier", inviterName: "alice@example.com" });
    });

    it("the /invite segment is a 64-hex token; a legacy plugin id is not", () => {
        expect(isInvitationToken("a".repeat(64))).toBe(true);
        expect(isInvitationToken("A".repeat(64))).toBe(false);
        expect(isInvitationToken("0198f2c4-7c1e-7d3a-9b2f-1a2b3c4d5e6f")).toBe(false);
        expect(isInvitationToken("")).toBe(false);
    });
});

/**
 * Task 14, part c (Step 5) — profile, GDPR export, public forms and uploads.
 *
 * The `/api/**` scans above prove what is *gone*; these pin what took its place,
 * so a file cannot pass the gate by simply calling nothing.
 */
describe("frontend: profile, export, public forms and uploads (Task 14, part c)", () => {
    const read = (relative: string): string =>
        stripComments(readFileSync(join(PROJECT_ROOT, relative), "utf8"));

    it("the profile store reads and writes api.profile, and keeps Better Auth only for credentials", () => {
        const store = read("app/stores/profileStore.ts");
        expect(store).toMatch(/api\.profile\.current/);
        expect(store).toMatch(/useConvexMutation\(\s*api\.profile\.update\b/);
        // Account deletion is a domain write (deferred purge + audit), not a Better
        // Auth endpoint: the Convex mutation schedules it and revokes the sessions.
        expect(store).toMatch(/useConvexMutation\(\s*api\.profile\.requestDeletion\b/);
        // Email and password changes stay Better Auth flows (verification, hashing).
        expect(store).toMatch(/client\.changeEmail\s*\(/);
        expect(store).toMatch(/client\.changePassword\s*\(/);
        expect(store).not.toMatch(/\$fetch\s*[(<]/);
    });

    it("the export components read api.dataExports live and download through a signed URL", () => {
        const section = read("app/components/profile/DataExportSection.vue");
        const history = read("app/components/profile/DataExportHistory.vue");

        expect(section).toMatch(/useConvexQuery\(\s*api\.dataExports\.status\b/);
        expect(section).toMatch(/useConvexMutation\(\s*api\.dataExports\.request\b/);
        expect(history).toMatch(/useConvexQuery\(\s*api\.dataExports\.history\b/);
        for (const source of [section, history]) {
            expect(source).toMatch(/api\.dataExports\.downloadUrl/);
            // The 3-second polling loop is replaced by the live query.
            expect(source).not.toMatch(/setInterval\s*\(/);
            expect(source).not.toMatch(/downloadToken/);
        }
    });

    it("uploads go presign → PUT to R2 → confirm, and never through the Nuxt runtime", () => {
        const upload = read("app/composables/useStorageUpload.ts");
        expect(upload).toMatch(/api\.files\.presignUpload/);
        expect(upload).toMatch(/api\.files\.confirmUpload/);
        expect(upload).toMatch(/method:\s*["']PUT["']/);
        expect(upload).not.toMatch(/FormData/);

        for (const page of ["app/pages/dashboard/profile/index.vue", "app/pages/dashboard/events/[id]/editor.vue"]) {
            const source = read(page);
            expect(source, page).toMatch(/useStorageUpload\s*\(/);
            expect(source, page).not.toMatch(/FormData/);
        }
    });

    it("public forms call only the protected Worker bridges, never Convex directly", () => {
        const forms = [
            "app/pages/index.vue",
            "app/components/landing/Contact.vue",
            "app/components/landing/WaitingListCTA.vue",
            "app/components/blog/BlogSidebar.vue",
            "app/components/blog/BlogNewsletter.vue",
        ];
        const bridges = ["/api/contact", "/api/waiting-list/subscribe"];

        for (const relative of forms) {
            const source = read(relative);
            const paths = apiPathsIn(relative, source);
            expect(paths.length, `${relative} must still submit through a bridge`).toBeGreaterThan(0);
            expect(paths.every((path) => bridges.includes(path)), `${relative}: ${paths.join(", ")}`).toBe(true);
            // The IP becomes a signed digest in the Worker: a direct Convex call
            // would skip that and the per-IP limiter with it.
            expect(source, relative).not.toMatch(/convex\/_generated|useConvex(Query|Mutation|Client|HttpClient|Action)\s*\(/);
        }
    });

    it("the dated-debt ledgers hold only transport constraints and the out-of-plan store", () => {
        expect(Object.keys(PENDING)).toEqual([]);
        expect(Object.keys(UI_PENDING)).toEqual([]);
        expect(Object.keys(UI_DEAD)).toEqual([]);
        expect(Object.keys(OUT_OF_SCOPE)).toEqual(["app/stores/feedbackStore.ts"]);
    });
});

describe("frontend: GDPR export adapter (Task 14, part c)", () => {
    const row = {
        id: "x1",
        status: "completed",
        format: "json",
        fileSize: 2048,
        expiresAt: Date.parse("2026-09-25T10:00:00.000Z"),
        completedAt: Date.parse("2026-09-24T10:00:00.000Z"),
        errorMessage: null,
        createdAt: Date.parse("2026-09-24T09:59:00.000Z"),
    };

    // A fixed clock: `toExportView` re-derives expiry, and the real one would
    // make this test fail the day after `row.expiresAt`.
    const NOW = Date.parse("2026-09-24T12:00:00.000Z");

    it("converts milliseconds to ISO and keeps the server-derived status", () => {
        expect(toExportView(row, NOW)).toEqual({
            ...row,
            expiresAt: "2026-09-25T10:00:00.000Z",
            completedAt: "2026-09-24T10:00:00.000Z",
            createdAt: "2026-09-24T09:59:00.000Z",
        });
        expect(toExportView({ ...row, status: "expired", completedAt: null }, NOW).status).toBe("expired");
        expect(toExportView({ ...row, completedAt: null, expiresAt: null }, NOW)).toMatchObject({
            completedAt: null,
            expiresAt: null,
        });
    });

    it("an export that expires while the page is open becomes expired without a new query result", () => {
        // Task 14c fix round 1: the server derives `expired` only when the query
        // re-runs, and the clock does not re-run it.
        const justBefore = Date.parse("2026-09-25T09:59:59.000Z");
        const justAfter = Date.parse("2026-09-25T10:00:00.001Z");
        expect(toExportView(row, justBefore).status).toBe("completed");
        expect(toExportView(row, justAfter).status).toBe("expired");
        // Only `completed` expires: a failed export keeps its own state.
        expect(toExportView({ ...row, status: "failed" }, justAfter).status).toBe("failed");
    });

    it("one timer: the delay is to the next expiry, none when nothing will expire", () => {
        const now = Date.parse("2026-09-25T09:00:00.000Z");
        const later = { ...row, id: "x2", expiresAt: Date.parse("2026-09-26T10:00:00.000Z") };
        expect(nextExpiryDelay([later, row], now)).toBe(60 * 60 * 1000);
        expect(nextExpiryDelay([{ ...row, status: "pending", expiresAt: null }], now)).toBeNull();
        expect(nextExpiryDelay([row], Date.parse("2026-09-25T11:00:00.000Z"))).toBeNull();
        // Beyond the browser's timer range the delay is capped (and re-armed).
        expect(nextExpiryDelay([{ ...row, expiresAt: now + 90 * 24 * 60 * 60 * 1000 }], now)).toBe(2_147_483_647);
    });

    it("an unexpected status is not downloadable and does not spin forever", () => {
        expect(toExportView({ ...row, status: "boh" }, NOW).status).toBe("failed");
    });
});
