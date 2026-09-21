# Gate G09 Evidence — Protection matrix and rate limiting

**Date:** 2026-09-21
**Deployment:** Convex dev `airowl/ceremly-staging` → `wary-spaniel-466`; Cloudflare Worker run locally from the built bundle (`NODE_OPTIONS=--max-old-space-size=6144 pnpm build:cloudflare` → `wrangler dev --cwd .output`)
**Commands:** `pnpm test:gate:g09` (hermetic declared leg + live Worker leg + Convex legs), plus the ad-hoc live probes recorded below

| Gate | Requirement (plan Task 8) | Status |
| --- | --- | --- |
| G09 | Complete protection matrix; rate limiting enforced atomically; CSP/HSTS/size limits/bot traps observed on the Worker | **PASS** |

PASS is *mechanism* evidence: 36 gate cases plus live runs against a real Worker and
the staging deployment. `Approved by` stays `—`: the signature belongs to GO/NO-GO
(Tasks 17–18).

The full matrix — every surface, which runtime owns it, the key, and what is only
declared versus measured — is `docs/migration/protection-matrix.md`.

## Gate cases

**Hermetic — 3 files, 36 tests, no network.**

| File | Cases | What it proves |
| --- | --- | --- |
| `test/migration/security-headers.test.ts` (declared) | 8 | Nuxt config: HSTS 2 years + preload, 1 MB/5 MB ceilings, in-app limiter, method allowlist, the CSP directives, every bot trap declared, the fake headers, and that a neutralizer is relaxed on **exactly** the six documented routes — `xssValidator` only where the raw body is signature-verified elsewhere |
| `convex/lib/rateLimit.test.ts` | 14 | budget counting (N pass, N+1 refused with an exact `retryAfterMs`), one row per (bucket, digest, window), digest-only storage, key/bucket independence, window rollover, config validation, **concurrency**, prune batching, and the real `files.presignUpload`/`confirmUpload` actions reaching their buckets |
| `convex/auth.test.ts` | 3 | the auth limiter keeps the legacy thresholds (`/sign-in/email` 10/min, reset request 5/min, reset 10/min) *and* stores counters in the component database (not per-isolate memory) |

**Live — the built Worker, run locally.**

| Probe | Result |
| --- | --- |
| `GET /` (prerendered → Workers **Assets**) | 200 with HSTS `max-age=63072000; includeSubDomains; preload`, `nosniff`, `DENY`, referrer, permissions, fake `X-Powered-By: PHP/5.2.17`, fake `Server: Apache/2.2.15`, plus the build-time CSP `<meta>` |
| `/_nuxt/<entry>.js` | 200, `cache-control: public, max-age=31536000, immutable` |
| `GET /blogs` (SSR) | 200 with the CSP **header**, fake `Server`; `x-powered-by` never advertises the real stack |
| traps: `/wp-admin`, `/wp-login.php`, `/wordpress/`, `/xmlrpc.php`, `/cmd_sco`, `/.git/config` | 307 → `/` |
| trap: `/.env` | 307 → `/404` (the Nitro-level rule; two authorities, both pinned) |
| scanner UA (`curl/8.7.1`) on `/blogs` | 403 from `4.block-bots.ts` |
| `POST /api/contact` with 1.5 MB | 413 (1 MB ceiling) |
| `POST /api/file/upload` with 5 MB + 1 kB | 413 (5 MB ceiling) |
| `POST /api/webhooks/resend` (unsigned) | 401 **with** CSP and HSTS |
| `POST /api/auth/creem/webhook` | **no** CSP — the auth proxy streams the upstream response |

**Live — the limiter on staging.**

| Probe | Result |
| --- | --- |
| `internal.lib.rateLimit.consume` ×4 (limit 3, 60 s window) | `allowed: true` count 1→2→3, then `allowed: false` with `retryAfterMs: 18474` |
| stored row (readonly inline query) | one row, `count: 3`, `keyHash: 66f534935b49af2c…` — the raw key is absent |
| `pruneExpired` while the window is live | `{ deleted: 0, hasMore: false }` |
| `pruneExpired` after the window | `{ deleted: 1, hasMore: false }`; the table is empty again |
| 12 sign-ins on `/api/auth/sign-in/email` from one address | attempts 1–10 answered 403 (`MISSING_OR_NULL_ORIGIN`, i.e. they reached the endpoint), 11–12 answered **429** `retry-after: 60` |
| one sign-in after the window | 403 again — the budget reset, not a permanent ban |
| component `rateLimit` table (`convex run --component betterAuth adapter:findMany`) | one row, key `<client ip>|/sign-in/email`, `count: 1` after the window reset |

## Measured constraints (findings, not assumptions)

1. **Asset-served routes had no security headers at all — and this was a
   regression against Vercel.** With the `cloudflare-module` preset, prerendered
   HTML and `/_nuxt/**` are served by the Workers *Assets* layer, which never
   reaches the Nitro handler; neither `routeRules` nor `nuxt-security` applies.
   Measured before the fix: `GET /` returned only `cache-control`,
   `content-type`, `etag` — **no HSTS** (a `<meta>` tag cannot deliver HSTS) — and
   `/_nuxt/<entry>.js` came back `max-age=0, must-revalidate` instead of the
   immutable policy its own route rule declares. Fixed with `public/_headers`
   (Cloudflare's supported mechanism for asset responses: it is parsed, never
   served), then re-measured on the same build. The `/_nuxt/**` rule and the
   `/**` header block in `nuxt.config.ts` still exist for the Worker path and are
   now the *second* declaration, kept because they cover dynamically rendered
   routes.
2. **`/api/auth/*` carries no app-level headers.** The Better Auth proxy streams
   the upstream response and bypasses the app's header phase: measured, the Creem
   webhook answers without a CSP while a normal API route answers with one. This
   is why the plan gives that row to the edge; the gate pins the observation so the
   premise is visible if the proxy ever changes.
3. **The Convex auth config had silently lost the legacy brute-force rules.** With
   no `rateLimit` block, Better Auth falls back to `window: 10`, `max: 100`,
   `storage: "memory"` — and memory on serverless is per isolate, i.e. not a
   limiter. Ported verbatim from `server/utils/auth.ts`; `storage: "database"`
   routes through Better Auth's `createDatabaseStorageWrapper` → the component's
   own `rateLimit` table (which exists for exactly this), so counters are shared
   across isolates like the Upstash-backed legacy. `enabled: true` is explicit,
   where Better Auth defaults to "production only": a guard that disappears when
   `NODE_ENV` is unexpected is a guard that can silently be absent during
   rehearsal.
4. **The client does not choose its own key.** The probe sent
   `x-forwarded-for: 203.0.113.77`; the stored key was the *platform-derived*
   IPv6 (`2a02:8388:…|/sign-in/email`). Better Auth keys on the address Convex
   reports, so a spoofed header cannot buy extra attempts — the opposite design
   from the app's own limiter, which derives its key from server-side identity
   (`appUserId + organizationId`) rather than from anything the request carries.
5. **Refusals are not audited, and `consume` never throws.** The counter row is
   the durable record: an unauthenticated flood must not be able to grow
   `auditLogs`. Callers that know who was refused (the `admin` bucket) audit it
   themselves.
6. **`X-Powered-By` misdirection is stripped on rendered responses.**
   `nuxt-security`'s `hidePoweredBy` (kept **on**, so the real framework header can
   never leak) removes the fake value from Nitro responses; the fake `Server`
   survives and both fake values are delivered on asset responses via
   `public/_headers`. The gate asserts the invariant — *never advertise the real
   stack* — instead of the literal fake value everywhere.
7. **The prerendered CSP is a subset of the SSR CSP** (`default-src`,
   `connect-src`, `frame-src` are absent from the build-time `<meta>` policy).
   Not a regression — the legacy Vercel deploy prerendered the same way — but a
   real narrowing to close before cutover; tracked for Task 19.
8. **Fixed-window bursts are possible.** Two windows' worth of traffic can be
   admitted around a boundary (≤ 2×). Same trade-off the legacy `INCR`+`EXPIRE`
   limiter made, now documented instead of implicit.
9. **No WAF or Cloudflare Rate Limiting rule exists in this repository.**
   `wrangler.jsonc` declares bindings, not rules. Every "edge" cell of the matrix
   that names Cloudflare is a deployment-time obligation; the Convex layer carries
   enforcement until it is provisioned, and the Workers `ratelimits` binding is the
   mechanism to use for the `/api/auth/*` row.

## Delivery shape

- `convex/lib/rateLimit.ts` — policy table (limit/window/**key subject** per
  bucket), `consume` (atomic read-modify-write, decision-not-throw),
  `assertRateLimit` (throwing wrapper, one implementation for actions and
  mutations), `pruneExpired`.
- `convex/schema.ts` — `rateLimitBuckets` with `by_bucket_key_window` and
  `by_expires_at`.
- `convex/files.ts` — `presignUpload`/`confirmUpload` consume `filePresign`
  (100/min) and `fileConfirm` (200/min), keyed by caller.
- `convex/auth.ts` — ported `rateLimit` (rules + database storage).
- `convex/test.setup.ts` — `initConvexTestWithAuthComponent()`, the opt-in harness
  that mounts the Better Auth component in convex-test (the package's `exports`
  map refuses deep specifiers, so the schema is loaded from its resolved path).
- `test/migration/security-headers.test.ts` — declared and observed legs.
- `public/_headers` — the asset-layer policy (HSTS, `nosniff`, `DENY`, referrer,
  permissions, fake server headers, immutable caching).
- `docs/migration/protection-matrix.md` — the matrix itself.
- `package.json` — `test:gate:g09`.

## Verified alongside

- `pnpm test:gate:g09` → 15 + 21 passed
- `pnpm test:gate:g06` → 39 passed (36 + the 3 new auth limiter cases)
- `pnpm test:gate:g08` → 32 passed
- `pnpm test:migration` → 15 files passed / 4 skipped, 155 passed / 27 skipped
- `pnpm typecheck:convex` clean; `pnpm typecheck` → 21 pre-existing errors outside
  this perimeter (unchanged, and none in the files this task touched)
- `NODE_OPTIONS=--max-old-space-size=6144 pnpm build:cloudflare` → success

## Not executed

- **Any Cloudflare edge rule** (WAF, Rate Limiting rules, bot management): no
  account-level configuration is exercised by this repository, and the Workers
  `ratelimits` binding is not declared — wiring it without a deployed verification
  would be an unverifiable claim, not a protection.
- **The RSVP / contact / waiting-list buckets**: the Convex domain for those
  arrivals (Task 12) does not exist yet, so the buckets are declared, tested and
  keyed but not yet called by their routes.
- Staging residue: one component `rateLimit` row and the throwaway gate users from
  G06/G07; Task 16 sweeps them.
