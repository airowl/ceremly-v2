/**
 * Site mode: single source of truth condivisa client/server.
 *
 * Quattro stati:
 * - active:                SaaS pienamente operativo, nessuna restrizione.
 * - waitinglist:           solo landing/legal/blog pubblici; dashboard e auth chiusi.
 * - maintenance:           tutto reindirizzato alla pagina di manutenzione (503).
 * - maintenance-readonly:  **solo le scritture** bloccate (503); letture e pagine
 *                          passano. Serve al caso che non ha un'alternativa: un
 *                          intervento che richiede di fermare le scritture (una
 *                          migrazione, un'indagine su dati incoerenti) senza
 *                          togliere il sito a chi lo sta guardando. Nel legacy
 *                          l'unica scelta era `maintenance`, cioè chiudere tutto.
 *
 * Le regole di gating vivono qui (non duplicate nei due middleware) e sono
 * locale-agnostiche: con i18n strategy `prefix_except_default` le route della
 * locale non-default sono prefissate (es. /en/login), quindi prima di ogni
 * match si normalizza il path con `stripLocale`.
 */
import { z } from "zod";

export const SITE_MODES = [
    "active",
    "waitinglist",
    "maintenance",
    "maintenance-readonly",
] as const;
export type SiteMode = (typeof SITE_MODES)[number];

/**
 * Metodi HTTP non idempotenti: in `maintenance-readonly` sono quelli che chiudono.
 *
 * L'elenco è una *allowlist di letture* rovesciata: tutto ciò che non è GET/HEAD/
 * OPTIONS è trattato come scrittura. Un metodo sconosciuto o nuovo resta quindi
 * bloccato per default, che è la direzione giusta per un interruttore di sicurezza.
 */
export const READONLY_ALLOWED_METHODS = ["GET", "HEAD", "OPTIONS"] as const;

export function isWriteMethod(method: string | undefined): boolean {
    // Un metodo assente non è "una lettura": è un input che non capiamo, e in un
    // interruttore di sicurezza l'ignoto si chiude. (In pratica h3 lo fornisce
    // sempre; questa riga esiste per il caso che non dovrebbe accadere.)
    if (typeof method !== "string") return true;
    return !(READONLY_ALLOWED_METHODS as readonly string[]).includes(method.toUpperCase());
}

/**
 * Schema permissivo: un valore ignoto/typo (es. "maintenence") collassa su
 * "active" invece di creare uno stato incoerente. Usare `.parse()` non lancia.
 */
export const siteModeSchema = z.enum(SITE_MODES).catch("active");

/** Schema strict per input umano (endpoint admin): un typo deve fallire, non silenziare. */
export const siteModeStrictSchema = z.enum(SITE_MODES);

/** Normalizza un valore arbitrario a un SiteMode sicuro (default "active"). */
export function resolveSiteMode(value: unknown): SiteMode {
    return siteModeSchema.parse(value);
}

/**
 * Prefissi delle locale NON-default (i18n `prefix_except_default`).
 * Tenere in sync con nuxt.config.ts → i18n.locales, escluso defaultLocale ("it").
 */
export const NON_DEFAULT_LOCALE_PREFIXES = ["en"] as const;

const LOCALE_RE = new RegExp(
    `^/(?:${NON_DEFAULT_LOCALE_PREFIXES.join("|")})(?=/|$)`
);

/**
 * Rimuove il prefisso locale non-default da un path:
 *   "/en/login" → "/login", "/en" → "/", "/english-guide" → "/english-guide".
 * Il lookahead `(?=/|$)` evita di intaccare path che iniziano per la locale.
 */
export function stripLocale(path: string): string {
    return path.replace(LOCALE_RE, "") || "/";
}

/**
 * Pagine app/auth chiuse in waitinglist (path nudi, valutati dopo stripLocale).
 * Usata dal SERVER come blocklist: il server vede anche asset/_nuxt/payload/API,
 * quindi deve bloccare in modo mirato e lasciar passare tutto il resto.
 */
export const WAITINGLIST_BLOCKED_PREFIXES = [
    "/dashboard",
    "/login",
    "/signup",
    "/logout",
    "/auth",
    "/invite",
    "/contact",
] as const;

/** True se `path` (qualsiasi locale) è una pagina app/auth da bloccare in waitinglist. */
export function isWaitingListBlockedPage(path: string): boolean {
    // The server sees `event.path` with its query string: `/login?x=y` is `/login`
    // (found by the Task 15 break-glass tests — before, a query string walked past).
    const p = stripLocale(splitPath(path).pathname);
    return WAITINGLIST_BLOCKED_PREFIXES.some(
        (prefix) => p === prefix || p.startsWith(`${prefix}/`)
    );
}

/**
 * Pagine pubbliche consentite in waitinglist (path nudi, dopo stripLocale).
 * Usata dal CLIENT come allowlist: il middleware client vede solo navigazioni
 * Vue (pagine), dove un allowlist è naturale e fail-closed sull'ignoto.
 */
export const WAITINGLIST_ALLOWED_EXACT = ["/"] as const;
// "/e/" = pagine invito ospite pubbliche (/e/:slug/:token): devono restare
// raggiungibili anche in waitinglist (token opaco come unica autorità).
export const WAITINGLIST_ALLOWED_PREFIXES = ["/legal/", "/blogs", "/e/"] as const;

/** True se `path` (qualsiasi locale) è una pagina pubblica accessibile in waitinglist. */
export function isWaitingListAllowedPage(path: string): boolean {
    const p = stripLocale(path);
    return (
        (WAITINGLIST_ALLOWED_EXACT as readonly string[]).includes(p) ||
        WAITINGLIST_ALLOWED_PREFIXES.some((prefix) => p.startsWith(prefix))
    );
}

/** Path della pagina di manutenzione (locale-agnostico). */
export function isMaintenancePage(path: string): boolean {
    return stripLocale(splitPath(path).pathname) === "/maintenance";
}

/**
 * Admin console break-glass (Task 15, fix round 1).
 *
 * The console can put the site in `maintenance`/`waitinglist`; if the same
 * switch closed the console, it could not undo itself. So in every non-active
 * mode three things stay reachable, and only these:
 *
 * - the console page shell (`/admin/**`, any locale) — it renders nothing
 *   until Convex confirms the superAdmin role, which is the real gate;
 * - the login page **only** when it is on its way to the console
 *   (`/login?redirect=/admin…`), so an expired admin session can be renewed;
 * - the Better Auth endpoints a session needs (sign-in, 2FA, session read,
 *   Convex token, sign-out) — sign-up is not among them.
 *
 * A non-admin who reaches these gets the console's refusal and nothing else:
 * every other page and API keeps the mode's rules.
 */
export const ADMIN_BREAK_GLASS_AUTH_PREFIXES = [
    "/api/auth/sign-in/",
    "/api/auth/two-factor/",
    "/api/auth/get-session",
    "/api/auth/convex/",
    "/api/auth/sign-out",
] as const;

function splitPath(path: string): { pathname: string; search: string } {
    const index = path.indexOf("?");
    return index === -1
        ? { pathname: path, search: "" }
        : { pathname: path.slice(0, index), search: path.slice(index + 1) };
}

/** `/admin`, `/admin/…` in any locale. */
export function isAdminConsolePage(path: string): boolean {
    const p = stripLocale(splitPath(path).pathname);
    return p === "/admin" || p.startsWith("/admin/");
}

/** `/login` whose `redirect` points at the console (any locale). */
export function isAdminBreakGlassLogin(path: string, redirect?: unknown): boolean {
    const { pathname, search } = splitPath(path);
    if (stripLocale(pathname) !== "/login") return false;
    const target = typeof redirect === "string" ? redirect : new URLSearchParams(search).get("redirect");
    return typeof target === "string" && target.startsWith("/") && isAdminConsolePage(target);
}

/** The session endpoints the console needs (see the list above). */
export function isAdminBreakGlassAuthApi(path: string): boolean {
    const { pathname } = splitPath(path);
    return ADMIN_BREAK_GLASS_AUTH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** Any of the three: what the site-mode gates must let through outside `active`. */
export function isAdminBreakGlass(path: string, redirect?: unknown): boolean {
    return isAdminConsolePage(path) || isAdminBreakGlassLogin(path, redirect) || isAdminBreakGlassAuthApi(path);
}

// ---------------------------------------------------------------------------
// maintenance-readonly as the cutover mode (migration Task 17, Step 1)
// ---------------------------------------------------------------------------
//
// During the cutover the window between "the legacy stops writing" and "Convex
// starts writing" is where a write is lost for good: it lands after the
// watermark, so the delta export never carries it. The rule is therefore
// **closed by default**: every write method is refused, whatever the path, and
// the only exceptions are the short explicit allowlist below. A route added
// tomorrow is closed without anyone touching this file
// (`test/migration/readonly-mode.test.ts` enumerates `server/api/**` to prove it).
//
// Reads are open by default, with one twist: some GETs write (cron, OAuth
// callback, e-mail verification, open tracking). Those are classified in
// `READONLY_SIDE_EFFECT_READS`, and the same test fails on a GET route that is
// neither audited as pure nor classified.

/** `Retry-After` on every read-only refusal: the maintenance budget (≤ 30 min). */
export const READONLY_RETRY_AFTER_SECONDS = 1800;

type ReadonlyWriteRule = {
    methods: readonly string[];
    /** `exact`: the pathname must equal `path`; `prefix`: must start with it. */
    match: "exact" | "prefix";
    path: string;
    why: string;
};

/**
 * The only writes `maintenance-readonly` lets through. Growing this list is a
 * decision about what may be written after the watermark; the drift test pins
 * the resulting set of routes.
 */
export const READONLY_ALLOWED_WRITES: readonly ReadonlyWriteRule[] = [
    {
        methods: ["POST", "DELETE"],
        match: "exact",
        path: "/api/admin/site-mode",
        why: "rollback: the toggle that re-opens (or keeps closed) the legacy writes",
    },
    {
        methods: ["POST"],
        match: "prefix",
        path: "/api/jobs/",
        why: "drain: jobs already enqueued must finish before the watermark",
    },
    {
        methods: ["POST"],
        match: "exact",
        path: "/api/auth/creem/webhook",
        why: "provider truth: Creem retries only for a limited window; reconciled after the switch",
    },
    {
        methods: ["POST"],
        match: "exact",
        path: "/api/webhooks/resend",
        why: "provider truth: delivery/bounce events; reconciled after the switch",
    },
    // Password login (+ TOTP) and logout. They write only sessions, which are
    // ephemeral and never imported (the runbook invalidates them anyway).
    // Deliberately absent: OAuth (`sign-in/social`, `callback/*` can create a
    // user) and `two-factor/verify-backup-code` (consumes a credential).
    { methods: ["POST"], match: "exact", path: "/api/auth/sign-in/email", why: "login" },
    { methods: ["POST"], match: "exact", path: "/api/auth/two-factor/verify-totp", why: "login (2FA)" },
    { methods: ["POST"], match: "exact", path: "/api/auth/sign-out", why: "logout" },
];

/**
 * GET routes that write. `block`: refused like a write. `suppress`: served,
 * with the handler skipping its side effect (`shouldTrackReads()` on the server).
 */
export const READONLY_SIDE_EFFECT_READS: readonly { prefix: string; action: "block" | "suppress"; why: string }[] = [
    { prefix: "/api/cron/", action: "block", why: "cleanup/purge writes and reminder enqueue" },
    { prefix: "/api/auth/callback/", action: "block", why: "OAuth callback: may create a user or link an account" },
    { prefix: "/api/auth/oauth2/", action: "block", why: "generic OAuth callback" },
    { prefix: "/api/auth/verify-email", action: "block", why: "marks the e-mail verified" },
    { prefix: "/api/auth/magic-link/", action: "block", why: "creates a session and possibly a user" },
    { prefix: "/api/public/invite/", action: "suppress", why: "open tracking (firstOpenedAt, openCount, activity)" },
    { prefix: "/api/public/pixel/", action: "suppress", why: "e-mail open tracking; a pixel must always answer 200" },
];

export type ReadonlyVerdict = "allow" | "block" | "redirect-home";

/** Verdict of `maintenance-readonly` for one request. Pure: shared by middleware and tests. */
export function readonlyVerdict(path: string, method: string | undefined): ReadonlyVerdict {
    const { pathname } = splitPath(path);

    if (!isWriteMethod(method)) {
        if (isMaintenancePage(pathname)) return "redirect-home";
        const sideEffect = READONLY_SIDE_EFFECT_READS.find((entry) => pathname.startsWith(entry.prefix));
        return sideEffect?.action === "block" ? "block" : "allow";
    }

    const upper = (method as string).toUpperCase();
    const allowed = READONLY_ALLOWED_WRITES.some(
        (rule) =>
            rule.methods.includes(upper) &&
            // `..` never reaches a handler as a traversal, but an allowlist must
            // not depend on who normalizes the path downstream.
            !pathname.includes("..") &&
            (rule.match === "exact" ? pathname === rule.path : pathname.startsWith(rule.path)),
    );
    return allowed ? "allow" : "block";
}

/**
 * Whether the auth catch-all serves `path` in `mode`. The site-mode middleware
 * runs first and is the enforcement; this only decides whether the catch-all
 * goes dark (it does outside `active`, except webhook and break-glass). In
 * `maintenance-readonly` it stays on, so the login the mode promises works.
 */
export function isAuthCatchAllOpen(mode: SiteMode, path: string): boolean {
    if (mode === "active" || mode === "maintenance-readonly") return true;
    const { pathname } = splitPath(path);
    return pathname.includes("/creem/webhook") || isAdminBreakGlassAuthApi(pathname);
}
