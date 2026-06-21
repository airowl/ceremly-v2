/**
 * Generatore OpenAPI 3.1 → docs/openapi.json (importabile in Postman).
 *
 * Sorgente unica di verità: gli Zod schema in `shared/schemas/`, convertiti
 * via `z.toJSONSchema` (Zod 4). Le route sono registrate manualmente nella
 * tabella ROUTES sotto, ricavata da `server/api/` (escludendo cron/jobs/auth
 * catch-all, che sono interni QStash/Vercel/Better Auth).
 *
 * Uso:  pnpm openapi:generate
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import * as Barrel from "../shared/schemas/index";
// siteMode.ts non è ri-esportato dal barrel: lo aggiungiamo a mano.
import * as SiteMode from "../shared/schemas/siteMode";
const S = { ...Barrel, ...SiteMode };

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Conversione Zod → JSON Schema, con hoisting dei $defs in components.schemas
// ---------------------------------------------------------------------------
const components: Record<string, unknown> = {};

/** Riscrive ricorsivamente i $ref "#/$defs/X" → "#/components/schemas/X". */
function rewriteRefs(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(rewriteRefs);
    if (node && typeof node === "object") {
        const obj = node as Record<string, unknown>;
        for (const k of Object.keys(obj)) {
            if (k === "$ref" && typeof obj[k] === "string") {
                obj[k] = (obj[k] as string).replace(
                    "#/$defs/",
                    "#/components/schemas/",
                );
            } else {
                obj[k] = rewriteRefs(obj[k]);
            }
        }
    }
    return node;
}

/** Converte uno Zod schema in JSON Schema pulito (senza $defs/$schema locali). */
function toSchema(schema: z.ZodType): Record<string, unknown> {
    const js = z.toJSONSchema(schema, {
        target: "draft-2020-12",
        io: "input",
        reused: "inline",
        // z.date()/z.file() non hanno mapping JSON Schema diretto: non bloccare.
        unrepresentable: "any",
        override: (ctx) => {
            const t = (ctx.zodSchema as { _zod?: { def?: { type?: string } } })
                ._zod?.def?.type;
            if (t === "date") {
                Object.assign(ctx.jsonSchema, {
                    type: "string",
                    format: "date-time",
                });
            }
        },
    }) as Record<string, unknown>;

    if (js.$defs && typeof js.$defs === "object") {
        for (const [name, def] of Object.entries(js.$defs)) {
            components[name] = rewriteRefs(def);
        }
        delete js.$defs;
    }
    delete js.$schema;
    return rewriteRefs(js) as Record<string, unknown>;
}

function schemaByName(name: string): z.ZodType {
    const s = (S as Record<string, unknown>)[name];
    if (!s) throw new Error(`Schema non trovato in shared/schemas: ${name}`);
    return s as z.ZodType;
}

// ---------------------------------------------------------------------------
// Registro route — derivato da server/api/ (no cron/jobs/auth)
// ---------------------------------------------------------------------------
type Auth = "session" | "admin" | "public";
interface Route {
    method: "get" | "post" | "put" | "patch" | "delete";
    path: string; // formato OpenAPI con {param}
    tag: string;
    summary: string;
    auth: Auth;
    body?: string; // nome schema in shared/schemas
    query?: string; // nome schema (z.object) → parametri query
    multipart?: boolean; // upload file
}

const ROUTES: Route[] = [
    // Contact
    { method: "post", path: "/api/contact", tag: "Contact", summary: "Invia un messaggio dal form di contatto", auth: "public", body: "contactSchema" },

    // Waiting list
    { method: "post", path: "/api/waiting-list/subscribe", tag: "Waiting List", summary: "Iscrizione alla waiting list", auth: "public", body: "waitingListSubscribeSchema" },

    // Organizations
    { method: "get", path: "/api/organizations", tag: "Organizations", summary: "Lista organizzazioni dell'utente", auth: "session" },
    { method: "post", path: "/api/organizations", tag: "Organizations", summary: "Crea organizzazione", auth: "session", body: "createOrganizationSchema" },
    { method: "get", path: "/api/organizations/{id}", tag: "Organizations", summary: "Dettaglio organizzazione", auth: "session" },
    { method: "put", path: "/api/organizations/{id}", tag: "Organizations", summary: "Aggiorna organizzazione", auth: "session", body: "updateOrganizationSchema" },
    { method: "delete", path: "/api/organizations/{id}", tag: "Organizations", summary: "Elimina organizzazione", auth: "session" },
    { method: "get", path: "/api/organizations/{id}/members", tag: "Organizations", summary: "Lista membri dell'organizzazione", auth: "session" },

    // Projects (entità esempio canonica)
    { method: "get", path: "/api/projects", tag: "Projects", summary: "Lista progetti (org-scoped)", auth: "session" },
    { method: "post", path: "/api/projects", tag: "Projects", summary: "Crea progetto", auth: "session", body: "createProjectSchema" },
    { method: "get", path: "/api/projects/{id}", tag: "Projects", summary: "Dettaglio progetto", auth: "session" },
    { method: "put", path: "/api/projects/{id}", tag: "Projects", summary: "Aggiorna progetto", auth: "session", body: "updateProjectSchema" },
    { method: "delete", path: "/api/projects/{id}", tag: "Projects", summary: "Elimina progetto", auth: "session" },

    // Events
    { method: "get", path: "/api/events", tag: "Events", summary: "Lista eventi", auth: "session" },
    { method: "post", path: "/api/events", tag: "Events", summary: "Crea evento", auth: "session", body: "createEventSchema" },
    { method: "get", path: "/api/events/{id}", tag: "Events", summary: "Dettaglio evento", auth: "session" },
    { method: "put", path: "/api/events/{id}", tag: "Events", summary: "Aggiorna evento", auth: "session", body: "updateEventSchema" },
    { method: "delete", path: "/api/events/{id}", tag: "Events", summary: "Elimina evento", auth: "session" },
    { method: "get", path: "/api/events/{id}/export", tag: "Events", summary: "Esporta evento (CSV)", auth: "session" },
    { method: "get", path: "/api/events/{id}/stats", tag: "Events", summary: "Statistiche evento", auth: "session" },
    { method: "post", path: "/api/events/{id}/send", tag: "Events", summary: "Invia inviti", auth: "session", body: "sendInvitesSchema" },
    { method: "post", path: "/api/events/{id}/send-test", tag: "Events", summary: "Invia invito di test", auth: "session", body: "sendTestSchema" },
    { method: "post", path: "/api/events/{id}/mark-sent", tag: "Events", summary: "Segna inviti come inviati", auth: "session", body: "markSentSchema" },
    { method: "get", path: "/api/events/{id}/reminders", tag: "Events", summary: "Configurazione reminder", auth: "session" },
    { method: "put", path: "/api/events/{id}/reminders", tag: "Events", summary: "Aggiorna reminder", auth: "session", body: "remindersSchema" },

    // Guests
    { method: "get", path: "/api/events/{id}/guests", tag: "Guests", summary: "Lista invitati", auth: "session" },
    { method: "post", path: "/api/events/{id}/guests", tag: "Guests", summary: "Aggiungi invitato", auth: "session", body: "createGuestSchema" },
    { method: "post", path: "/api/events/{id}/guests/import", tag: "Guests", summary: "Import invitati (bulk)", auth: "session", body: "importGuestsSchema" },
    { method: "get", path: "/api/events/{id}/guests/{guestId}", tag: "Guests", summary: "Dettaglio invitato", auth: "session" },
    { method: "put", path: "/api/events/{id}/guests/{guestId}", tag: "Guests", summary: "Aggiorna invitato", auth: "session", body: "updateGuestSchema" },
    { method: "delete", path: "/api/events/{id}/guests/{guestId}", tag: "Guests", summary: "Elimina invitato", auth: "session" },
    { method: "get", path: "/api/events/{id}/guests/{guestId}/qr", tag: "Guests", summary: "QR code invitato", auth: "session" },

    // File
    { method: "post", path: "/api/file/upload", tag: "File", summary: "Upload diretto file", auth: "session", multipart: true },
    { method: "post", path: "/api/file/presign", tag: "File", summary: "Genera URL presigned per upload", auth: "session", body: "filePresignSchema" },
    { method: "post", path: "/api/file/confirm", tag: "File", summary: "Conferma upload presigned", auth: "session", body: "fileConfirmSchema" },
    { method: "get", path: "/api/file/{id}/url", tag: "File", summary: "URL firmato di download", auth: "session" },
    { method: "delete", path: "/api/file/{id}", tag: "File", summary: "Elimina file", auth: "session" },

    // User
    { method: "get", path: "/api/user/profile", tag: "User", summary: "Profilo utente", auth: "session" },
    { method: "patch", path: "/api/user/profile", tag: "User", summary: "Aggiorna profilo", auth: "session", body: "updateProfileSchema" },
    { method: "delete", path: "/api/user/account", tag: "User", summary: "Elimina account", auth: "session" },
    { method: "post", path: "/api/user/data-export/request", tag: "User", summary: "Richiedi export dati (GDPR)", auth: "session" },
    { method: "get", path: "/api/user/data-export/status", tag: "User", summary: "Stato export dati", auth: "session" },
    { method: "get", path: "/api/user/data-export/history", tag: "User", summary: "Storico export dati", auth: "session", query: "paginationQuerySchema" },
    { method: "get", path: "/api/user/data-export/download/{token}", tag: "User", summary: "Download export dati (via token)", auth: "public" },

    // Public (invitati / tracking)
    { method: "get", path: "/api/public/invite/{token}", tag: "Public", summary: "Dettaglio invito pubblico", auth: "public" },
    { method: "post", path: "/api/public/invite/{token}/rsvp", tag: "Public", summary: "Invia RSVP", auth: "public", body: "publicRsvpSchema" },
    { method: "get", path: "/api/public/pixel/{token}", tag: "Public", summary: "Tracking pixel apertura email", auth: "public" },

    // Admin (X-Admin-API-Key)
    { method: "get", path: "/api/admin/site-mode", tag: "Admin", summary: "Stato modalità sito", auth: "admin" },
    { method: "post", path: "/api/admin/site-mode", tag: "Admin", summary: "Imposta modalità sito", auth: "admin", body: "setSiteModeSchema" },
    { method: "delete", path: "/api/admin/site-mode", tag: "Admin", summary: "Reset modalità sito", auth: "admin" },
    { method: "post", path: "/api/admin/cleanup-files", tag: "Admin", summary: "Cleanup file orfani", auth: "admin" },
    { method: "get", path: "/api/admin/audit-logs", tag: "Admin", summary: "Lista audit log", auth: "admin" },
    { method: "get", path: "/api/admin/subscriptions", tag: "Admin", summary: "Lista subscription", auth: "admin" },
    { method: "patch", path: "/api/admin/subscriptions/{id}", tag: "Admin", summary: "Aggiorna subscription", auth: "admin", body: "adminUpdateSubscriptionSchema" },
    { method: "get", path: "/api/admin/waiting-list/export", tag: "Admin", summary: "Export waiting list", auth: "admin" },
    { method: "get", path: "/api/admin/users", tag: "Admin", summary: "Lista utenti", auth: "admin" },
    { method: "get", path: "/api/admin/users/{id}", tag: "Admin", summary: "Dettaglio utente", auth: "admin" },
    { method: "patch", path: "/api/admin/users/{id}", tag: "Admin", summary: "Aggiorna utente", auth: "admin", body: "adminUpdateUserSchema" },
    { method: "get", path: "/api/admin/users/{id}/audit-logs", tag: "Admin", summary: "Audit log di un utente", auth: "admin" },
    { method: "get", path: "/api/admin/stats", tag: "Admin", summary: "Statistiche piattaforma", auth: "admin" },
];

// ---------------------------------------------------------------------------
// Costruzione documento OpenAPI
// ---------------------------------------------------------------------------
function pathParams(path: string) {
    const names = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    return names.map((name) => ({
        name,
        in: "path",
        required: true,
        schema: { type: "string" },
    }));
}

function queryParams(schemaName: string) {
    const js = toSchema(schemaByName(schemaName));
    const props = (js.properties ?? {}) as Record<string, unknown>;
    const required = (js.required ?? []) as string[];
    return Object.entries(props).map(([name, schema]) => ({
        name,
        in: "query",
        required: required.includes(name),
        schema,
    }));
}

const securityFor: Record<Auth, unknown[]> = {
    session: [{ sessionCookie: [] }],
    admin: [{ adminApiKey: [] }],
    public: [], // [] esplicito = endpoint pubblico, nessuna auth richiesta
};

const TAG_DESCRIPTIONS: Record<string, string> = {
    Contact: "Form di contatto pubblico.",
    "Waiting List": "Iscrizioni alla waiting list.",
    Organizations: "Gestione organizzazioni (tenant) e membri.",
    Projects: "Entità progetto org-scoped (pattern di esempio).",
    Events: "Gestione eventi: creazione, invio inviti, reminder, statistiche.",
    Guests: "Invitati di un evento: CRUD, import bulk, QR code.",
    File: "Upload file (diretto e presigned) su R2.",
    Limits: "Limiti di piano per organizzazione.",
    User: "Profilo, account ed export dati GDPR.",
    Public: "Endpoint pubblici per invitati (invito, RSVP, tracking).",
    Admin: "Operazioni amministrative (header X-Admin-API-Key).",
};

const paths: Record<string, Record<string, unknown>> = {};

for (const r of ROUTES) {
    const op: Record<string, unknown> = {
        tags: [r.tag],
        summary: r.summary,
        operationId: `${r.method}_${r.path.replace(/[/{}]/g, "_").replace(/^_+|_+$/g, "")}`,
    };

    const params: unknown[] = [...pathParams(r.path)];
    if (r.query) params.push(...queryParams(r.query));
    if (params.length) op.parameters = params;

    if (r.multipart) {
        op.requestBody = {
            required: true,
            content: {
                "multipart/form-data": {
                    schema: {
                        type: "object",
                        properties: { file: { type: "string", format: "binary" } },
                        required: ["file"],
                    },
                },
            },
        };
    } else if (r.body) {
        op.requestBody = {
            required: true,
            content: {
                "application/json": { schema: toSchema(schemaByName(r.body)) },
            },
        };
    }

    op.security = securityFor[r.auth];

    op.responses = {
        "200": { description: "OK" },
        ...(r.auth !== "public"
            ? { "401": { description: "Non autenticato" } }
            : {}),
        "400": { description: "Input non valido (Zod)" },
    };

    paths[r.path] ??= {};
    paths[r.path][r.method] = op;
}

const baseUrl = process.env.NUXT_PUBLIC_BASE_URL || "http://localhost:3000";

const doc = {
    openapi: "3.1.0",
    info: {
        title: `${process.env.NUXT_PUBLIC_APP_NAME || "Ceremly"} API`,
        version: "1.0.0",
        description:
            "API backend (Nuxt/Nitro). Auth di sessione via cookie Better Auth; gli endpoint admin usano l'header X-Admin-API-Key. Tutte le risorse tenant sono org-scoped. Escludono route interne cron/jobs/auth.",
    },
    servers: [{ url: baseUrl, description: "Server attivo" }],
    tags: [...new Set(ROUTES.map((r) => r.tag))].map((name) => ({
        name,
        description: TAG_DESCRIPTIONS[name],
    })),
    paths,
    components: {
        schemas: components,
        securitySchemes: {
            sessionCookie: {
                type: "apiKey",
                in: "cookie",
                name: "better-auth.session_token",
                description: "Cookie di sessione Better Auth (login via /api/auth).",
            },
            adminApiKey: {
                type: "apiKey",
                in: "header",
                name: "X-Admin-API-Key",
                description: "Chiave admin (env NUXT_ADMIN_API_KEY).",
            },
        },
    },
};

const outDir = resolve(ROOT, "docs");
mkdirSync(outDir, { recursive: true });
const outFile = resolve(outDir, "openapi.json");
writeFileSync(outFile, JSON.stringify(doc, null, 2) + "\n");

console.log(
    `✅ OpenAPI generato: ${outFile}\n   ${ROUTES.length} route · ${Object.keys(components).length} schema condivisi`,
);
