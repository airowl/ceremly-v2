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
    const p = stripLocale(path);
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
    return stripLocale(path) === "/maintenance";
}
