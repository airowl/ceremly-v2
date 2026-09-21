# Protection matrix (plan Task 8, spike G09)

What protects every exposed surface after the migration, where the protection
lives, and — the part that is easy to lose — **what is measured versus what is
only declared**. Every "observed" column in the tables below was read off a real
Worker running on `wrangler dev` with the built bundle, and off the staging Convex
deployment; the commands are in `docs/migration/evidence/G09-protections.md`.

Two facts shape the whole matrix:

1. **Two runtimes, two enforcement points.** The Worker owns the request (headers,
   size ceilings, bot traps, static assets). Convex owns the *operation* (who may
   call it, how often, with what budget). A route that exists only in Convex has
   no edge protection at all; a route that exists only in the Worker has no
   identity-based protection at all.
2. **Cloudflare has no WAF/rate-limiting rule configured in this repository.**
   `wrangler.jsonc` declares bindings, not rules. Every row whose edge column says
   "Cloudflare Rate Limiting" or "WAF" is therefore a *deployment-time* obligation,
   not something the code proves. It is marked accordingly, and the Convex layer
   carries the load in the meantime.

## Rows

| Route / function | Edge (Worker, Cloudflare) | Convex | Key | Status |
| --- | --- | --- | --- | --- |
| `GET /` and prerendered pages | `public/_headers`: HSTS 2y, `nosniff`, `DENY`, referrer, permissions, fake server headers | n/a | n/a | **observed** |
| `/_nuxt/**`, `/fonts/**` | `public/_headers`: `immutable` + `nosniff` | n/a | n/a | **observed** |
| `GET /blogs`, `/**` SSR pages | Nitro route rules + `nuxt-security` (CSP header) | n/a | n/a | **observed** |
| Bot traps (`/.env`, `/wp-*`, `/.git`, `/xmlrpc.php`, `/cmd_sco`, `/config*`) | route-rule redirect + `4.block-bots.ts` (403 on scanner UA) | n/a | n/a | **observed** |
| Request/upload ceilings | `nuxt-security.requestSizeLimiter` 1 MB / 5 MB | n/a | n/a | **observed** |
| `/api/auth/*` | **the one route with no app-level headers** (transparent proxy) → Cloudflare rate limiting required at the edge | Better Auth rate limit (20/min per IP+path) | IP + path | proxy gap **observed**, edge rule **not configured** |
| RSVP pubblico (`/api/public/invite/[token]/rsvp`) | none (no WAF rule deployed) | mandatory `rsvp` bucket (30/min) | guest token + IP | limiter ready, **not yet wired** (Task 12) |
| contact / waiting list | none (no WAF rule deployed) | mandatory `contact` / `waitingList` bucket (5/h) | IP hash + email hash | limiter ready, **not yet wired** (Task 12) |
| presign / confirm (`files.presignUpload`, `files.confirmUpload`) | none — the Worker bridge is signed, not rate limited | `filePresign` (100/min) + `fileConfirm` (200/min) | `appUserId + organizationId` | **observed** (hermetic + live) |
| Bridge `POST /api/internal/storage/*`, `/api/internal/media/process` | HMAC signature, timestamp skew ±60 s, single-use nonce, key prefix/MIME/size allowlist | the URL and secret are server-side only | HMAC over `method/path/timestamp/nonce/body-digest` | **observed** (G08 live) |
| admin | none (no WAF rule deployed) | `admin` bucket (60/min) | superAdmin `appUserId` | limiter ready, **not yet wired** (admin functions arrive later) |
| any future Convex write | none — Convex functions are not HTTP-routable except actions | `requireRole` before the write, `assertRateLimit` where the operation is expensive | identity + role | by convention (Task 5/6/7) |

The `subject` field of each policy entry in `convex/lib/rateLimit.ts` is the
machine-readable version of this table's "Key" column: the limiter cannot verify
that a caller passed the right kind of key, so the contract is written next to the
limit and asserted by a test.

## Limits and where the numbers come from

| Bucket | Limit | Window | Legacy equivalent |
| --- | --- | --- | --- |
| `auth` | 20 | 60 s | Better Auth's own rate limit (kept) |
| `rsvp` | 30 | 60 s | `rsvp.post.ts`: `isEndpointRateLimited(ip, "public-rsvp", 30, 60_000)` |
| `contact` | 5 | 1 h | `contact.service.ts`: `(ip, "contact", 5, 3600_000)` |
| `waitingList` | 5 | 1 h | `waitingList.service.ts`: `(ip, "waiting-list-subscribe", 5, 3600_000)` |
| `filePresign` | 100 | 60 s | `fileManager.uploadRateLimit` (100 per 1 min, per user) |
| `fileConfirm` | 200 | 60 s | new — confirm reads the object and can start variant work |
| `admin` | 60 | 60 s | legacy `/api/admin/*` had no limiter (API key only) |

The numbers are mirrored rather than tightened on purpose: a migration must not
silently throttle what production allows. Where the legacy had **no** limiter
(`admin`) the new one is additive.

## Properties the limiter has, and the one it does not

**Atomic.** The check and the increment are one document write in one Convex
mutation (`convex/lib/rateLimit.ts` → `consume`). The legacy upload limiter was
`get` then `set` across two round trips, so two concurrent uploads could both read
the same count and both be admitted. Measured under concurrency: 12 parallel calls
with a budget of 4 admit exactly 4.

**Not PII.** Only `sha256(bucket \0 key)` is stored. The raw IP/email/token never
reaches the table, which is what makes keeping counters compatible with the rest of
the app's data posture.

**Fixed window, so a boundary burst is possible.** Two calls per window can double
the admitted rate at a window edge (limit at the end of one window plus limit at
the start of the next). This is the same trade-off the legacy Upstash limiter made
with `INCR` + `EXPIRE`, and it is bounded (≤ 2×), cheap (one indexed point read),
and honest. A sliding window or token bucket would need per-request history; that
is a deliberate non-goal here, and the counters are prunable (`pruneExpired`,
called by the cron sweep in Task 13).

**Refusals are not audited.** Writing an `auditLogs` row per refused request would
let an unauthenticated flood grow a table; the counter row is the durable record.
Callers that know who was refused (the `admin` bucket) audit it themselves.

## Gaps found by this gate (not papered over)

1. **The asset-served routes had no security headers at all.** With the
   `cloudflare-module` preset, prerendered HTML and `/_nuxt/**` are served by the
   Workers *Assets* layer, which never reaches the Nitro handler, so neither
   `routeRules` nor `nuxt-security` could apply. Measured before the fix:
   `GET /` returned only `cache-control`/`content-type`/`etag` — **no HSTS** (a
   `<meta>` tag cannot deliver HSTS) — and `/_nuxt/<entry>.js` came back
   `max-age=0, must-revalidate` instead of the immutable policy its route rule
   declares. Fixed by `public/_headers` (Cloudflare's supported mechanism for asset
   responses); re-measured on the same build. This is also a bug that **Vercel did
   not have**, i.e. exactly the class of regression a gate exists to catch.
2. **`/api/auth/*` carries no app-level headers.** The Better Auth proxy streams
   the upstream response, bypassing the app's response-header phase: measured, the
   Creem webhook path answers with no CSP while a normal API route (`/api/webhooks/resend`)
   carries one. This is why the auth row belongs to the edge, and why the matrix
   cannot be read as "the app protects everything".
3. **`X-Powered-By` misdirection is stripped on rendered responses.**
   `nuxt-security`'s `hidePoweredBy` (kept **on**, so the real framework header can
   never leak) removes the fake `PHP/5.2.17` from Nitro responses. The fake `Server:
   Apache/2.2.15` survives, and both fake values are delivered on asset responses
   through `public/_headers`. The gate therefore asserts the invariant that matters
   (*never advertise the real stack*) instead of the literal fake value everywhere.
4. **The prerendered CSP is a subset of the SSR CSP.** Prerendered pages get
   `nuxt-security`'s build-time `<meta>` policy, which omits `default-src`,
   `connect-src` and `frame-src` (the SSR header has them). Not fixable in this
   task and not a regression (the legacy Vercel deploy prerendered the same way),
   but it is a real narrowing to close before cutover: an XSS on a prerendered page
   has no `connect-src` restriction to fight. Tracked for Task 19.
5. **Bot traps have two authorities.** Nuxt's `routeRules` redirect to `/`; Nitro's
   `nitro.routeRules` send `/.env`, `/.git`, `wp-*` and `config*` to `/404`.
   Measured: `/.env` → `/404`, `/wp-admin` → `/`. Both leave the site, so neither
   is wrong, but the duplication is a maintenance hazard and the gate pins the
   current split so a change to either authority is visible.

## Not covered here

- **WAF, Cloudflare Rate Limiting rules, bot management**: deployment
  configuration, not repository code. The rows above say which ones the plan
  expects; none exists yet, and Convex carries the enforcement until they do.
- **DDoS / L7 volumetric**: Cloudflare's always-on protection; nothing to assert
  from a unit test.
- **QStash job and cron authentication**: HMAC/secret verification, covered by the
  routes themselves (G08 for the media callback, cron secrets documented in
  `docs/security/`).
