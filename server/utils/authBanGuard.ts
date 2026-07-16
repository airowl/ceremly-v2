/**
 * Fresh-ban gate for Better Auth's own endpoints (security review F5).
 *
 * getAuthSession's isUserBannedFresh re-check is skipped for /api/auth/* by the
 * app middleware (1.auth.ts:16), and the admin() plugin only checks `banned` at
 * sign-in (admin-D-OMdNIc.mjs:98-118) — not on subsequent cached-session requests.
 * This predicate guards ALL org/admin/creem sub-paths by prefix — reads included,
 * not just mutations — so a banned user with a stale cached session can't keep
 * driving these plugins until the session TTL expires. Matching by prefix (not
 * an explicit endpoint allowlist) is deliberately fail-safe: any future endpoint
 * a plugin adds under one of these prefixes is covered automatically. Paths are
 * relative to the Better Auth basePath (ctx.path has NO /api/auth prefix).
 * /creem/webhook is unauthenticated, so it never reaches this gate's DB check —
 * the caller's null-session early-return handles it before isUserBannedFresh runs.
 */
const GUARDED_PREFIXES = ["/organization/", "/admin/", "/creem/"] as const;

export function shouldBanGuardPath(path: string): boolean {
    return GUARDED_PREFIXES.some((prefix) => path.startsWith(prefix));
}
