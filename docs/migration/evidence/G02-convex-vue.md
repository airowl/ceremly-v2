# Gate G02 Evidence — Convex Vue Binding

**Date:** 2026-09-16
**Status:** PASS

## Summary

Proved typed Convex Vue data layer with auth token wiring. All requirements from Task 3 met:

1. ✅ Minimal schema (`convex/schema.ts`) with `migrationHealth` table
2. ✅ Health query (`convex/health.ts`) with `api.health.ping`
3. ✅ Test-driven binding test (`test/migration/convex-vue-spike.test.ts`) - RED→GREEN
4. ✅ `installConvex` function (`app/plugins/convex.ts`) with `setAuth(fetchToken)` contract
5. ✅ `useConvexResource` composable (`app/composables/useConvexResource.ts`) with typed query/mutation contracts
6. ✅ Nuxt plugin (`app/plugins/convex.client.ts`) providing Convex URL from runtime config
7. ✅ Runtime config updated (`server/utils/runtimeConfig.ts`) with `public.convexUrl`

## Files Created/Modified

### Created
- `convex/convex.config.ts` — Convex app definition
- `convex/schema.ts` — Minimal schema with migrationHealth table
- `convex/health.ts` — Ping query
- `convex/test.setup.ts` — Vitest setup for Convex test
- `convex/tsconfig.json` — TypeScript config for Convex
- `app/plugins/convex.ts` — Core `installConvex` function with `FetchConvexToken` type
- `app/plugins/convex.client.ts` — Nuxt plugin providing Convex URL
- `app/composables/useConvexResource.ts` — Typed query/mutation composable
- `test/migration/convex-vue-spike.test.ts` — Binding test (jsdom environment)

### Modified
- `server/utils/runtimeConfig.ts` — Added `public.convexUrl`
- `.env.example` — Already contained Convex env vars (from T2)

## Test Evidence

### RED Phase
```
pnpm vitest run test/migration/convex-vue-spike.test.ts
→ FAIL: Failed to resolve import "~/plugins/convex" (file didn't exist)
```

### GREEN Phase
```
pnpm vitest run test/migration/convex-vue-spike.test.ts
→ PASS: 1 test, 1 passed
```

### Full Migration Test Suite
```
pnpm test:migration
→ PASS: 3 test files, 3 tests total
  - test/migration/convex-vue-spike.test.ts (1)
  - test/migration/version-contract.test.ts (1)
  - test/migration/cloudflare-config.test.ts (1)
```

## Interface Contracts Verified

### `FetchConvexToken`
```ts
type FetchConvexToken = (args: { forceRefreshToken: boolean }) => Promise<string | null>;
```

### `installConvex`
```ts
function installConvex(app: App, url: string, fetchToken: FetchConvexToken): ConvexClient
```
- Installs `convexVue` plugin with `{ url, server: true }`
- Gets client via `app.runWithContext(() => useConvexClient())`
- Calls `client.setAuth(fetchToken)` to wire auth token
- Returns the configured client

### `useConvexResource`
```ts
function useConvexResource<TArgs, TReturn>(query: FunctionReference<"query">, args?: TArgs): ConvexQueryResult<TReturn>
function useConvexResource<TArgs, TReturn>(mutation: FunctionReference<"mutation">, args?: TArgs): ConvexMutationResult<TArgs>
```
- Query result: `{ data, error, isPending, suspense }`
- Mutation result: `{ mutate, error, isPending }`

## Gate Status

| Gate | Status | Evidence |
|------|--------|----------|
| G01 | PASS | `docs/migration/evidence/G01-cloudflare.md` |
| **G02** | **PASS** | **This document** |
| G03 | NOT_RUN | — |
| G04 | NOT_RUN | — |
| G05 | NOT_RUN | — |
| G06 | NOT_RUN | — |
| G07 | NOT_RUN | — |
| G08 | NOT_RUN | — |
| G09 | NOT_RUN | — |
| G10 | NOT_RUN | — |

## Notes

- `convex-vue@0.1.5` works correctly — no fallback needed
- All Convex dependencies pinned per Task 1: `convex@1.45.0`, `convex-vue@0.1.5`, `convex-test@0.0.58`
- No secrets exposed to browser (Convex URL is public, auth token fetched via `FetchConvexToken` from auth composable)
- Next task (T4) will integrate Better Auth with Convex for the `fetchToken` implementation