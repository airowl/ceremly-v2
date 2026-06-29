/**
 * Site mode: single source of truth shared between client/server.
 *
 * Three states:
 * - active:      SaaS fully operational, no restrictions.
 * - waitinglist: only public landing/legal/blog; dashboard and auth closed.
 * - maintenance: everything redirected to the maintenance page (503).
 *
 * Gating rules live here (not duplicated across the two middlewares) and are
 * locale-agnostic: with i18n strategy `prefix_except_default` the non-default
 * locale routes are prefixed (e.g. /en/login), so before every match the path
 * is normalised with `stripLocale`.
 */
import { z } from "zod";

export const SITE_MODES = ["active", "waitinglist", "maintenance"] as const;
export type SiteMode = (typeof SITE_MODES)[number];

/**
 * Permissive schema: an unknown/typo value (e.g. "maintenence") collapses to
 * "active" instead of creating an inconsistent state. Using `.parse()` never throws.
 */
export const siteModeSchema = z.enum(SITE_MODES).catch("active");

/** Strict schema for human input (admin endpoint): a typo must fail, not silently pass. */
export const siteModeStrictSchema = z.enum(SITE_MODES);

/** Normalises an arbitrary value to a safe SiteMode (default "active"). */
export function resolveSiteMode(value: unknown): SiteMode {
    return siteModeSchema.parse(value);
}

/**
 * Non-default locale prefixes (i18n `prefix_except_default`).
 * Keep in sync with nuxt.config.ts → i18n.locales, excluding defaultLocale ("it").
 */
export const NON_DEFAULT_LOCALE_PREFIXES = ["en"] as const;

const LOCALE_RE = new RegExp(
    `^/(?:${NON_DEFAULT_LOCALE_PREFIXES.join("|")})(?=/|$)`
);

/**
 * Strips the non-default locale prefix from a path:
 *   "/en/login" → "/login", "/en" → "/", "/english-guide" → "/english-guide".
 * The lookahead `(?=/|$)` avoids touching paths that merely start with the locale string.
 */
export function stripLocale(path: string): string {
    return path.replace(LOCALE_RE, "") || "/";
}

/**
 * App/auth pages blocked in waitinglist mode (bare paths, evaluated after stripLocale).
 * Used by the SERVER as a blocklist: the server also sees assets/_nuxt/payload/API,
 * so it must block in a targeted manner and let everything else through.
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

/** True if `path` (any locale) is an app/auth page to block in waitinglist mode. */
export function isWaitingListBlockedPage(path: string): boolean {
    const p = stripLocale(path);
    return WAITINGLIST_BLOCKED_PREFIXES.some(
        (prefix) => p === prefix || p.startsWith(`${prefix}/`)
    );
}

/**
 * Public pages allowed in waitinglist mode (bare paths, after stripLocale).
 * Used by the CLIENT as an allowlist: the client middleware only sees Vue
 * navigations (pages), where an allowlist is natural and fail-closed on unknown.
 */
export const WAITINGLIST_ALLOWED_EXACT = ["/"] as const;
// "/e/" = public guest invite pages (/e/:slug/:token): must remain
// reachable even in waitinglist mode (opaque token as sole authority).
export const WAITINGLIST_ALLOWED_PREFIXES = ["/legal/", "/blogs", "/e/"] as const;

/** True if `path` (any locale) is a public page accessible in waitinglist mode. */
export function isWaitingListAllowedPage(path: string): boolean {
    const p = stripLocale(path);
    return (
        (WAITINGLIST_ALLOWED_EXACT as readonly string[]).includes(p) ||
        WAITINGLIST_ALLOWED_PREFIXES.some((prefix) => p.startsWith(prefix))
    );
}

/** Path of the maintenance page (locale-agnostic). */
export function isMaintenancePage(path: string): boolean {
    return stripLocale(path) === "/maintenance";
}
