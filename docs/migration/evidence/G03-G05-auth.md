# Gates G03–G05 Evidence — Better Auth credentials on Convex

**Date:** 2026-09-18
**Deployment:** team `airowl` → project `ceremly-staging` → dev deployment `wary-spaniel-466` (eu-west-1)
**Command:** `pnpm test:gate:g03-g05` (seeds fixtures → encrypted export → import → live sign-in)

| Gate | Requirement (plan Task 4, Step 5) | Status |
| --- | --- | --- |
| G03 | login email/password con la password originale | **PASS** |
| G04 | login Google e account linking senza duplicare l'utente | **NOT_RUN** (mechanism evidenced, OAuth round trip blocked) |
| G05 | login 2FA con authenticator esistente, consumo backup code, recovery controllato | **PASS** |

PASS is *mechanism* evidence on staging with synthetic accounts, not the human sign-off: the plan's
Step 5 asks for a minimized **encrypted copy of real credentials**. That copy was not available in
this environment, so the same pipeline was run end-to-end on fixture rows that the legacy schema
produces (see "Why synthetic fixtures are faithful"). `Approved by` stays `—`; the signature
belongs to GO/NO-GO (Tasks 17–18).

## Gate cases (live, staging)

Result: **1 file passed, 6 tests passed, 0 skipped** (~11.3 s).

| # | Case | Test | Result |
| --- | --- | --- | --- |
| 1 | import accounting + replay writes nothing | `accounts for every record once and never writes on a replay` | PASS |
| 2 | password sign-in with the imported hash | `G03: the imported password hash authenticates with the original password` | PASS |
| 3 | negative control (wrong password → 401, no cookie) | same test | PASS |
| 4 | logout invalidates the session, second login works | same test | PASS |
| 5 | Better Auth JWT accepted as a Convex identity | `issues a Convex JWT accepted as an identity by the deployment` | PASS |
| 6 | Google account row preserved and linked to the same user | `G04: the Google account row survives…` | PASS |
| 7 | TOTP validates an independently computed code | `G05: the imported TOTP secret validates…` | PASS |
| 8 | backup code consumed once, replay rejected, other codes usable | `G05: a backup code is consumed exactly once…` | PASS |

Case 5 closes the loop with Task 3: `GET /api/auth/convex/token` returns an RS256 JWT whose
`iss` is the deployment's `CONVEX_SITE_URL` and whose `aud` is `convex`; `health:whoami` on the
`.convex.cloud` API returns that identity, so the Convex client's `setAuth` path is now backed by
real sessions instead of the G02 gate key.

### G04 — what is evidenced, and what is not

Evidenced live: after signing in with the imported password, `/api/auth/list-accounts` returns the
`credential` **and** `google` rows with the same `userId` — the imported social identity is attached
to the imported account, not to a duplicate user created for the same email.

Not evidenced: the Google OAuth round trip itself (`callback/google`, profile fetch, account
linking on an existing email). It needs a real Google consent screen and a Google client whose
redirect URI points at the staging origin; neither exists yet. G04 stays `NOT_RUN` until the
minimized production copy and a staging Google client are available. It is **not** `FAIL`: no
evidence contradicts it, the requirement simply has not been executed.

### Why synthetic fixtures are faithful

The fixtures are not hand-written credential look-alikes; every sensitive value is produced by the
same code the legacy deployment uses (`better-auth/crypto` 1.6.15):

| Value | How the fixture produces it |
| --- | --- |
| password hash | `hashPassword(plaintext)` — same scrypt hasher as the legacy sign-up |
| TOTP secret | `symmetricEncrypt({ key: BETTER_AUTH_SECRET, data: rawSecret })` |
| backup codes | `symmetricEncrypt({ key: BETTER_AUTH_SECRET, data: JSON.stringify(codes) })` |

The only synthetic part is *which account* holds them (`@gate.ceremly.dev`, dev Neon branch).
The TOTP code that validates on the deployment is computed by `test/migration/totp.ts`, i.e. a
plain RFC 6238 implementation that never imports Better Auth: a corrupted or re-encoded secret
fails the check.

## Measured constraints (findings, not assumptions)

These are the facts that shaped Task 4; each one was observed against the real packages.

1. **The Better Auth component schema is fixed.** `@convex-dev/better-auth` 0.12.5 ships
   `user`/`session`/`account`/`verification`/`twoFactor` tables whose fields are validated by
   `adapter.create` (`data: v.object(<table fields>)`). The `user` table has no `role`/`banned`
   columns and accepts no custom fields, so:
   - the `admin` plugin is **not** enabled (`better-auth` issue #7635 documents the same wall);
   - `user.additionalFields` (`locale`, `tosAcceptedAt`, `phone`, `bio`, `timezone`) is **not** used;
   - those columns become application-domain data (`appUsers` in Task 5, profile fields in
     Tasks 10/12). The import reports them in `deferredProfileFields` so the loss is never silent,
     and the export keeps them in the source batch until those tables consume them.
2. **Better Auth always looks users up lowercased** (`internal-adapter.mjs` →
   `findUserByEmail(email.toLowerCase())`, and sign-up lowercases before insert). Importing a
   mixed-case legacy address unchanged would create a user nobody can sign in as, so the import
   normalizes emails and counts them (`normalizedEmails`).
3. **`userId` is not carried over.** The component generates `_id`; the adapter maps
   `_id ↔ id` (`disableIdGeneration: true`), so Better Auth ids change during migration. The import
   resolves the legacy user id → new id inside the batch through the natural keys (`email`,
   `(providerId, accountId)`, `userId`), which is also what makes it idempotent.
4. **`BETTER_AUTH_SECRET` must not rotate during the migration.** With a single `secret` (no
   `secrets` array) better-auth sets `secretConfig` to that string, and the two-factor plugin
   encrypts both the TOTP secret and the backup codes with it
   (`symmetricEncrypt` → `xchacha20poly1305(sha256(secret))`, bare hex, no `$ba$` envelope).
   A deployment with a different secret cannot decrypt imported 2FA data. The same applies to
   any other symmetric payload (session cookies) that survives the cutover.
5. **`storeBackupCodes` defaults to `"encrypted"`** in 1.6.15: backup codes are *not* plaintext
   JSON in the legacy column, and a fixture/export that writes plaintext makes
   `verify-backup-code` fail with a hex decode error (`500`). Plaintext JSON is only valid when
   the legacy deployment explicitly configured `storeBackupCodes: "plain"`.
6. **Origin header is mandatory end-to-end.** Better Auth validates `Origin` against
   `trustedOrigins` whenever a cookie is present (and for the 2FA endpoints), so the Nuxt proxy
   must forward the browser's `Origin` verbatim. A request missing it gets
   `MISSING_OR_NULL_ORIGIN`, a wrong one `INVALID_ORIGIN` (both 403).
7. **`registerRoutesLazy` ignores its `trustedOrigins` option when `cors: false`.** With the
   non-CORS path the only trusted origins are the ones on the auth options, so `createAuth` sets
   `baseURL: SITE_URL` (which is what the proxy serves) and the deployment env `SITE_URL` must
   match the Nuxt origin.
8. **The gate-only JWT provider needed its own application ID.** The Better Auth Convex plugin
   throws on load if more than one provider claims `applicationID: "convex"`, so the G02 provider
   moved to `"gate"`; `test/migration/gate-jwt.ts` reads the same constant, and the G02 suite was
   re-run to prove the change is inert (7/7 PASS).
9. **Internal mutations need an explicit key.** `assertMigrationKey` refuses when
   `MIGRATION_API_KEY` is unset on the deployment and compares in constant time, so opening
   `internal.migrations.*` from a shell does not lower the bar.
10. **`Uint8Array` is no longer a `BodyInit`.** TypeScript 5.7+ types `Uint8Array<ArrayBufferLike>`
    as unassignable to `fetch`'s `BodyInit`, so the proxy takes a copy on a plain `ArrayBuffer`.

## Files

Created:
- `convex/auth.ts` — `authComponent`, `createAuth` (email/password, Google, account linking,
  change-email, 2FA, scheduled auth emails), `getAuthUser` from `clientApi()`
- `convex/http.ts` — `registerRoutesLazy(http, createAuth, { basePath: "/api/auth", cors: false })`
- `convex/email.ts` — minimal Resend action for the auth callbacks (Task 13 replaces it with the
  React Email templates + durable job queue)
- `convex/lib/env.ts` — fail-loud deployment env access
- `convex/lib/migrationKey.ts` — constant-time `assertMigrationKey`
- `convex/migrations/authImport.ts` — `importAuthRecordsIdempotently` (pure) + `createAdapterBridge`
  + `internal.migrations.authImport.importBatch`
- `server/utils/authProxy.ts` — same-origin proxy core (`resolveConvexSiteUrl`, `proxyAuthRequest`)
- `app/lib/auth-client.ts` — shared auth client factory + `createConvexTokenFetcher`
- `scripts/migration/{crypto,auth-fixtures,seed-auth-fixture,export-auth}.ts`
- `test/migration/auth-import.test.ts` (10), `auth-proxy.test.ts` (8), `auth-client.test.ts` (6),
  `g03-g05-live.test.ts` (6), `test/migration/totp.ts`

Modified:
- `convex/convex.config.ts` — `betterAuth` + `creem` components installed
- `convex/auth.config.ts` — Better Auth provider via `getAuthConfigProvider`; gate provider on
  `applicationID: "gate"`
- `server/api/auth/[...all].ts` — `NUXT_AUTH_BACKEND` switch; `convex` proxies to the site URL
  (method, path, query, binary body, headers, status, body, every `Set-Cookie` as a list,
  `redirect: "manual"`)
- `app/composables/useAuth.ts` — uses the shared client factory
- `server/utils/runtimeConfig.ts` — `authBackend` (`legacy` default)
- `.env.example`, `.gitignore` (`.gate/` holds gate keys and encrypted batches), `package.json`
  (`test:gate:g03-g05`)

## Verified alongside

- `pnpm test:gate:g03-g05` → 6 passed (live, staging)
- `pnpm test:gate:g02` → 7 passed (re-run after the auth-config change: no regression)
- `pnpm test:migration` → 6 files passed / 3 skipped, 27 tests passed / 13 skipped (gates unarmed)
- `pnpm typecheck:convex` → clean
- `npx eslint convex server/api/auth server/utils/authProxy.ts test/migration scripts/migration app/lib app/composables/useAuth.ts`
  → 0 errors (2 warnings from generated files)
- `pnpm typecheck` → 21 errors in 9 files, all pre-existing and outside this work
  (`app/pages/login.vue`, `app/pages/signup.vue`, `server/services/{checkout,eventReconcile,gdpr,user}.service.ts`,
  `server/api/admin/users/[id].patch.ts`, `server/utils/{auth,permissions}.ts`)

## Staging leftovers to purge at the rehearsal

- `convex env` on `wary-spaniel-466`: `SITE_URL`, `BETTER_AUTH_SECRET` (same value as the legacy
  dev secret, required by finding 4), `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (dev client),
  `APP_NAME`, `EMAIL_FROM`, `RESEND_API_KEY` set to a placeholder — auth emails fail loudly on
  staging until Task 13 wires Resend properly.
- Imported fixtures: three `@gate.ceremly.dev` users plus two superseded 2FA rows (the pre-fix G05
  fixture stored plaintext backup codes; the idempotent import correctly refused to overwrite it,
  so the corrected payload shipped under `gate-two-factor-v2@`). Task 16's rehearsal reset removes
  them.

## Gate status

| Gate | Status | Evidence |
| --- | --- | --- |
| G01 | PASS | `docs/migration/evidence/G01-cloudflare.md` |
| G02 | PASS | `docs/migration/evidence/G02-convex-vue.md` |
| **G03** | **PASS** | **This document** |
| G04 | NOT_RUN | This document — OAuth round trip blocked |
| **G05** | **PASS** | **This document** |
| G06–G10 | NOT_RUN | — |

Next authorized work: **Task 5** (G06: application organizations and RBAC), which consumes finding 1
(`appUsers` owns `globalRole`/`locale`/`activeOrganizationId`) and finding 3 (the import already
maps legacy ids through natural keys).
