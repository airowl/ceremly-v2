# Migration Gates Ledger

| Gate | Name | Status | Command | Evidence | Approved by | Approved at |
|------|------|--------|---------|----------|-------------|-------------|
| G01 | Cloudflare/Nuxt | PASS | `pnpm build:cloudflare && pnpm preview:cloudflare` | docs/migration/evidence/G01-cloudflare.md | — | — |
| G02 | Vue binding | PASS | `pnpm vitest run test/migration/convex-vue-spike.test.ts` | docs/migration/evidence/G02-convex-vue.md | — | 2026-09-16 |
| G03 | Password | NOT_RUN | `pnpm vitest run test/migration/auth-import.test.ts` | docs/migration/evidence/G03-G05-auth.md | — | — |
| G04 | Google | NOT_RUN | `pnpm vitest run test/migration/auth-import.test.ts` | docs/migration/evidence/G03-G05-auth.md | — | — |
| G05 | 2FA | NOT_RUN | `pnpm vitest run test/migration/auth-import.test.ts` | docs/migration/evidence/G03-G05-auth.md | — | — |
| G06 | org/RBAC | NOT_RUN | `pnpm vitest run convex/organizations.test.ts` | docs/migration/evidence/G06-org-rbac.md | — | — |
| G07 | Creem | NOT_RUN | `pnpm vitest run convex/billing.test.ts` | docs/migration/evidence/G07-creem.md | — | — |
| G08 | Media | NOT_RUN | `pnpm vitest run convex/media.test.ts` | docs/migration/evidence/G08-media.md | — | — |
| G09 | Protezioni | NOT_RUN | `pnpm vitest run test/migration/security-headers.test.ts && pnpm vitest run convex/lib/rateLimit.test.ts` | docs/migration/evidence/G09-protections.md | — | — |
| G10 | Costi | NOT_RUN | `pnpm vitest run test/migration/load-model.test.ts && pnpm tsx scripts/migration/load-runner.ts` | docs/migration/cost-model.md | — | — |

**Gate order:** G01 → G02 → G03 → G04 → G05 → G06 → G07 → G08 → G09 → G10
**Gate rule:** The next phase does not start until the previous gate is `PASS`. A failed gate remains `FAIL` with evidence and blocks migration; the requirement is not changed to make it pass.

**Notes:**
- G01: PASS — Config test, client+server build, 79 prerendered routes, Worker entry, dry-run bindings, live SSR/headers/bot-trap verified on `wrangler dev`. sharp aliased to stub for cloudflare preset only (server/utils/sharp-stub.ts); real Images pipeline in Task 7.