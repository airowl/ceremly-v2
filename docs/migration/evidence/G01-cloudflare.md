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

**Root cause**: `creem@1.9.0` has transitive dependency on `sharp@0.33.5`. The Cloudflare Workers preset uses IIFE output format which conflicts with Rollup externals needed to exclude sharp.

**Pre-existing issue**: Documented in AGENTS.md: "`sharp-wasm32` error during Nitro build is pre-existing"

**Workaround planned**: Task 7 moves image variant processing to Cloudflare Images binding (removing sharp runtime dependency). Until then, Cloudflare Worker entry `.output/server/index.mjs` is not generated.

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

## G01 Status: CONDITIONAL PASS
- ✅ Configuration test passes
- ✅ Client build + prerender passes
- ✅ Security headers, CSP, HSTS, bot traps verified in code
- ⚠️ Server build blocked by known sharp-wasm32 issue (pre-existing)
- ⚠️ Worker entry `.output/server/index.mjs` not generated
- ⚠️ `pnpm preview:cloudflare` and `wrangler deploy --dry-run` cannot run without server entry

**Resolution**: Will be unblocked in Task 7 when sharp dependency is removed via Cloudflare Images migration. G01 will be re-verified then.

## Next Steps
1. Task 3: Convex base + Vue binding (independent, can proceed)
2. Task 7: Move image processing to Cloudflare Images → removes sharp → unblocks G01