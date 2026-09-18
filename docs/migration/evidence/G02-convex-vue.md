# Gate G02 Evidence — Convex Vue Binding

**Date:** 2026-09-18
**Status:** PASS
**Deployment:** team `airowl` → project `ceremly-staging` → dev deployment `wary-spaniel-466` (eu-west-1)

- client URL (websocket / HTTP API): `https://wary-spaniel-466.eu-west-1.convex.cloud`
- HTTP actions URL: `https://wary-spaniel-466.eu-west-1.convex.site`
- provisioned with `npx convex dev --once --configure new --project ceremly-staging --dev-deployment cloud`;
  the CLI owns the gitignored `.env.local` (`CONVEX_DEPLOYMENT` / `CONVEX_URL` / `CONVEX_SITE_URL`),
  while `.env` carries the Nuxt-facing `NUXT_PUBLIC_CONVEX_URL` / `NUXT_PUBLIC_CONVEX_SITE_URL`.

## Gate cases (plan Task 3, Step 4)

Command: `pnpm test:gate:g02` (arms the suite with `G02_GATE=live`; URLs come from `.env`)
Result: **2 test files passed, 7 tests passed, 0 skipped** (2026-09-18 22:03, duration 5.06s)

| # | Required case | Test | Result |
| --- | --- | --- | --- |
| 1 | public query, SSR, `suspense()` | `resolves a public query through suspense() while rendering on the server` | PASS |
| 2 | SSR opt-out respected (`server: false`) | `keeps a query explicitly marked client-only out of the SSR payload` | PASS |
| 3 | typed mutation | `lands a typed mutation and re-executes the open subscription` | PASS |
| 4 | realtime after a write | same test: the open subscription re-executed with the new value without any re-query | PASS |
| 5 | authenticated CSR query | `resolves the identity of an authenticated CSR query` | PASS |
| 6 | anonymous stays anonymous | `keeps an anonymous CSR query anonymous` | PASS |
| 7 | forced token refresh | `refreshes a rejected token exactly once and keeps the query usable` | PASS |
| 8 | transient failure (session endpoint 502) | `survives a transient session failure without latching into a signed-out state` | PASS |

Cases 1–2 run in the `node` environment (no `window`), so they exercise the SSR branch
(`ConvexHttpClient`) of `convex-vue` through `@vue/server-renderer`.
Cases 3–8 run in `jsdom`, mounting a real Vue app with `installConvex(app, url, fetchToken)`
and a live websocket subscription.

## How authentication was testable before Sign-in exists

`convex/auth.config.ts` registers a `customJwt` provider (issuer `https://gate.ceremly.local`,
audience `convex`, RS256) **only when the deployment env var `GATE_AUTH_JWKS` is set**, and its
value is a data URI holding public key material only. The gate signs short-lived RS256 tokens
with a throwaway private key that lives in the local environment
(`GATE_AUTH_PRIVATE_KEY_B64` in the gitignored `.env`) and never enters the repository.

Consequences:
- no trusted provider is configured by default, so nothing is implicitly trusted;
- Task 4 appends the Better Auth provider to the same `providers` array;
- tokens are audience-checked, so a token minted for another service is rejected.

## Findings that constrain Task 4

1. **`setAuth` must be called explicitly.** `convex-vue@0.1.5` declares an `auth` option in its
   plugin signature but never wires it; `installConvex` calling `client.setAuth(fetchToken)` is
   what makes the token reach the deployment (verified by case 5).
2. **`fetchToken` must never reject.** On convex 1.45.0 the first token fetch happens eagerly
   inside `setAuth`; a rejecting token function surfaces as an *unhandled rejection* and the client
   never connects — not even for public queries. The Task 4 wrapper has to catch the error and
   return the last known token (or `null`), surfacing "retryable" to the UI instead of throwing.
3. **A rejected token triggers exactly one forced refresh.** After the deployment rejects the
   token, the client re-asks with `{ forceRefreshToken: true }` and then settles (no refresh loop):
   that callback is where Task 4 re-asks Better Auth for a fresh session token.
4. **`null` means anonymous, not signed out.** With no token, queries and mutations keep working
   and the query resolves to `null` instead of staying pending: a missing session must not be
   modelled as an error state.
5. **Transport is chosen per call.** `convex-vue` branches on `typeof window === "undefined"`
   (HTTP client for SSR, subscription client for CSR); the dashboard-side `server: false` opt-out
   returns empty data during SSR, which matches the plan's SSR/CSR split.

## Test-environment note

jsdom's `WebSocket` is a wrapper around undici's, and undici fires its `open` event with
`new Event(...)` taken from the global scope — under vitest+jsdom that global is jsdom's `Event`,
which Node's `EventTarget` rejects (`ERR_INVALID_ARG_TYPE`) and the socket never opens. The gate
pins the client to the `ws` implementation (now an explicit devDependency), the same one convex
uses for its Node client.

## Files

Created:
- `convex/auth.config.ts` — gate `customJwt` provider, disabled unless `GATE_AUTH_JWKS` is set
- `test/migration/g02-live-ssr.test.ts` — SSR cases 1–2
- `test/migration/g02-live-csr.test.ts` — CSR cases 3–8
- `test/migration/gate-jwt.ts` — RS256 token minting for the gate
- `convex/_generated/**` — codegen output required by `pnpm typecheck:convex`

Modified:
- `convex/health.ts` — added gate instrumentation on the throwaway `migrationHealth` table:
  `record` (idempotent upsert by key), `latest`, `whoami` (identity echo)
- `convex/test.setup.ts` — harness rewritten to the documented `convexTest(schema, modules)` +
  `import.meta.glob` shape (the previous `ConvexTest`/`globalThis` version failed Convex's own
  `tsc`, which blocked every push)
- `convex/tsconfig.json` — `vite/client` types for `import.meta.glob`
- `server/utils/runtimeConfig.ts` — `public.convexUrl` no longer falls back to the site URL, and
  `public.convexSiteUrl` added (HTTP actions / auth proxy)
- `.env.example` — the site URL is `*.convex.site`, not an alias of the client URL
- `vitest.config.ts` — `convex/**/*.test.ts` added to `include` so `pnpm test:migration` really
  runs the Convex suite the plan's gate commands target
- `nuxt.config.ts` — `../convex/**/*` excluded from the Nitro server TS project: `convex/` is its
  own project (target ES2022 + `vite/client` types for `import.meta.glob`) checked by
  `pnpm typecheck:convex`, while the server project includes `../**/*`
- `app/composables/useConvexResource.ts` — implementation annotated `: any` so the two public
  overloads are compatible with it (TS2394 broke `pnpm typecheck`)
- `package.json` — `test:gate:g02` script, `ws`/`@types/ws` devDependencies
- `test/migration/convex-vue-spike.test.ts` — removed the two `any` casts that broke `pnpm lint`

## Verified alongside

- `pnpm typecheck:convex` → clean (`convex codegen && tsc --noEmit -p convex/tsconfig.json`)
- `pnpm test:migration` → 3 passed, 7 skipped (gate suites stay unarmed without `G02_GATE=live`)
- `npx eslint convex test/migration` → 0 errors (2 warnings from generated files)
- `npx convex run health:ping` / `health:record` / `health:latest` against the dev deployment

`pnpm typecheck` still fails, but only on 12 errors that predate this gate and live outside it
(`app/pages/login.vue`, `app/pages/signup.vue`, `server/services/checkout.service.ts`,
`server/services/eventReconcile.service.ts`, `server/services/gdpr.service.ts`,
`server/services/user.service.ts`, `server/api/admin/users/[id].patch.ts`, `server/utils/auth.ts`,
`server/utils/permissions.ts` — mostly Better Auth/Creem typing changes introduced by the Task 1
pins). The Convex project and everything touched here is clean.

## Gate status

| Gate | Status | Evidence |
| --- | --- | --- |
| G01 | PASS | `docs/migration/evidence/G01-cloudflare.md` |
| **G02** | **PASS** | **This document** |
| G03–G10 | NOT_RUN | — |

Next authorized work: **Task 4** (G03–G05: Better Auth, same-origin proxy, credential import) —
`G02` is the last gate that had to pass first. The dev deployment is staging-only: it holds a
throwaway `migrationHealth` table and no production data.
