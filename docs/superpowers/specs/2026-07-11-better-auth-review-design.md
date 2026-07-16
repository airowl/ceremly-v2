# Better Auth — Code Review & Fix Design

**Date:** 2026-07-11
**Scope:** Full-stack Better Auth 1.4.5 integration in ceremly-v2 (server config, middleware, RBAC, client, sensitive flows).
**Method:** 4 parallel review agents (config, middleware/RBAC, client, flows) + manual verification of every finding against the installed `node_modules/better-auth/dist/*` source. Advisor triage pass on severity and fix direction.
**Out of scope (already reviewed separately):** Creem billing plugin, Upstash rate-limit implementation (fixes `b47c91d`/`f10b53a` — verified not regressed), QStash queue.

---

## 1. Executive summary

The Better Auth integration is **architecturally sound**. The most-feared class of bug — horizontal privilege escalation via an attacker-supplied organization id — is **not exploitable**: the active org is server-set in the `session.create.before` hook and re-verified against the `member` table on every RBAC guard call. Invite-hijack and 2FA-backup-code handling are **safe** (Better Auth defaults enforce auth + email-match + expiry; TOTP secret and backup codes are encrypted at rest).

The real issues cluster around **OAuth account-linking trust** (one HIGH), **session/token lifecycle** on password-reset and email-verification (two MEDIUM), **audit correctness**, and a few **defense-in-depth / hardening** gaps.

**Verified false positives / down-scoped during review:**
- "ToS acceptance never persisted" (client agent) — **false**: `tosAcceptedAt` is set server-side for every user in `databaseHooks.user.create.before` (`auth.ts:96-103`). The real residual is that the *audit event* never fires (see C6), not lost data.
- "Signup open-redirect is a live phishing vector" (client agent) — **down-scoped to LOW**: Better Auth's `originCheckMiddleware` (`api-CkmycQ2x.mjs:156`) rejects an external or protocol-relative `callbackURL` against `trustedOrigins` (prod = baseURL only) and explicitly blocks `//`, `\`, `%2f`, `%5c`. No live off-site redirect; the fix is defense-in-depth/consistency only.
- "trustedProviders: ['google'] fixes the linking bug" (config agent) — **rejected**: it does NOT fix the pre-hijacking attack (which uses a *verified* Google email) and would make linking strictly more permissive (auto-linking unverified provider emails). See F1 fix design.

---

## 2. Findings inventory

Severity legend: **HIGH** = exploitable account takeover under realistic preconditions; **MEDIUM** = real security weakness with bounded preconditions or requiring a prior compromise; **LOW** = defense-in-depth / hardening / compliance; **INFO** = correctness or non-functional, no direct security impact.

| ID | Severity | Area | File:Line | Defect |
|----|----------|------|-----------|--------|
| F1 | **HIGH** | OAuth linking | `auth.ts:262-266` | Account pre-hijacking: OAuth auto-link adopts a pre-existing **unverified** local credential row and flips it to verified |
| F2 | **MEDIUM** | OAuth / 2FA | `auth.ts:422-425` + `262-266` | 2FA is never enforced on the Google sign-in path (challenge matcher scoped to `/sign-in/{email,username,phone-number}` only) |
| F3 | **MEDIUM** | Session lifecycle | `auth.ts:201-222` | Existing sessions are NOT revoked after a password reset (`revokeSessionsOnPasswordReset` unset) |
| F4 | **MEDIUM** | Token lifecycle | `auth.ts:223-255` | `autoSignInAfterVerification: true` + stateless replayable JWT verification token → a leaked verification link = repeated account access until expiry (~1h) |
| F5 | **MEDIUM** | Ban enforcement | `1.auth.ts:16` + `auth.ts:465-473` | Fresh DB ban re-check does not run on `/api/auth/*`, so a banned user with a failed cache-revocation can still drive `/api/auth/organization/*` mutating endpoints until session TTL |
| F6 | **MEDIUM** | Audit correctness | `auth.ts:272,287` | Password-reset audit action never fires — mapped to non-existent path `/forget-password`; real endpoint is `/request-password-reset` |
| F7 | LOW-MED | Audit correctness | `auth.ts:330,343` | Under `requireEmailVerification`, `/sign-up/email` returns no session → `auth.signed_up` logged with null userId and `auth.tos_accepted` never fires |
| F8 | LOW-MED | Admin control plane | `1.auth.ts:9,16` vs `auth.ts:362` | Better Auth `admin()` endpoints under `/api/auth/admin/*` (impersonate, set-role, ban) bypass the app's admin-API-key middleware; role-only gated |
| F9 | LOW | Change-email | `auth.ts:72-90` | No password/step-up re-auth on `/change-email`; distinct `422` on an already-registered target enables account enumeration |
| F10 | LOW | Defense-in-depth | `cleanup-files.post.ts:13` | `requireAdminApiKey(event)` called without `await` — route-level guard is a no-op; only the middleware saves it |
| F11 | LOW | Audit robustness | `auth.ts:291` | `ctx.body.email` unguarded → malformed POST can throw in the audit after-hook; attacker-controlled `targetId` allows audit-log spoofing |
| F12 | LOW | Enumeration | `signup.vue:122`, `login.vue:80` | Signup "email already exists" and login "email not verified" reveal account existence (library defaults, rate-limited) |
| F13 | LOW | Consistency / DiD | `signup.vue:79,117` | Signup `callbackURL` uses raw `route.query.redirect` instead of the `safeRedirect()` used in login/callback (server-side origin check backstops it) |
| F14 | LOW | Org invariant | `auth.ts:104-175` | Concurrent logins for an org-less user can create duplicate personal orgs; a doubly-failed self-heal can leave a user with no active org (swallowed error) |
| F15 | INFO | Non-functional | `login.vue:162` | "Forgot password" links to `/`; no `/reset-password/[token]` page exists → reset flow has no consumer UI |
| F16 | INFO | Guard concurrency | `useAuth.ts:45-47` | `fetchSession` early-returns without awaiting an in-flight fetch → a concurrent guard call can decide on a stale session (no data exposure; server re-checks) |

**Confirmed clean (no action):** RBAC org-scoping (`permissions.ts`, `memberRepository.ts` — every query filters by `organizationId` + `userId`); `requireAdminApiKey` constant-time compare + fail-closed on missing key; `banStatus.isBanActive` expiry logic; `getAuthSession` fail-open is bounded (DB-error only, not forceable per-request); invite accept (auth + email-match + expiry + server-stored role); 2FA enable/disable password gate + encrypted secret/backup-codes + no trust-device skip; secret/openAPI prod exclusion; uuidv7 not used for session/reset/verification tokens; SSR session isolation via per-request `useState`.

---

## 3. Fix design (by cluster)

### Cluster 1 — OAuth / account-linking trust (F1, F2) — **highest priority**

**Root cause (shared).** `account.accountLinking.enabled: true` (`auth.ts:262-266`) with no gating on the *pre-existing local* account, combined with a 2FA challenge hook (`two-factor-BDQvVILL.mjs:871-872`) scoped only to the email/username/phone sign-in paths. Both defects require a same-email account that has both a password credential and a Google identity.

**Why `trustedProviders` is the wrong fix.** The linking guard is:
```
(!trustedProviders?.includes(provider) && !userInfo.emailVerified) || enabled === false
```
Pre-hijacking uses the victim's *verified* Google email, so `!userInfo.emailVerified` is already `false` and linking already proceeds — `trustedProviders` changes nothing for the attack, and adding `google` would *disable* the `!emailVerified` check, auto-linking unverified provider emails too (strictly worse).

**Product decision — RESOLVED: Option A** (no same-email dual credentials; see §5). The fixes below follow Option A.

**F1 fix (Option A):** disable `account.accountLinking.enabled` (`auth.ts:262-266`). Google and email/password become distinct sign-in methods. Pre-implementation check: confirm no existing production users rely on an already-linked account (query `account` for users with both a `credential` and a `google` provider row on the same email); if any exist, plan a migration/communication step. If `/link-social` is later exposed from settings, it must require an authenticated session.

> *(Rejected Option B, for the record: keep linking but reject/purge unverified local credential rows before OAuth link + add the F2 step-up. More surface area; not chosen.)*

**F2 fix (needed under Option B, and any time `/link-social` might be exposed later):** enforce a 2FA step-up on the OAuth-callback and verification paths when `user.twoFactorEnabled` — do not let a session be minted on a path the twoFactor matcher does not cover. Implement as an `after` hook on the callback path that withholds the session and returns the 2FA challenge, mirroring the plugin's own `/sign-in/email` handler.

> **Do not collapse F1 and F2 into a single fix.** Disabling auto-linking removes F2's *precondition today*, but F2 must still be fixed independently if account linking is ever re-enabled from settings.

### Cluster 2 — session & token lifecycle (F3, F4)

- **F3:** add `revokeSessionsOnPasswordReset: true` to the `emailAndPassword` block (`auth.ts:201`). A user resetting a password after suspected compromise must not leave the attacker's session alive.
- **F4:** set `autoSignInAfterVerification: false` (`auth.ts:225`). The verification token is a stateless HS256 JWT with no single-use DB record, so it is replayable until expiry; removing auto-sign-in means a leaked link no longer grants a session (user must log in explicitly). If auto-sign-in is a hard UX requirement, the alternative is to shorten `emailVerification.expiresIn` and accept the residual — but `false` is the clean fix.

### Cluster 3 — `/api/auth/*` escapes app controls (F5, F8)

These share a root: Better Auth's own endpoints under `/api/auth/*` are excluded from the app's middleware control plane (session injection, fresh-ban re-check, admin-API-key).
- **F5:** enforce a banned-user rejection inside the Better Auth request path — a `session`/request `before` hook that runs `isUserBannedFresh` (or Better Auth's `banned`-aware validation) and rejects, so `/api/auth/organization/*` mutating endpoints are covered like the app routes are.
- **F8:** make an explicit decision on the `admin()` plugin's `/api/auth/admin/*` endpoints (impersonate/set-role/ban): either restrict them (`adminUserIds` allowlist + step-up), disable the ones the app does not use, or accept role-based access and **document** that `/api/auth/admin/*` is a separate control plane from the API-key-gated `/api/admin`. Precondition for exploit is a `role:"admin"` web-login; if admin is DB-only and never web-authenticates, F8 is informational — confirm before prioritizing.

### Cluster 4 — audit correctness (F6, F7, F11)

- **F6:** change the `AUTH_PATH_MAP` key and the else-if array entry from `/forget-password` / `forget-password` to `/request-password-reset` (`auth.ts:272,287`).
- **F7:** in the `/sign-up/email` audit branch, resolve the user id from the created user / `ctx.body.email` rather than `ctx.context.newSession` (which is undefined under `requireEmailVerification`), so `auth.signed_up` and `auth.tos_accepted` attribute correctly.
- **F11:** guard `ctx.body?.email`; label `targetId` values sourced from unauthenticated request bodies as untrusted.

### Cluster 5 — enumeration (F9, F12)

- **F9:** add a `/change-email` rate-limit rule to `rateLimit.customRules` (`auth.ts:191`). The distinct `422` originates in the library; rate-limiting bounds enumeration.
- **F12:** accept as a documented UX tradeoff, or add generic responses for signup-existing / unverified-login. Rate-limited today. Lowest priority.

### Cluster 6 — hardening / defense-in-depth (F10, F13, F14)

- **F10:** add the missing `await` to `requireAdminApiKey(event)` in `cleanup-files.post.ts:13`.
- **F13:** reuse `safeRedirect()` for both signup `callbackURL` values (`signup.vue:79,117`).
- **F14:** make first-org creation idempotent (re-select-after-insert inside a transaction, or an advisory lock keyed on `userId`), and treat a persistently org-less user as a monitored alarm rather than a silent pass.

### Non-functional (F15, F16) — track separately

- **F15:** build a `/reset-password/[token]` page (or point the "forgot password" link at one). The reset feature is currently non-functional client-side. This is a **feature gap**, not a fix — flag it but it may belong outside this security plan.
- **F16:** have `fetchSession` return the shared in-flight promise instead of early-returning `undefined`. Low-value correctness fix.

---

## 4. Recommended execution order

1. **Cluster 1 (F1/F2)** — Option A resolved (§5). F1 (disable auto-linking) first — highest severity; F2 (2FA step-up) tracked as a lower-urgency follow-up since Option A removes its precondition today.
2. **Cluster 2 (F3/F4)** — two-line config changes closing real session/token windows.
3. **Cluster 3 (F5)** — ban-enforcement gap on `/api/auth/*`. F8 pending the admin-login confirmation.
4. **Cluster 4 (F6/F7/F11)** — audit correctness; low risk, improves incident response.
5. **Cluster 6 (F10/F13/F14)** — hardening.
6. **Cluster 5 (F9/F12)** and non-functional (F15/F16) — lowest priority / separate track.

## 5. Product decision — RESOLVED (2026-07-11)

**F1/F2 (Cluster 1): Option A chosen.** No same-email dual credentials — OAuth auto-linking of pre-existing accounts is disabled. Google and email/password are distinct sign-in methods keyed on a single primary credential.

Consequences for the implementation plan:
- **F1:** disable `account.accountLinking.enabled` in `auth.ts:262-266`. Verify existing users are unaffected (no already-linked accounts break); if `/link-social` is ever exposed from settings, it must require an authenticated session.
- **F2:** disabling auto-linking removes F2's precondition **today**. Still add the 2FA step-up on the OAuth-callback/verification paths (or explicitly document + track it) so re-enabling linking later cannot silently reopen the bypass. The plan keeps F2 as its own task, lower urgency than F1.

## 6. Deferred / documented (not fixed in code)

- **F2 (2FA-OAuth bypass):** precondition removed by F1 (auto-linking disabled). Pointer comment left at the twoFactor config. Re-add a 2FA step-up on the OAuth callback IF `/link-social` is ever exposed. Tracked, not urgent.
- **F8 (admin control plane):** role-based `/api/auth/admin/*` accepted as a separate control plane from `/api/admin`. Documented at the config. Follow-up only if admins web-authenticate → then `adminUserIds` allowlist.
- **F12 (signup/login enumeration):** accepted UX tradeoff, rate-limited. No change.
- **F15 (no /reset-password page):** the reset flow has no consumer UI — the "forgot password" link points to `/`. This is a FEATURE GAP, tracked separately from this security plan. Build `/reset-password/[token]` + fix `login.vue:162` in a product task.
