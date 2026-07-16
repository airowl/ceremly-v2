/**
 * Fresh-ban gate for Better Auth's own endpoints (security review F5).
 *
 * getAuthSession's isUserBannedFresh re-check is skipped for /api/auth/* by the
 * app middleware (1.auth.ts:16), and the admin() plugin only checks `banned` at
 * sign-in (admin-D-OMdNIc.mjs:98-118) — not on subsequent cached-session requests.
 * This predicate selects the authenticated, state-changing sub-paths that must
 * re-verify ban status from the DB before proceeding. Paths are relative to the
 * Better Auth basePath (ctx.path has NO /api/auth prefix).
 */
const GUARDED_PREFIXES = ["/organization/", "/admin/"] as const;

export function shouldBanGuardPath(path: string): boolean {
    return GUARDED_PREFIXES.some((prefix) => path.startsWith(prefix));
}
