# G01 Cloudflare/Nuxt — Evidence

**Date**: 2026-09-16
**Commit**: d8a9aba (Task 1) → current

## Test Results

### wrangler.jsonc Configuration Test (PASS)
```
pnpm vitest run test/migration/cloudflare-config.test.ts
→ 1 test passed
```
Verifies:
- `main` = `.output/server/index.mjs`
- `compatibility_flags` contains `nodejs_compat`
- `assets.directory` = `.output/public`
- `r2_buckets[0].binding` = `CEREMLY_R2`
- `images.binding` = `IMAGES`
- `observability.enabled` = `true`

## Build Results

### Client Build + Prerendering (PASS)
- `pnpm build:cloudflare` completes client build in ~13s
- Prerenders 79 routes (IT + EN locales)
- Generates `.output/public` with all static assets

### Server Build (BLOCKED — Known Issue)
**Error**: `Cannot resolve "@img/sharp-wasm32/versions" from "sharp/lib/utility.js" and externals are not allowed!`

**Root cause (corrected)**: sharp is a DIRECT dependency (`"sharp": "^0.33.5"`, used by `server/services/file/imageProcessor.ts`) plus `@nuxt/image`→`ipx` and miniflare copies — NOT from `creem@1.9.0` (`pnpm why sharp` verified). Fix: `NUXT_NITRO_PRESET=cloudflare` maps to nitro preset `cloudflare-module` (ESM module worker with `export default { fetch }`; bare `cloudflare` = legacy service-worker/IIFE rejected by wrangler 4), `compatibilityDate 2026-09-15` for preset selection, sharp aliased to `server/utils/sharp-stub.ts` (cloudflare only; throws if invoked — real Images pipeline in Task 7), `import.meta.url` static shim, `@nuxt/content` on `node:sqlite` connector. Vercel default preset untouched.

## Configuration Verification

### wrangler.jsonc
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "ceremly-staging",
  "main": ".output/server/index.mjs",
  "compatibility_date": "2026-09-15",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "directory": ".output/public" },
  "observability": { "enabled": true },
  "r2_buckets": [{ "binding": "CEREMLY_R2", "bucket_name": "ceremly-staging" }],
  "images": { "binding": "IMAGES" },
  "env": {
    "staging": {
      "name": "ceremly-staging",
      "r2_buckets": [{ "binding": "CEREMLY_R2", "bucket_name": "ceremly-staging" }],
      "images": { "binding": "IMAGES" }
    }
  }
}
```

### package.json Scripts Added
- `build:cloudflare`: `NUXT_NITRO_PRESET=cloudflare nuxt build`
- `preview:cloudflare`: `pnpm build:cloudflare && wrangler dev`
- `deploy:cloudflare:staging`: `pnpm build:cloudflare && wrangler deploy --env staging`

### nuxt.config.ts Preset
```ts
preset: process.env.NUXT_NITRO_PRESET || "vercel"  // Blue-green: default stays Vercel
```

### .gitignore
Added `.wrangler/` (local dry-run outputs, regenerable)

## Security Headers (Verified via Code Review)
- CSP configured (nuxt-security)
- HSTS: `max-age=63072000; includeSubdomains; preload` (2 years)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- Fake server headers: `X-Powered-By: PHP/5.2.17`, `Server: Apache/2.2.15`
- Bot traps: `/wp-admin`, `/wp-login.php`, `/.env`, `/.git` → redirect `/`

## Routes Verified (Prerendered)
- `/`, `/en` — Landing
- `/blogs/**`, `/en/blogs/**` — Blog SSR
- `/maintenance` — SSR (not prerendered)
- `/dashboard/**`, `/login`, `/signup` — CSR only
- `/e/**` — Public invite SSR
- All marketing pages (`/features`, `/pricing`, `/templates`, etc.) — Prerendered

## G01 Status: PASS (verified 2026-09-16 on `wrangler dev`, build log /tmp/cf-build.log)
- ✅ Config test 1/1; client build ~13s; server build ~10s; Prerendered 79 routes
- ✅ Worker entry `.output/server/index.mjs` present (module worker, `export default` from `./chunks/nitro/nitro.mjs`)
- ✅ `wrangler deploy --dry-run`: bindings DB (D1 local), CEREMLY_R2, IMAGES
- ✅ Live `wrangler dev`: `/` → 200 (browser UA); `/blogs` → 200 (browser UA; curl UA → 403 from app's own `4.block-bots.ts`, identical on Vercel — prerendered `/` is served by Workers Assets without hitting middleware)
- ✅ `/maintenance` → 302 `/` (site active); `/wp-admin` → 307 (bot trap)
- ✅ SSR headers: `Server: Apache/2.2.15`, `X-Powered-By: PHP/5.2.17`, HSTS `max-age=63072000`, CSP, `nosniff`, `DENY`, permissions-policy, COEP/COOP/CORP

## Next Steps
1. Task 7: Move image processing to Cloudflare Images → removes sharp stub
