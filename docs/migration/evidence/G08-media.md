# Gate G08 Evidence — Observable R2 variants via Cloudflare Images

**Date:** 2026-09-21
**Deployment:** Convex dev `airowl/ceremly-staging` → `wary-spaniel-466`; Cloudflare Worker run locally with `wrangler dev --cwd .output`
**Commands:** `pnpm test:gate:g08` (hermetic) and a signed-request probe against the built Worker

| Gate | Requirement (plan Task 7) | Status |
| --- | --- | --- |
| G08 | R2 objects unchanged, signed bridge, image variants observable through a state machine | **PASS** |

PASS is *mechanism* evidence: 32 hermetic cases plus a live run of the built Worker
(`wrangler dev`) exercising the real signature scheme, the R2 binding and the Images
binding. `Approved by` stays `—`: the signature belongs to GO/NO-GO (Tasks 17–18).

## Gate cases

**Hermetic — 3 files, 32 tests, no network.**

| File | Cases | What it proves |
| --- | --- | --- |
| `convex/media.test.ts` | 18 | authorization ordering, presign limits, confirm only for the issuing key, magic bytes before `ready`, tenant-scoped dedup, variant state machine (two variants max, five attempts, terminal `failed`, manual retry) |
| `test/migration/storage-bridge-contract.test.ts` | 12 | the two runtimes sign identical bytes; freshness / retarget / tamper / wrong-secret / replay are refused; the Worker's own key, MIME, size and base-path policy |
| `test/migration/magic-bytes-contract.test.ts` | 2 | the Convex and legacy validators agree on every sample × type pair |

**Live — the built Worker, run locally.**

| Probe | Result |
| --- | --- |
| unsigned `POST /api/internal/storage/presign` | `401 BRIDGE_SIGNATURE_MISSING` |
| correctly signed presign | `200` + a real presigned R2 URL (`X-Amz-Expires=900`) |
| stale timestamp (−120 s) | `401 BRIDGE_TIMESTAMP_STALE` |
| tampered body | `401 BRIDGE_SIGNATURE_INVALID` |
| key outside the namespace (`../../etc/passwd`) | `400 BRIDGE_KEY_NOT_ALLOWED` |
| disallowed MIME (`text/html`) | `415 BRIDGE_MIME_NOT_ALLOWED` |
| same signed request sent twice | first `200`, second `401 BRIDGE_NONCE_REPLAYED` |
| `POST /api/internal/storage/object` `{"op":"inspect"}` on a missing key | `200 {"exists":false}` (a result, not an error) |
| `POST /api/internal/media/process` on a seeded 51,283 B PNG | `{basePath}/thumb.webp` **4,750 B** and `{basePath}/web.webp` **19,242 B**, both `RIFF`/`WEBP` — two distinct transforms of one original, written to the legacy key layout |
| unsigned `POST /media/variant-result` on staging | `401 BRIDGE_SIGNATURE_MISSING` (the callback route is live and refuses an unsigned call) |

## Measured constraints (findings, not assumptions)

1. **The `runtimeConfig` singleton is empty on a Worker.** The bridge returned `503
   STORAGE_BRIDGE_NOT_CONFIGURED` for *every* request while the secret was plainly
   baked into the bundle. Cause: `server/utils/runtimeConfig.ts` computes its
   singleton from `globalThis.useRuntimeConfig` when present and otherwise falls
   back to `generateRuntimeConfig()`, which reads `process.env` — populated on
   Vercel, **empty in a Worker**. Any server code that reads config through that
   singleton behaves that way on Cloudflare. The bridge now uses the Nitro
   auto-import `useRuntimeConfig()` (verified live above). This is a Task 19 blocker
   for the rest of the legacy server code, not just media.
2. **`@cloudflare/workers-types` was not installed**, so the existing
   `/// <reference types="@cloudflare/workers-types" />` in `server/types/cloudflare.d.ts`
   resolved to nothing and `R2Bucket`/`D1Database` were in fact undefined. Added as a
   dev dependency, with the types imported explicitly (`ImagesBinding` is not shipped
   by the package, so it lives in `server/types/images.ts`).
3. **The R2 *binding* bucket and the S3 bucket are different objects.** Presigning and
   `inspect` go through the S3 API (`aws4fetch`, `fileManager.storage` →
   `ceremly-dev`), while reading/writing object bodies goes through the binding
   (`CEREMLY_R2` → `ceremly-staging`). In production both point at the same bucket;
   locally the probe must seed the binding bucket to exercise the media path.
4. **`NUXT_STORAGE_BRIDGE_SECRET` is inlined into the build.** Nuxt serialises the
   server runtime config, so the value present at build time is what the Worker uses;
   rotating it means rebuilding (or supplying it as a Worker secret and reading it via
   `useRuntimeConfig()`). Convex holds the same value as `STORAGE_BRIDGE_SECRET`
   (set on the dev deployment), and `.env` gets `NUXT_STORAGE_BRIDGE_SECRET`.
5. **The Cloudflare build needs a larger heap.** `nuxt build` with
   `NUXT_NITRO_PRESET=cloudflare` aborts with a V8 OOM under the default heap; with
   `NODE_OPTIONS=--max-old-space-size=6144` it completes (15.8 MB / 4.71 MB gzip). Not
   caused by this task, but the gate cannot be re-run without it.
6. **`convex codegen` does not deploy** (carried from G06): the callback route only
   answered `404` until `convex dev --once` pushed the new functions.

## Delivery shape

- `convex/files.ts` — actions `presignUpload`, `confirmUpload`, `downloadUrl`,
  `remove`; internals `uploadAuthz`, `assertEventAccess`, `getPendingForConfirm`,
  `getFileForAccess`, `listVariants`, `insertPendingUpload`, `finalizeUpload`,
  `markUploadFailed`, `deleteWithVariants`.
- `convex/media.ts` — `startProcessing`, `processVariantResult`,
  `recordProcessingFailure`, `retryVariant`, `variantsNeedingAttention`.
- `convex/lib/media.ts` (policy + key derivation + state machine), `convex/lib/magicBytes.ts`,
  `convex/lib/bridgeHmac.ts`; `convex/schema.ts` gains `files` with tenant-first indexes.
- `convex/http.ts` — `/media/variant-result`, HMAC-verified, delegating to
  `internal.media.processVariantResult`.
- `server/api/internal/storage/presign.post.ts`, `.../object.post.ts`,
  `server/api/internal/media/process.post.ts` — the signed bridges.
- `server/utils/storageBridge.ts` (verification, nonce store, signed callback),
  `server/utils/storageBridgeObjects.ts`, `server/services/file/bridgePolicy.ts`,
  `shared/migration/bridgeProtocol.ts`, `server/types/images.ts`.

**Not executed:** the Convex → Worker leg (`STORAGE_BRIDGE_URL` must point at a
deployed Worker) and therefore the full `confirmUpload → media → callback` round trip
through a deployment. The callback contract itself is proven on both ends: the Worker
signs it (contract test) and the route rejects unsigned calls on staging. This belongs
to the rehearsal (Task 16) once a Worker is deployed.

## Verified alongside

- `pnpm test:gate:g08` → 32 passed
- `pnpm test:migration` → 13 files passed / 4 skipped, 130 passed / 20 skipped
- `pnpm test:gate:g06` → 36 passed · `pnpm typecheck:convex` → clean
- `pnpm typecheck` → 21 pre-existing errors outside this perimeter (unchanged)
- `NODE_OPTIONS=--max-old-space-size=6144 pnpm build:cloudflare` → success, and the
  three bridge routes are present in `.output/server/chunks/routes/api/internal/`

## Gate status

| Gate | Status | Evidence |
| --- | --- | --- |
| G01–G07 | PASS (G04 NOT_RUN) | see ledger |
| **G08** | **PASS** | **This document** |
| G09–G10 | NOT_RUN | — |

Next authorized work: **Task 8** (G09: protection matrix and rate limiting).

## Addendum (Task 14, part c — 2026-09-24): public URL

Found while wiring the browser upload: no Convex file ever had a public URL
(`insertPendingUpload` wrote `url: null` and nothing filled it), so an avatar or a
gallery image uploaded through this domain had nothing to display. The presign
bridge now also returns `publicUrl` (the Worker owns the R2 config, public base
included; same rule as the legacy `storage.getUrl`), `files.insertPendingUpload`
keeps it **only for a public file**, and `files.confirmUpload` returns `url` — the
survivor's after a dedup. Pinned by two cases in `convex/media.test.ts`. The
browser flow (presign → `PUT` → confirm) additionally needs a CORS rule on the
bucket for `PUT` from the site origin; not verifiable from this repository.

Task 14c fix round 1 (same day): confirm is bound to the caller's **active
organization** (`getPendingForConfirm`/`finalizeUpload` compare
`file.organizationId`), dedup never crosses visibility (`isPublic` must match), and
the stored object's measured size must equal the declared one and stay within 5 MB
— otherwise the row fails, the object is deleted and `file.upload_rejected` is
audited (the presigned PUT signs the Content-Type, not the length).

