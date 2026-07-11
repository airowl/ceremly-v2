# Better Auth Review Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 16 findings from the Better Auth security review (`docs/superpowers/specs/2026-07-11-better-auth-review-design.md`), closing one HIGH (OAuth pre-hijacking), five MEDIUM, and hardening the rest.

**Architecture:** Most fixes are config changes in `server/utils/auth.ts` (single source of Better Auth config). Two require new logic: an org-less-user idempotency fix and a fresh-ban gate on `/api/auth/*`. Pure predicates are unit-tested with vitest; config-only changes are verified by reading back the config and by targeted assertions where a pure helper is introduced.

**Tech Stack:** Nuxt 4 (Nitro, `vercel` preset), Better Auth 1.4.5 (`admin`, `organization`, `twoFactor`, `openAPI` plugins), Drizzle + Neon HTTP, Upstash (secondaryStorage), vitest 2.1.

## Global Constraints

- **Never use `process.env` in routes/services** — always `runtimeConfig` (`server/utils/runtimeConfig.ts`) or `useRuntimeConfig()`. Copied verbatim from CLAUDE.md.
- **Comments/tests/logs in English; product/UI strings in Italian** (project language convention).
- **Better Auth config lives ONLY in `server/utils/auth.ts`** — do not scatter auth options elsewhere.
- **Every tenant query filters by `organizationId`** — do not regress this in F14.
- **Tests run with `pnpm test` (`vitest run`).** Pure-function unit tests sit next to the file as `<name>.test.ts` (pattern: `server/utils/banStatus.test.ts`).
- **Do not push** — commits are automatic when verified; the user pushes manually.
- **Verify Better Auth option names against `node_modules/better-auth/dist/*` before relying on them** — this plan already verified: `revokeSessionsOnPasswordReset` (`api-CkmycQ2x.mjs:1946`), `autoSignInAfterVerification` (`:1360`), `adminRoles`/`defaultRole` (`admin-D-OMdNIc.mjs:74-75`), linking guard (`:826`), 2FA matcher (`two-factor-BDQvVILL.mjs:872`), reset endpoint `/request-password-reset` (`:1804`).

---

## Task ordering rationale

Config-only quick wins (Tasks 1-5) land first — each is low-risk and independently valuable. Then the two logic tasks (Task 6 ban gate, Task 7 org idempotency). Client/DiD fixes (Tasks 8-9). F8 (admin control plane) and F15 (reset page) are decision/feature items handled in Task 10 as documentation + a scoped follow-up, not silent code.

---

### Task 1: F1 — Disable OAuth auto-linking (HIGH)

**Files:**
- Modify: `server/utils/auth.ts:262-266`
- Verify (read-only): existing `account` rows in dev DB

**Interfaces:**
- Consumes: nothing.
- Produces: `account.accountLinking` disabled — Google and email/password become distinct sign-in methods on the same email.

- [ ] **Step 1: Pre-flight — confirm no existing user relies on an already-linked account**

Run against the dev DB (Neon dev branch — see memory `ceremly-neon-db-branches`):
```bash
# List users that have BOTH a credential account and a google account (same userId).
# If this returns rows, those users currently sign in via linking → plan a comms/migration step before shipping.
pnpm db:studio  # or run the SQL below via your SQL client
```
```sql
SELECT a.user_id, COUNT(DISTINCT a.provider_id) AS providers
FROM account a
WHERE a.provider_id IN ('credential', 'google')
GROUP BY a.user_id
HAVING COUNT(DISTINCT a.provider_id) > 1;
```
Expected: 0 rows in a clean dev DB. If rows exist, note them in the PR description; disabling linking does not delete existing links (existing linked accounts keep working — the `hasBeenLinked` branch at `api-CkmycQ2x.mjs:823` still matches), it only stops NEW auto-links. So shipping is safe even with existing links; document them.

- [ ] **Step 2: Disable account linking**

In `server/utils/auth.ts`, change the `account` block:
```ts
        account: {
            accountLinking: {
                // Auto-linking of a pre-existing account is DISABLED (security review F1):
                // Better Auth only checks the INCOMING provider email's verification, never
                // whether the pre-existing LOCAL credential row was verified. With linking on,
                // an attacker who pre-registers victim@gmail.com (unverified, no session) has
                // that row adopted — and flipped to emailVerified=true — when the real victim
                // later signs in with Google (api-CkmycQ2x.mjs:826,852). Google and
                // email/password are now distinct sign-in methods keyed on one primary credential.
                enabled: false,
            },
        },
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no type errors from the config change).

- [ ] **Step 4: Manual verification (dev)**

With `pnpm dev` running, confirm the pre-hijacking path is closed:
1. Sign up `linktest@example.com` with email/password (do NOT verify).
2. Sign in with Google using the same `linktest@example.com`.
Expected: Google sign-in does NOT adopt the unverified local row — Better Auth returns "account not linked" behavior (new-user or error path), and the pre-existing unverified credential row's `emailVerified` stays `false`. Confirm via SQL: `SELECT email_verified FROM "user" WHERE email='linktest@example.com';` → `false`.

- [ ] **Step 5: Commit**

```bash
git add server/utils/auth.ts
git commit -m "fix(auth): disable OAuth auto-linking to close account pre-hijacking (F1)"
```

---

### Task 2: F3 — Revoke sessions on password reset (MEDIUM)

**Files:**
- Modify: `server/utils/auth.ts:201-222` (`emailAndPassword` block)

**Interfaces:**
- Consumes: nothing.
- Produces: password reset now calls `deleteSessions(userId)` (`api-CkmycQ2x.mjs:1946`).

- [ ] **Step 1: Add the option**

In `server/utils/auth.ts`, in the `emailAndPassword` block, add the flag alongside `enabled`/`requireEmailVerification`:
```ts
        emailAndPassword: {
            enabled: true,
            requireEmailVerification: true,
            // Security review F3: a user who resets their password (often BECAUSE they
            // suspect compromise) must not leave the attacker's existing session alive.
            // Better Auth only calls deleteSessions(userId) on reset when this is set
            // (api-CkmycQ2x.mjs:1946).
            revokeSessionsOnPasswordReset: true,
            sendResetPassword: async ({ user, url }) => {
```
(Leave the rest of the block unchanged.)

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/utils/auth.ts
git commit -m "fix(auth): revoke existing sessions on password reset (F3)"
```

---

### Task 3: F4 — Disable auto-sign-in after email verification (MEDIUM)

**Files:**
- Modify: `server/utils/auth.ts:223-255` (`emailVerification` block)

**Interfaces:**
- Consumes: nothing.
- Produces: clicking a verification link no longer mints a session (`api-CkmycQ2x.mjs:1360` branch no longer taken).

- [ ] **Step 1: Flip the flag**

In `server/utils/auth.ts`, in the `emailVerification` block:
```ts
        emailVerification: {
            sendOnSignUp: true,
            // Security review F4: the verification token is a stateless HS256 JWT with no
            // single-use DB record (api-CkmycQ2x.mjs:1260) → replayable until expiry (~1h).
            // With auto-sign-in ON, a leaked verification URL granted repeated account access.
            // Require an explicit login after verification instead.
            autoSignInAfterVerification: false,
            sendVerificationEmail: async ({ user, url }, request) => {
```
(Leave `sendVerificationEmail` unchanged.)

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Manual verification (dev)**

Sign up a new user, click the verification link from the dev email log.
Expected: user lands verified but NOT logged in — must sign in explicitly. Confirm no session cookie is set on the verification response.

- [ ] **Step 4: Commit**

```bash
git add server/utils/auth.ts
git commit -m "fix(auth): require explicit login after email verification (F4)"
```

---

### Task 4: F6 + F7 — Fix audit path mapping and sign-up attribution (MEDIUM / LOW-MED)

**Files:**
- Modify: `server/utils/auth.ts:267-356` (`hooks.after` audit middleware)

**Interfaces:**
- Consumes: `logAudit(null, action, opts)` (`server/utils/audit`), `AuditAction` type.
- Produces: `auth.password_reset_requested` now fires; `auth.signed_up` / `auth.tos_accepted` attribute a real userId under `requireEmailVerification`.

- [ ] **Step 1: Fix the reset-password path key (F6)**

In `AUTH_PATH_MAP` (`auth.ts:269-274`), change the key and, in the else-if array (`auth.ts:287`), the entry:
```ts
                const AUTH_PATH_MAP: Record<string, AuditAction> = {
                    '/sign-in/email': 'auth.signed_in',
                    '/sign-up/email': 'auth.signed_up',
                    // F6: real Better Auth 1.4.5 endpoint is /request-password-reset
                    // (api-CkmycQ2x.mjs:1804); /forget-password does not exist in this version.
                    '/request-password-reset': 'auth.password_reset_requested',
                    '/reset-password': 'auth.password_reset_completed',
                };
```
And the enumeration array (`auth.ts:287`):
```ts
                } else if (
                    ["/sign-in/email", "/sign-up/email", "/request-password-reset"]
                        .includes(ctx.path)
                ) {
```
(Note the leading slash added — the old `"forget-password"` never matched `ctx.path`.)

- [ ] **Step 2: Fix sign-up userId attribution (F7)**

In the success branch (`auth.ts:322-354`), the `/sign-up/email` path has no `newSession` under `requireEmailVerification`. Resolve the userId from the created user by email. Replace the `userId` resolution block:
```ts
                    const action = AUTH_PATH_MAP[ctx.path];
                    if (action) {
                        let userId: string | undefined;
                        if (ctx.path === "/sign-in/email") {
                            userId = ctx.context.newSession?.user.id;
                        } else if (ctx.path === "/sign-up/email") {
                            // F7: under requireEmailVerification, sign-up returns no session
                            // (newSession is undefined). Resolve the just-created user by email
                            // so auth.signed_up and auth.tos_accepted attribute correctly.
                            const email = ctx.body?.email as string | undefined;
                            if (email) {
                                const db = getDB();
                                const rows = await db
                                    .select({ id: schema.user.id })
                                    .from(schema.user)
                                    .where(eq(schema.user.email, email))
                                    .limit(1);
                                userId = rows[0]?.id;
                            }
                        } else {
                            userId = ctx.context.session?.user.id;
                        }
                        await logAudit(null, action, {
                            userId,
                            targetType,
                            targetId,
                            ipAddress,
                            userAgent,
                            status: "success",
                        });

                        if (ctx.path === "/sign-up/email" && userId) {
                            await logAudit(null, 'auth.tos_accepted', {
                                userId,
                                targetType: "user",
                                targetId: userId,
                                ipAddress,
                                userAgent,
                                status: "success",
                                details: { message: "ToS accepted at registration" },
                            });
                        }
                    }
```
(`getDB`, `schema`, and `eq` are already imported at the top of `auth.ts` — lines 13, 8, 9.)

- [ ] **Step 3: Guard the audit body null-deref (F11)**

At `auth.ts:291`, change `ctx.body.email` to the optional-chained form:
```ts
                    targetId = ctx.body?.email || "";
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Manual verification (dev)**

1. Request a password reset for an existing user → check `audit_log` has an `auth.password_reset_requested` row (previously absent).
2. Sign up a new user → check `audit_log` has `auth.signed_up` AND `auth.tos_accepted` rows, both with a non-null `user_id`.
```sql
SELECT action, user_id FROM audit_log WHERE action IN
  ('auth.password_reset_requested','auth.signed_up','auth.tos_accepted')
ORDER BY created_at DESC LIMIT 5;
```

- [ ] **Step 6: Commit**

```bash
git add server/utils/auth.ts
git commit -m "fix(auth): correct reset audit path + sign-up attribution + audit null-guard (F6,F7,F11)"
```

---

### Task 5: F9 — Rate-limit change-email to bound enumeration (LOW)

**Files:**
- Modify: `server/utils/auth.ts:187-200` (`rateLimit.customRules`)

**Interfaces:**
- Consumes: nothing.
- Produces: `/change-email` gains a per-IP limit.

- [ ] **Step 1: Add the rule**

In `rateLimit.customRules`, add the `/change-email` entry:
```ts
            customRules: {
                "/sign-in/email": { window: 10, max: 3 },
                "/request-password-reset": { window: 60, max: 5 },
                "/reset-password": { window: 60, max: 10 },
                // F9: /change-email returns a distinct 422 for an already-registered target
                // (library default), enabling enumeration. Rate-limit to bound it.
                "/change-email": { window: 60, max: 5 },
            },
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/utils/auth.ts
git commit -m "fix(auth): rate-limit change-email to bound account enumeration (F9)"
```

---

### Task 6: F5 — Fresh ban gate on `/api/auth/*` (MEDIUM)

**Files:**
- Create: `server/utils/authBanGuard.ts`
- Create: `server/utils/authBanGuard.test.ts`
- Modify: `server/utils/auth.ts` (`hooks.before` — add a before-middleware)

**Interfaces:**
- Consumes: `isUserBannedFresh(userId)` (`server/utils/banStatus.ts`), `createAuthMiddleware` (already imported at `auth.ts:5`).
- Produces: `shouldBanGuardPath(path: string): boolean` — pure predicate deciding which Better Auth paths get a fresh ban re-check.

**Background:** `isUserBannedFresh` currently runs only via `getAuthSession`, which the middleware skips for `/api/auth/*` (`1.auth.ts:16`). Better Auth's `admin()` plugin checks `banned` only at sign-in (`admin-D-OMdNIc.mjs:98-118`), NOT on subsequent cached-session requests. So a banned user whose cache revocation failed can still drive `/api/auth/organization/*` mutating endpoints. This adds a `hooks.before` re-check on the sensitive sub-paths.

- [ ] **Step 1: Write the failing test for the path predicate**

Create `server/utils/authBanGuard.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { shouldBanGuardPath } from "./authBanGuard";

describe("shouldBanGuardPath", () => {
    it("guards organization mutating endpoints", () => {
        expect(shouldBanGuardPath("/organization/create-invitation")).toBe(true);
        expect(shouldBanGuardPath("/organization/update-member-role")).toBe(true);
        expect(shouldBanGuardPath("/organization/set-active")).toBe(true);
    });
    it("guards admin endpoints", () => {
        expect(shouldBanGuardPath("/admin/impersonate-user")).toBe(true);
    });
    it("does NOT guard sign-out or session reads (avoid locking a user out of logging out)", () => {
        expect(shouldBanGuardPath("/sign-out")).toBe(false);
        expect(shouldBanGuardPath("/get-session")).toBe(false);
    });
    it("does NOT guard unauthenticated paths (no session yet)", () => {
        expect(shouldBanGuardPath("/sign-in/email")).toBe(false);
        expect(shouldBanGuardPath("/request-password-reset")).toBe(false);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test authBanGuard`
Expected: FAIL — "Failed to resolve import ./authBanGuard" / `shouldBanGuardPath is not a function`.

- [ ] **Step 3: Implement the predicate**

Create `server/utils/authBanGuard.ts`:
```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test authBanGuard`
Expected: PASS (all 4 cases).

- [ ] **Step 5: Wire the before-hook into Better Auth config**

In `server/utils/auth.ts`, the `hooks` object currently has only `after` (line 267). Add a `before` alongside it. First add the import at the top:
```ts
import { shouldBanGuardPath } from "./authBanGuard";
```
Then, inside `hooks: { ... }`, add before the existing `after:` key:
```ts
        hooks: {
            before: createAuthMiddleware(async (ctx) => {
                // F5: re-check ban freshness from the DB on authenticated, state-changing
                // Better Auth endpoints that the app middleware does not cover. Fail-CLOSED
                // here (unlike getAuthSession's fail-open): these are sensitive mutations and
                // are low-volume, so a transient DB error blocking them is acceptable.
                if (!shouldBanGuardPath(ctx.path)) return;
                const userId = ctx.context.session?.user?.id;
                if (!userId) return; // unauthenticated → plugin's own guard handles it
                if (await isUserBannedFresh(userId)) {
                    throw new APIError("FORBIDDEN", { message: "Account banned" });
                }
            }),
            after: createAuthMiddleware(async (ctx) => {
```
(`APIError` and `createAuthMiddleware` are already imported at `auth.ts:5`. Add the `isUserBannedFresh` import — it is already imported at `auth.ts:14`, so no new import needed for it.)

- [ ] **Step 6: Verify `ctx.context.session` is populated in the before-hook**

Read `node_modules/better-auth/dist/*.mjs` to confirm `ctx.context.session` is set before plugin endpoint handlers run for org/admin paths. If it is NOT populated at `before` time (some versions resolve the session inside the endpoint), fall back to resolving it manually:
```ts
                const session = await ctx.context.internalAdapter?.findSession?.(/* token from cookie */);
```
Run: `grep -n "context.session" node_modules/better-auth/dist/api-CkmycQ2x.mjs | head`
Expected: confirm the session is attached to `ctx.context` by `sessionMiddleware`/`orgSessionMiddleware` before the handler. If confirmation fails, prefer moving this gate to the app middleware `1.auth.ts` for `/api/auth/organization` + `/api/auth/admin` paths instead (resolve session via `getAuthSession` there), and note the change in the commit.

- [ ] **Step 7: Typecheck + full test run**

Run: `pnpm typecheck && pnpm test authBanGuard`
Expected: PASS.

- [ ] **Step 8: Manual verification (dev)**

1. Sign in as user U. 2. In another shell, ban U in the DB (`UPDATE "user" SET banned=true WHERE id='<U>';`) WITHOUT clearing the Redis session (simulating a failed revocation). 3. As U, call `POST /api/auth/organization/create-invitation`.
Expected: 403 "Account banned" (previously succeeded until TTL).

- [ ] **Step 9: Commit**

```bash
git add server/utils/authBanGuard.ts server/utils/authBanGuard.test.ts server/utils/auth.ts
git commit -m "fix(auth): fresh ban gate on /api/auth org+admin endpoints (F5)"
```

---

### Task 7: F14 — Idempotent first-org creation + no-org alarm (LOW-MED)

**Files:**
- Modify: `server/utils/auth.ts:125-177` (`databaseHooks.session.create.before`)
- Modify: `server/utils/auth.ts:104-122` (`databaseHooks.user.create.after`)

**Interfaces:**
- Consumes: `getDB()`, `schema.member`, `useServerAuth`, `deriveOrgNameFromUser`, `generateUniqueOrgSlug` (all already imported).
- Produces: at most one personal org per user under concurrent logins; a persistently org-less user is logged at `error` level for alerting.

**Background:** `findFirstOrg()` + `createOrganization` is not atomic. Two concurrent session creations both read empty and both create an org (slugs don't collide — uuidv7 suffix), yielding duplicate personal orgs. And a doubly-failed self-heal leaves `activeOrganizationId` unset with only a `console.error`.

- [ ] **Step 1: Add a re-check after acquiring, before creating (self-heal branch)**

In `session.create.before` (`auth.ts:143-163`), guard the create with a re-select to shrink the race window, and elevate the persistent-failure log. Replace the self-heal block:
```ts
                        // Self-heal: if the user has no org, create a personal one NOW.
                        if (!rows[0]) {
                            try {
                                const users = await db
                                    .select({ name: schema.user.name, email: schema.user.email })
                                    .from(schema.user)
                                    .where(eq(schema.user.id, session.userId))
                                    .limit(1);
                                const u = users[0];
                                if (u) {
                                    const name = deriveOrgNameFromUser({ name: u.name, email: u.email });
                                    const slug = generateUniqueOrgSlug(name);
                                    await useServerAuth().api.createOrganization({
                                        body: { name, slug, userId: session.userId },
                                    });
                                    // F14: re-select AFTER create. Under a concurrent login the
                                    // other request may have created the org first; re-reading here
                                    // means we adopt whichever committed first as the active org and
                                    // avoids acting on a stale empty read. (Does not fully prevent a
                                    // duplicate insert under true concurrency — that needs a DB unique
                                    // constraint on (member.userId, personal-org) or an advisory lock;
                                    // tracked as a follow-up, see Step 3.)
                                    rows = await findFirstOrg();
                                }
                            } catch (err) {
                                console.error(`[session→org self-heal] createOrganization failed for user ${session.userId}:`, err);
                                rows = await findFirstOrg(); // a concurrent creator may have succeeded
                            }
                        }
```

- [ ] **Step 2: Elevate the no-active-org outcome to a monitored error**

Replace the silent early-return at `auth.ts:165-168`:
```ts
                        const activeOrganizationId = rows[0]?.organizationId;
                        if (!activeOrganizationId) {
                            // F14: "every user has an org" invariant violated after self-heal.
                            // This is an anomaly worth alerting on, not a silent pass — Sentry
                            // will capture the error-level log.
                            console.error(`[session→org] user ${session.userId} has NO active org after self-heal — invariant violated`);
                            return; // no override; app tolerates a null active org via RBAC 403
                        }
```

- [ ] **Step 3: Add a follow-up note for the true-concurrency fix**

Add a `TODO` comment above `findFirstOrg` (`auth.ts:130`) documenting the remaining gap:
```ts
                        // TODO(F14): true concurrency (two logins racing) can still double-insert
                        // a personal org (slugs differ by uuidv7 suffix, so the UNIQUE(slug) does
                        // not catch it). A durable fix is a partial unique index guaranteeing one
                        // personal org per user, or a pg advisory lock keyed on userId. Deferred:
                        // needs a migration; the re-select above bounds the common case.
                        const findFirstOrg = async () =>
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/auth.ts
git commit -m "fix(auth): shrink org self-heal race + alert on missing active org (F14)"
```

---

### Task 8: F10 + F13 — Await admin guard + safe signup redirect (LOW)

**Files:**
- Modify: `server/api/admin/cleanup-files.post.ts:13`
- Modify: `app/pages/signup.vue:79` and `:117`

**Interfaces:**
- Consumes (signup): reuse the same same-origin regex as `login.vue`'s `safeRedirect()`.
- Produces: `cleanup-files` route-level guard now enforced; signup `callbackURL` sanitized.

- [ ] **Step 1: Add the missing `await` (F10)**

In `server/api/admin/cleanup-files.post.ts`, change line 13:
```ts
  await requireAdminApiKey(event)
```

- [ ] **Step 2: Add a `safeRedirect` helper to signup.vue (F13)**

In `app/pages/signup.vue`, near the top of `<script setup>` (after `route` is available), add — mirroring `login.vue:28-32`:
```ts
// Post-signup redirect ONLY if same-origin relative (single leading '/'):
// blocks open-redirect '//evil.com' / 'https://…'. Backstopped by Better Auth's
// originCheck server-side, kept here for consistency (F13).
function safeRedirect(): string {
    const raw = route.query.redirect
    const path = typeof raw === 'string' ? raw : ''
    return /^\/(?!\/)/.test(path) ? path : '/dashboard'
}
```

- [ ] **Step 3: Use the helper in both callbackURL sites**

`app/pages/signup.vue:79`:
```ts
            callbackURL: safeRedirect()
```
`app/pages/signup.vue:117`:
```ts
            callbackURL: safeRedirect()
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/api/admin/cleanup-files.post.ts app/pages/signup.vue
git commit -m "fix(auth): await admin key guard on cleanup-files + sanitize signup redirect (F10,F13)"
```

---

### Task 9: F16 — Share in-flight fetchSession promise (LOW / INFO)

**Files:**
- Modify: `app/composables/useAuth.ts:40-80`

**Interfaces:**
- Consumes: nothing.
- Produces: concurrent `fetchSession()` callers await the same in-flight fetch instead of returning `undefined` against a stale session.

- [ ] **Step 1: Store and return the in-flight promise**

In `app/composables/useAuth.ts`, replace the early-return guard (`:45-47`) with a shared-promise pattern. Add a module/composable-scoped ref for the pending promise and return it:
```ts
    const sessionFetching = import.meta.server
        ? ref(false)
        : useState("auth:sessionFetching", () => false);
    const pending = import.meta.server
        ? ref<Promise<unknown> | null>(null)
        : useState<Promise<unknown> | null>("auth:sessionPending", () => null);

    const fetchSession = async () => {
        // F16: if a fetch is already in flight, await IT instead of returning undefined
        // against a possibly-stale session (e.g. concurrent $sessionSignal listener).
        if (sessionFetching.value && pending.value) {
            return pending.value;
        }
        sessionFetching.value = true;
        const run = (async () => {
            const { data } = await client.getSession();
            session.value = data?.session || null;

            const userDefaults = {
                image: null as string | null,
                phone: null as string | null,
                bio: null as string | null,
                role: null as string | null,
                banReason: null as string | null,
                banned: null as boolean | null,
                banExpires: null as Date | null,
                creemCustomerId: null as string | null,
                hadTrial: null as boolean | null,
                locale: null as string | null,
                timezone: null as string | null,
                twoFactorEnabled: null as boolean | null,
                tosAcceptedAt: null as Date | null,
            };
            if (data?.user) {
                user.value = {
                    ...userDefaults,
                    ...data.user,
                    banned: data.user.banned ?? null,
                    twoFactorEnabled: data.user.twoFactorEnabled ?? null,
                };
            } else {
                user.value = null;
            }
            return data;
        })();
        pending.value = run;
        try {
            return await run;
        } finally {
            sessionFetching.value = false;
            pending.value = null;
        }
    };
```
(This preserves the exact `userDefaults` normalization from the current code — do not drop any field.)

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Manual smoke test (dev)**

Load the app, navigate between a guest-only and a protected page rapidly.
Expected: no auth flicker/redirect loop; session resolves consistently.

- [ ] **Step 4: Commit**

```bash
git add app/composables/useAuth.ts
git commit -m "fix(auth): share in-flight fetchSession promise to avoid stale reads (F16)"
```

---

### Task 10: F2 + F8 + F12 + F15 — Document decisions and scoped follow-ups

Not every finding is a code change today. This task records the intentional decisions so nothing is silently dropped.

**Files:**
- Modify: `docs/superpowers/specs/2026-07-11-better-auth-review-design.md` (append a "Deferred / documented" section)
- Modify: `server/utils/auth.ts` (a `// SECURITY:` comment at the `twoFactor`/`admin` config for F2/F8 pointers)

- [ ] **Step 1: F2 — leave a pointer comment at the twoFactor config**

In `server/utils/auth.ts` at the `twoFactor(...)` plugin (line ~422), add:
```ts
            // SECURITY (F2): the twoFactor challenge hook matches only /sign-in/{email,
            // username,phone-number} (two-factor-BDQvVILL.mjs:872), NOT the OAuth callback
            // or verification paths. Auto-linking is disabled (F1), which removes the
            // linked-2FA-account bypass precondition TODAY. If /link-social is ever exposed
            // from settings, add a 2FA step-up on the OAuth-callback path before re-enabling.
            twoFactor({
```

- [ ] **Step 2: F8 — decide + comment the admin control plane**

In `server/utils/auth.ts` at the `admin()` plugin (line 362), add a comment recording the decision. Default recommendation: keep role-based access but scope it explicitly.
```ts
            // SECURITY (F8): the admin() plugin mounts impersonate/set-role/ban under
            // /api/auth/admin/* (role-gated: adminRoles=["admin"], admin-D-OMdNIc.mjs:75),
            // a SEPARATE control plane from the API-key-gated /api/admin routes. role="admin"
            // is input:false at signup (not self-escalatable). Access requires a web-login
            // by an admin-role user. If admins are DB-only and never web-authenticate, this
            // surface is inert; otherwise restrict via adminUserIds allowlist + step-up.
            admin(),
```
> If the team confirms admins DO web-authenticate, open a follow-up to pass `admin({ adminUserIds: [...] })` or disable unused admin endpoints. Record the confirmation in the spec (Step 4).

- [ ] **Step 3: F12 — accept enumeration as documented tradeoff**

No code change. Recorded in Step 4.

- [ ] **Step 4: Append the deferred section to the spec**

Add to `docs/superpowers/specs/2026-07-11-better-auth-review-design.md`:
```markdown
## 6. Deferred / documented (not fixed in code)

- **F2 (2FA-OAuth bypass):** precondition removed by F1 (auto-linking disabled). Pointer comment left at the twoFactor config. Re-add a 2FA step-up on the OAuth callback IF `/link-social` is ever exposed. Tracked, not urgent.
- **F8 (admin control plane):** role-based `/api/auth/admin/*` accepted as a separate control plane from `/api/admin`. Documented at the config. Follow-up only if admins web-authenticate → then `adminUserIds` allowlist.
- **F12 (signup/login enumeration):** accepted UX tradeoff, rate-limited. No change.
- **F15 (no /reset-password page):** the reset flow has no consumer UI — the "forgot password" link points to `/`. This is a FEATURE GAP, tracked separately from this security plan. Build `/reset-password/[token]` + fix `login.vue:162` in a product task.
```

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm typecheck`
Expected: PASS.
```bash
git add server/utils/auth.ts docs/superpowers/specs/2026-07-11-better-auth-review-design.md
git commit -m "docs(auth): record F2/F8/F12/F15 decisions and deferred follow-ups"
```

---

### Task 11: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `pnpm typecheck`
Expected: PASS, no errors.

- [ ] **Step 2: Full test suite**

Run: `pnpm test`
Expected: PASS — existing suite (including `banStatus`, `creem`, service tests) plus the new `authBanGuard` test. No regressions.

- [ ] **Step 3: Build (catches config-shape errors the dev server tolerates)**

Run: `pnpm build`
Expected: build succeeds (the pre-existing `sharp-wasm32` warning is acceptable per CLAUDE.md Known Issues).

- [ ] **Step 4: Confirm the finding coverage**

Cross-check each finding F1-F16 against a committed task. Expected mapping:
- F1→T1, F3→T2, F4→T3, F6/F7/F11→T4, F9→T5, F5→T6, F14→T7, F10/F13→T8, F16→T9, F2/F8/F12/F15→T10.
All 16 accounted for.

- [ ] **Step 5: Final commit (if any verification-driven tweaks were needed)**

```bash
git add -A
git commit -m "chore(auth): verification pass for Better Auth review fixes" || echo "nothing to commit"
```

---

## Self-review (completed by plan author)

**Spec coverage:** All 16 findings map to a task (see Task 11 Step 4). Product decision (Option A) is baked into Task 1.

**Placeholder scan:** No TBD/TODO-as-work. The two `TODO(F14)` / follow-up notes are *intentional deferred-work markers with full context*, not missing plan content. F8/F2 are documented decisions, not hand-waves.

**Type consistency:** `shouldBanGuardPath` used consistently in Task 6 (test + impl + wiring). `safeRedirect` in Task 8 matches `login.vue`'s existing signature. `fetchSession` in Task 9 preserves the exact `userDefaults` shape from the current composable.

**Risk note carried into execution:** Task 6 Step 6 has a verification branch — if `ctx.context.session` is not populated at Better Auth `before`-hook time, the gate moves to `1.auth.ts`. This is the one task with runtime uncertainty; it is called out explicitly rather than assumed.
