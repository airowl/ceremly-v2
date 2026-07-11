# Upstash Review Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 13 verified findings from the Upstash Redis code review (1 of the original 14, the GDPR export deadlock, is already fixed by commit 0166dab and out of scope).

**Architecture:** Split `cacheClient` into the existing fail-soft client (rate-limit/cache) and a new `strictCacheClient` (fail-loud) for authoritative consumers — Better Auth session store, site-mode kill-switch, job dedup. Idempotency rides strict storage (jobs) or the database (webhook unique index) or Resend content-keys (invite). Small surgical fixes for the rest.

**Tech Stack:** Nuxt 4 / Nitro (preset `vercel`), TypeScript, Better Auth 1.4.x, Drizzle ORM + Neon serverless Postgres, `@upstash/redis` (REST), `@upstash/qstash`, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-11-upstash-review-fixes-design.md`

## Global Constraints

- **Comments/JSDoc/test/dev-log in English**; product/UI strings in Italian (IT-first convention). Copy verbatim from the codebase style.
- **Multi-tenancy**: every query on tenant resources MUST filter by `organizationId`. (Not directly relevant to these tasks but never violate.)
- **DB migration gotcha**: `pnpm db:migrate:prod` migrates DEV (dotenv `override:false`). Migrate prod ONLY with the inline prod URL (`ep-dark-dream` endpoint). Prod is at migration 0010; the new one is 0011.
- **`pnpm db:generate` is interactive** (needs a TTY) when creating tables/columns.
- **Push is always manual** — never `git push`. Commits are fine.
- **Env access**: `useRuntimeConfig()` in routes/handlers, never `process.env` (except in Nitro plugins like `0.validate-env.ts` where `process.env` is the established pattern).
- **Verify before done**: `pnpm typecheck` green + full Vitest suite green.

---

## Cluster 1 — Strict storage for authoritative consumers

### Task 1: `strictCacheClient` — fail-loud Redis wrapper

**Files:**
- Modify: `server/utils/drivers.ts` (add `strictCacheClient` after the existing `cacheClient`, ~line 149)
- Test: `server/utils/drivers.strict.test.ts` (create)

**Interfaces:**
- Consumes: existing `getUpstashClient()` (module-private in `drivers.ts`) and the existing `memoryCache` Map.
- Produces: `export const strictCacheClient` with `get(key: string): Promise<string | null>`, `set(key: string, value: string, ttl: number | undefined): Promise<void>`, `delete(key: string): Promise<void>`. Failure model: **not-configured** (no Upstash url/token — i.e. local dev / single-instance self-host) → falls back to the same in-memory `memoryCache` as `cacheClient` (safe: no multi-instance split-brain possible when there's one process). **Configured-but-errored** (Upstash reachable in prod but a call throws) → the error PROPAGATES (fail-loud). Prod always has Upstash (it's in `REQUIRED_ENV`), so the memory fallback only ever runs in dev/self-host and the fail-loud path only ever runs in prod, exactly where multi-instance split-brain is the risk.

> **Why the split:** `drivers.ts`'s header states dev/node-server uses an in-memory fallback, and `0.validate-env.ts` makes Upstash fatal only in production (dev = warning). A strict client that threw on *not-configured* would break login in local dev the moment `secondaryStorage` points at it (Task 3). Distinguishing not-configured from errored keeps dev working and still fails loud in prod.

- [ ] **Step 1: Write the failing test**

Create `server/utils/drivers.strict.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { getMock, setMock, delMock, clientRef } = vi.hoisted(() => {
  const clientRef: { current: unknown } = { current: undefined };
  return {
    clientRef,
    getMock: vi.fn(),
    setMock: vi.fn(),
    delMock: vi.fn(),
  };
});

// Mock the Upstash SDK so getUpstashClient() returns our controllable stub.
vi.mock("@upstash/redis", () => ({
  Redis: vi.fn(() => clientRef.current),
}));

vi.mock("./runtimeConfig", () => ({
  runtimeConfig: {
    upstashRedisRestUrl: "https://fake",
    upstashRedisRestToken: "tok",
  },
}));

import { strictCacheClient } from "./drivers";

describe("strictCacheClient (fail-loud)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientRef.current = { get: getMock, set: setMock, del: delMock };
  });

  it("returns the value on success (configured)", async () => {
    getMock.mockResolvedValueOnce("v");
    expect(await strictCacheClient.get("k")).toBe("v");
  });

  it("THROWS on a get error when Upstash IS configured (fail-loud in prod)", async () => {
    getMock.mockRejectedValueOnce(new Error("upstash down"));
    await expect(strictCacheClient.get("k")).rejects.toThrow("upstash down");
  });

  it("THROWS on a set error when configured", async () => {
    setMock.mockRejectedValueOnce(new Error("upstash down"));
    await expect(strictCacheClient.set("k", "v", 60)).rejects.toThrow("upstash down");
  });

  it("THROWS on a delete error when configured", async () => {
    delMock.mockRejectedValueOnce(new Error("upstash down"));
    await expect(strictCacheClient.delete("k")).rejects.toThrow("upstash down");
  });

  it("set with ttl>0 passes ex; ttl falsy/0 stores without ex", async () => {
    await strictCacheClient.set("k", "v", 60);
    expect(setMock).toHaveBeenCalledWith("k", "v", { ex: 60 });
    setMock.mockClear();
    await strictCacheClient.set("k", "v", undefined);
    expect(setMock).toHaveBeenCalledWith("k", "v");
  });

  it("falls back to in-memory when Upstash is NOT configured (dev/self-host)", async () => {
    clientRef.current = undefined; // getUpstashClient() returns undefined
    await strictCacheClient.set("k", "v", 60);
    expect(await strictCacheClient.get("k")).toBe("v"); // served from memory, no throw
    await strictCacheClient.delete("k");
    expect(await strictCacheClient.get("k")).toBeNull();
  });
});
```

> The "not configured" test needs the runtimeConfig mock to yield no url/token for that case. Simplest: give `strictCacheClient` the same `getUpstashClient()` (which returns `undefined` when `clientRef.current` is falsy AND url/token absent). Since the mock forces `Redis` to return `clientRef.current`, setting it to `undefined` makes `getUpstashClient()` construct-then-return `undefined` — verify `getUpstashClient` guards on url/token FIRST (it does, `drivers.ts:20`), so also stub runtimeConfig with empty url/token in a nested `describe` if needed.

> **Module-cache note:** `getUpstashClient()` memoizes `upstashClient` at module scope. Across tests in one file the stub persists, which is fine here (all tests use the same stubbed client via `clientRef.current`). If a later test needs a *different* client, use `vi.resetModules()` + dynamic `import()` inside that test. The `clientRef.current` indirection above lets each test swap behaviour without re-importing.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/utils/drivers.strict.test.ts`
Expected: FAIL — `strictCacheClient` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `server/utils/drivers.ts`, add after the `cacheClient` object (after line 149), before `getResendInstance`:

```typescript
/**
 * Fail-LOUD Redis client for AUTHORITATIVE consumers (Better Auth session
 * store, site-mode kill-switch, job dedup markers). Failure model:
 *  - NOT configured (no Upstash url/token → dev / single-instance self-host):
 *    falls back to the same in-memory `memoryCache` as cacheClient. Safe: with
 *    one process there's no multi-instance split-brain.
 *  - CONFIGURED but a call errors (prod Upstash blip): the error PROPAGATES.
 *    For these consumers a silent per-instance fallback is worse than an error —
 *    a session read returning a phantom null triggers a fleet-wide logout, a
 *    "successful" delete that didn't reach Redis reports a revocation that never
 *    happened, a lost dedup marker double-processes a job. Callers convert the
 *    throw into a transient 500 / retry, which is the safe outcome.
 * Prod always has Upstash (REQUIRED_ENV), so fail-loud runs only where a shared
 * store exists and split-brain is possible; the memory fallback runs only in dev.
 */
export const strictCacheClient = {
  get: async (key: string): Promise<string | null> => {
    const client = getUpstashClient();
    if (!client) {
      // Not configured → dev/self-host memory path (no throw).
      cleanExpiredMemoryCache();
      const entry = memoryCache.get(key);
      return entry && (!entry.expires || entry.expires > Date.now()) ? entry.value : null;
    }
    return await client.get<string>(key); // configured: errors propagate
  },

  set: async (key: string, value: string, ttl: number | undefined): Promise<void> => {
    const client = getUpstashClient();
    if (!client) {
      memoryCache.set(key, { value, expires: ttl && ttl > 0 ? Date.now() + ttl * 1000 : undefined });
      return;
    }
    if (ttl != null && ttl > 0) {
      await client.set(key, value, { ex: ttl });
    } else {
      await client.set(key, value);
    }
  },

  delete: async (key: string): Promise<void> => {
    const client = getUpstashClient();
    if (!client) {
      memoryCache.delete(key);
      return;
    }
    await client.del(key);
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run server/utils/drivers.strict.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/drivers.ts server/utils/drivers.strict.test.ts
git commit -m "feat(cache): strictCacheClient fail-loud wrapper for authoritative consumers"
```

---

### Task 2: Fix `ttl=0` in fail-soft `cacheClient` + clear memoryCache on set/delete

**Files:**
- Modify: `server/utils/drivers.ts` (`cacheClient.set` line ~83, `cacheClient.delete` line ~100)
- Test: `server/utils/drivers.softttl.test.ts` (create)

**Interfaces:**
- Consumes: existing `cacheClient`.
- Produces: no signature change. Behaviour: `set` with `ttl > 0` → `ex`; `ttl == 0`/negative/undefined → no `ex` (never a poisoned negative EX); `set`/`delete` always clear the local `memoryCache` entry so a stale value can't be resurrected on a later fail-soft read.

- [ ] **Step 1: Write the failing test**

Create `server/utils/drivers.softttl.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { setMock, delMock, getMock, clientRef } = vi.hoisted(() => {
  const clientRef: { current: unknown } = { current: undefined };
  return { clientRef, setMock: vi.fn(), delMock: vi.fn(), getMock: vi.fn() };
});

vi.mock("@upstash/redis", () => ({ Redis: vi.fn(() => clientRef.current) }));
vi.mock("./runtimeConfig", () => ({
  runtimeConfig: { upstashRedisRestUrl: "https://fake", upstashRedisRestToken: "tok" },
}));

import { cacheClient } from "./drivers";

describe("cacheClient set/delete edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientRef.current = { get: getMock, set: setMock, del: delMock };
  });

  it("ttl>0 → SET with ex", async () => {
    await cacheClient.set("k", "v", 60);
    expect(setMock).toHaveBeenCalledWith("k", "v", { ex: 60 });
  });

  it("ttl=0 → SET WITHOUT ex (never permanent-by-mistake, never ex:0)", async () => {
    await cacheClient.set("k", "v", 0);
    expect(setMock).toHaveBeenCalledWith("k", "v");
  });

  it("negative ttl → SET WITHOUT ex (never ex:-N)", async () => {
    await cacheClient.set("k", "v", -5);
    expect(setMock).toHaveBeenCalledWith("k", "v");
  });

  it("delete clears the memory entry even when Redis del succeeds", async () => {
    // Prime memory via a fail-soft set (simulate a prior outage write).
    clientRef.current = undefined; // no client → memory path
    await cacheClient.set("k", "cached", 60);
    // Restore client; a successful Redis delete must ALSO drop the memory copy.
    clientRef.current = { get: getMock, set: setMock, del: delMock };
    delMock.mockResolvedValueOnce(1);
    await cacheClient.delete("k");
    // Now force a memory-fallback read (client get throws) → must be null, not "cached".
    getMock.mockRejectedValueOnce(new Error("blip"));
    expect(await cacheClient.get("k")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/utils/drivers.softttl.test.ts`
Expected: FAIL — `ttl=0` currently takes the no-`ex` branch already (that part may pass), but the `delete` memory-clear test FAILS (memory copy survives) and the negative-ttl expectation may FAIL if current code passes `ex` for any truthy check.

- [ ] **Step 3: Write minimal implementation**

In `server/utils/drivers.ts`, change `cacheClient.set` (line ~83):

```typescript
        if (client) {
            try {
                if (ttl != null && ttl > 0) {
                    await client.set(key, stringValue, { ex: ttl });
                } else {
                    await client.set(key, stringValue);
                }
                memoryCache.delete(key); // drop any stale outage-era copy
                return;
            } catch (err) {
                console.error(`[cache] Upstash set failed for "${key}"; falling back to per-instance memory:`, err);
            }
        }
```

And `cacheClient.delete` (line ~100):

```typescript
    delete: async (key: string): Promise<void> => {
        const client = getUpstashClient();
        if (client) {
            try {
                await client.del(key);
                memoryCache.delete(key); // never leave a resurrectable copy
                return;
            } catch (err) {
                console.error(`[cache] Upstash del failed for "${key}"; falling back to per-instance memory:`, err);
            }
        }

        memoryCache.delete(key);
    },
```

Also fix the fail-soft `set` memory branch to respect ttl=0 (line ~96): the existing `expires: ttl ? Date.now() + ttl * 1000 : undefined` already treats 0 as "no expiry" in memory, which is consistent — leave it.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run server/utils/drivers.softttl.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/drivers.ts server/utils/drivers.softttl.test.ts
git commit -m "fix(cache): ttl=0 never stores permanently; set/delete clear stale memory copy"
```

---

### Task 3: Point Better Auth session store + site-mode at `strictCacheClient`

**Files:**
- Modify: `server/utils/auth.ts` (line 179 `secondaryStorage: cacheClient`)
- Modify: `server/utils/siteMode.ts` (import + all 4 `cacheClient` uses)

**Interfaces:**
- Consumes: `strictCacheClient` (Task 1).
- Produces: no new exports. Better Auth `secondaryStorage` and every site-mode Redis call now throw on Upstash error instead of silently degrading.

- [ ] **Step 1: Write the failing test**

Create `server/utils/siteMode.strict.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { getMock, setMock, delMock } = vi.hoisted(() => ({
  getMock: vi.fn(), setMock: vi.fn(), delMock: vi.fn(),
}));

vi.mock("./drivers", () => ({
  strictCacheClient: { get: getMock, set: setMock, delete: delMock },
  cacheClient: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
}));

// useRuntimeConfig is a Nuxt auto-import; stub it.
vi.stubGlobal("useRuntimeConfig", () => ({ public: { siteMode: "active" } }));

import { setServerSiteMode, getServerSiteMode } from "./siteMode";

describe("siteMode uses strict storage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("setServerSiteMode THROWS when the Upstash write fails (no false success)", async () => {
    setMock.mockRejectedValueOnce(new Error("upstash down"));
    await expect(setServerSiteMode("maintenance")).rejects.toThrow("upstash down");
  });

  it("getServerSiteMode falls back to env when the strict read throws (no un-maintenance beyond env)", async () => {
    getMock.mockRejectedValueOnce(new Error("upstash down"));
    // env default is "active" here; the point is it does NOT crash the request,
    // it keeps the env value via the catch.
    expect(await getServerSiteMode()).toBe("active");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/utils/siteMode.strict.test.ts`
Expected: FAIL — siteMode still imports `cacheClient`; the mock exposes only `strictCacheClient`, so calls hit undefined.

- [ ] **Step 3: Write minimal implementation**

In `server/utils/siteMode.ts` line 18, change the import:

```typescript
import { strictCacheClient } from "./drivers";
```

Replace all four `cacheClient.` occurrences (lines 46, 60, 66, 79) with `strictCacheClient.`. NOTE: `setServerSiteMode` and `clearServerSiteModeOverride` have NO catch → the throw propagates to the admin endpoint, which is the desired "no false success".

**Reader fix (#5 — don't silently un-maintenance on a READ error):** in `getServerSiteMode`, the current catch returns `envSiteMode()` on error. During an Upstash outage that silently reverts a `maintenance` override to env (possibly `active`) — the exact invariant the docstring forbids. Change the catch to **hold the last-known memo** if one exists, only falling to env if there's no memo yet:

```typescript
export async function getServerSiteMode(): Promise<SiteMode> {
    const now = Date.now();
    if (cached && now - cached.at < CACHE_TTL_MS) {
        return cached.mode;
    }

    let mode = envSiteMode();
    try {
        const override = await strictCacheClient.get(SITE_MODE_OVERRIDE_KEY);
        if (override) {
            mode = resolveSiteMode(override);
        }
    } catch {
        // Upstash unreachable on READ: do NOT silently drop to env (would lift
        // maintenance mid-incident). Hold the last-known mode if we have one.
        if (cached) return cached.mode;
        // No prior memo → keep env value (safe: never forces "active" over a
        // known override, because there is no known override yet).
    }

    cached = { mode, at: now };
    return mode;
}
```

`getSiteModeStatus` keeps `override: null` on error (it's a diagnostic read, and reporting "unknown/null" is acceptable there) — leave its catch as-is.

In `server/utils/auth.ts` line 15, change the drivers import. At THIS point in the plan `cacheClient` is still referenced by the `rateLimit` block (until Task 10 relaxes it) — but Task 10 replaces the `/sign-in/email` rule with the catch-all guard and does NOT reference `cacheClient` inside `auth.ts`. So after Task 3, `cacheClient` becomes unused in `auth.ts`. To avoid a typecheck error, import ONLY `strictCacheClient` here and let Task 10 add its own import in `[...all].ts`:

```typescript
import { strictCacheClient } from "./drivers";
```

Line 179, change:

```typescript
        secondaryStorage: strictCacheClient,
```

> **CRITICAL — only the SESSION store goes strict, NOT the rate limiter.** Better Auth's `rateLimit.storage: "secondary-storage"` reuses this SAME `secondaryStorage` adapter, and its call site (`api-CkmycQ2x.mjs:320-321`) has NO try/catch — so if the rate limiter used `strictCacheClient`, an Upstash blip would 500 every `/api/auth/*` request, contradicting spec §5.2 (rate-limit must fail-soft). Task 10 fixes this by moving the limiter OFF `secondary-storage` onto an explicit fail-soft `customStorage`. Until Task 10 lands, `secondaryStorage = strictCacheClient` means the BA limiter is temporarily fail-loud — acceptable in the interim (dev has the memory fallback; prod rarely blips), and Task 10 is the immediate next cluster. Do Task 10 in the same batch as Task 3 if possible.

> If `pnpm typecheck` reports `cacheClient` unused after this edit, that confirms the import change above is correct (it was only feeding `secondaryStorage`). If it reports `cacheClient` STILL used, grep `auth.ts` for the remaining reference and keep `cacheClient` in the import.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run server/utils/siteMode.strict.test.ts`
Expected: PASS (2 tests).

Also run: `pnpm typecheck` — confirm `cacheClient` is still imported in `auth.ts` only if referenced; if the rateLimit change in Task 11 hasn't landed yet, `cacheClient` may now be unused in `auth.ts` → remove it from the import to keep typecheck clean, re-add in Task 11.

- [ ] **Step 5: Commit**

```bash
git add server/utils/auth.ts server/utils/siteMode.ts server/utils/siteMode.strict.test.ts
git commit -m "fix(auth,site-mode): use strictCacheClient so outages fail loud, not silently"
```

---

### Task 4: `isUserBannedFresh` — absent user row means revoked

**Files:**
- Modify: `server/utils/banStatus.ts` (line 38)
- Test: `server/utils/banStatus.test.ts` (extend if it exists; else create)

**Interfaces:**
- Consumes: existing `isUserBannedFresh(userId)`.
- Produces: `isUserBannedFresh` returns `true` when no user row exists (was `false`).

- [ ] **Step 1: Write the failing test**

Check for an existing test: `ls server/utils/banStatus*.test.ts`. Create or extend `server/utils/banStatus.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { selectRows } = vi.hoisted(() => ({ selectRows: { current: [] as unknown[] } }));

vi.mock("./db", () => ({
  getDB: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => selectRows.current,
        }),
      }),
    }),
  }),
}));

import { isUserBannedFresh } from "./banStatus";

describe("isUserBannedFresh", () => {
  beforeEach(() => { selectRows.current = []; });

  it("returns TRUE when the user row is absent (deleted account = revoked)", async () => {
    selectRows.current = [];
    expect(await isUserBannedFresh("u1")).toBe(true);
  });

  it("returns false for an existing, non-banned user", async () => {
    selectRows.current = [{ banned: false, banExpires: null }];
    expect(await isUserBannedFresh("u1")).toBe(false);
  });

  it("returns true for a permanently banned user", async () => {
    selectRows.current = [{ banned: true, banExpires: null }];
    expect(await isUserBannedFresh("u1")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/utils/banStatus.test.ts`
Expected: FAIL — the "absent row" case returns `false`.

- [ ] **Step 3: Write minimal implementation**

In `server/utils/banStatus.ts`, change line 38:

```typescript
    const row = rows[0];
    if (!row) return true; // no user row = account deleted/purged = treat as revoked
    return isBanActive(row.banned, row.banExpires);
```

Update the JSDoc above `isUserBannedFresh` to note the absent-row semantics.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run server/utils/banStatus.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/banStatus.ts server/utils/banStatus.test.ts
git commit -m "fix(auth): treat missing user row as revoked in isUserBannedFresh (ghost session after purge)"
```

---

### Task 5: Extend the fresh-ban check to Better Auth endpoints (`/api/auth/*`)

**Files:**
- Modify: `server/utils/auth.ts` (add a `before` hook in the `hooks` block, ~line 267)
- Test: covered by manual verification note (Better Auth hook behaviour is integration-level); add a unit test on the helper if extractable.

**Interfaces:**
- Consumes: `isUserBannedFresh` (Task 4), the Better Auth session available in the hook context.
- Produces: a `before` middleware that, for a request carrying a session, calls `isUserBannedFresh(session.user.id)` and throws `APIError("UNAUTHORIZED")` if banned — so a banned user with a failed Redis revocation can't use org/invite/change-email endpoints.

- [ ] **Step 1: Read the current hooks block AND verify the load-bearing assumption**

Read `server/utils/auth.ts:267-357` (the `hooks.after` block) and confirm the `createAuthMiddleware` import (line 5). A `before` hook uses the same `createAuthMiddleware` wrapper.

**Load-bearing check (this fix silently no-ops if wrong):** confirm in `node_modules/better-auth/dist/` that a `hooks.before` middleware receives a populated `ctx.context.session` for authenticated endpoints. Grep the middleware-execution path: does BA resolve the session BEFORE running `hooks.before`, or only inside individual endpoints? If `ctx.context.session` is NOT populated in `before`, this approach can't gate on the session — fall back to gating in the catch-all `[...all].ts` (read the resolved session via `getAuthSession(event)` before `serverAuth.handler`, and 403 if `isSessionBanned`). Document which path the source supports before implementing.

**Second check — don't break sign-out for a banned user:** a banned user must still be able to hit `/sign-out` (and `/get-session` returning null is fine). If the `before` hook throws UNAUTHORIZED on ALL auth paths, a banned user can't sign out. Scope the gate to the org/mutation endpoints (or exclude `/sign-out`, `/get-session`). Note the exact path-scoping in the implementation.

- [ ] **Step 2: Write the failing test (helper-level)**

If the ban gate can be extracted to a testable function, create `server/utils/authBanGate.test.ts`. Otherwise, document a manual test in the plan and skip to Step 3. Extract a helper:

```typescript
// In a new file server/utils/authBanGate.ts
import { isUserBannedFresh } from "./banStatus";

/**
 * Returns true if the request's session belongs to a banned/deleted user.
 * FAIL-OPEN on a check error (a Neon blip must not 401 every auth request) —
 * mirrors getAuthSession's deliberate fail-open.
 */
export async function isSessionBanned(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
    return await isUserBannedFresh(userId);
  } catch (err) {
    console.error(`[auth] ban gate check failed for ${userId}; allowing (fail-open):`, err);
    return false;
  }
}
```

Test `server/utils/authBanGate.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

const { bannedMock } = vi.hoisted(() => ({ bannedMock: vi.fn() }));
vi.mock("./banStatus", () => ({ isUserBannedFresh: bannedMock }));

import { isSessionBanned } from "./authBanGate";

describe("isSessionBanned", () => {
  it("returns false for no userId", async () => {
    expect(await isSessionBanned(undefined)).toBe(false);
  });
  it("propagates the banned verdict", async () => {
    bannedMock.mockResolvedValueOnce(true);
    expect(await isSessionBanned("u1")).toBe(true);
  });
  it("fails open on a check error", async () => {
    bannedMock.mockRejectedValueOnce(new Error("neon blip"));
    expect(await isSessionBanned("u1")).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run server/utils/authBanGate.test.ts`
Expected: FAIL — `authBanGate.ts` does not exist.

- [ ] **Step 4: Implement the helper and wire the `before` hook**

Create `server/utils/authBanGate.ts` as above. In `server/utils/auth.ts`, add a `before` inside the existing `hooks` object (alongside `after`, line 267):

```typescript
        hooks: {
            before: createAuthMiddleware(async (ctx) => {
                // Banned/deleted users must be locked out of Better Auth's OWN
                // endpoints too (org create, invite, change-email): 1.auth.ts
                // excludes /api/auth/* from the app-level ban re-check, and the
                // catch-all calls serverAuth.handler directly. Redis revocation
                // can fail silently, so re-check the DB (source of truth).
                // EXCLUDE sign-out / get-session so a banned user can still log
                // out and the session probe returns cleanly.
                const EXEMPT = ["/sign-out", "/get-session"];
                if (EXEMPT.includes(ctx.path)) return;
                const userId = ctx.context.session?.user?.id;
                if (await isSessionBanned(userId)) {
                    throw new APIError("UNAUTHORIZED", { message: "Account suspended" });
                }
            }),
            after: createAuthMiddleware(async (ctx) => {
                // ... existing after body unchanged ...
```

Add the import near line 15: `import { isSessionBanned } from "./authBanGate";`

> If Step 1 found that `ctx.context.session` is NOT populated in `before`, DO NOT use this hook. Instead, in `server/api/auth/[...all].ts` before `serverAuth.handler`: resolve `const session = await getAuthSession(event)` (already does the app-level fresh-ban check) and, for non-exempt org/mutation paths, `throw createError({ statusCode: 403 })` if the session is null due to a ban. Pick the path the source supports.

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm vitest run server/utils/authBanGate.test.ts` → PASS (3 tests).
Run: `pnpm typecheck` → green.

- [ ] **Step 6: Commit**

```bash
git add server/utils/auth.ts server/utils/authBanGate.ts server/utils/authBanGate.test.ts
git commit -m "fix(auth): re-check ban on Better Auth endpoints via before hook (fail-open)"
```

---

## Cluster 2 — Idempotency

### Task 6: Invite email content-keyed idempotency (#10)

**Files:**
- Modify: `server/queue/handlers/sendInviteEmail.handler.ts` (the `sendEmail` call, ~line 60)
- Test: `server/queue/handlers/sendInviteEmail.handler.test.ts` (create or extend)

**Interfaces:**
- Consumes: `sendEmail` with the already-exposed `idempotencyKey?: string` option (`email.ts:49`).
- Produces: the invite `sendEmail` call passes `idempotencyKey: \`invite:${event.id}:${guest.id}\``, mirroring the reminder handler's `reminder:${reminder.id}:${guest.id}`.

- [ ] **Step 1: Write the failing test**

Create `server/queue/handlers/sendInviteEmail.handler.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendEmailMock, findGuestMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(async () => ({ success: true })),
  findGuestMock: vi.fn(),
}));

vi.mock("~~/server/utils/email", () => ({ sendEmail: sendEmailMock }));
vi.mock("~~/server/repositories/distributionRepository", () => ({ findGuestForEmail: findGuestMock }));
vi.mock("~~/server/emailTemplates", () => ({
  emailSubjects: { guestInvite: () => "Sub" },
  renderGuestInviteEmail: async () => ({ html: "<p></p>", text: "t" }),
}));
vi.mock("~~/server/services/distribution.service", () => ({
  applyInvitePlaceholders: (s: string) => s,
  buildGuestInviteLink: () => "https://link",
  buildGuestPixelUrl: () => "https://pixel",
}));

import { handleSendInviteEmail } from "./sendInviteEmail.handler";

describe("handleSendInviteEmail idempotency", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes a deterministic idempotencyKey invite:{eventId}:{guestId}", async () => {
    findGuestMock.mockResolvedValueOnce({
      guest: { id: "g1", firstName: "Ada", email: "a@x.com", token: "tok", removedAt: null, organizationId: "o1", eventId: "e1" },
      event: { id: "e1", slug: "party", title: "Party", distribution: { emailSubject: "", emailBody: "" } },
    });
    await handleSendInviteEmail({ guestId: "g1" });
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "invite:e1:g1" }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/queue/handlers/sendInviteEmail.handler.test.ts`
Expected: FAIL — no `idempotencyKey` in the call.

- [ ] **Step 3: Write minimal implementation**

In `server/queue/handlers/sendInviteEmail.handler.ts`, change the `sendEmail` call (line ~60) to add the key. Confirm `event.id` is available on the fetched row (it is — `findGuestForEmail` returns `event`); if the event object lacks `id`, use `guest.eventId` (present on the guest, per the schema):

```typescript
  const result = await sendEmail({
    type: 'custom',
    to: guest.email,
    subject,
    html,
    text,
    context: { organizationId: guest.organizationId, guestId: guest.id, eventId: guest.eventId },
    idempotencyKey: `invite:${guest.eventId}:${guest.id}`,
  })
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run server/queue/handlers/sendInviteEmail.handler.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/queue/handlers/sendInviteEmail.handler.ts server/queue/handlers/sendInviteEmail.handler.test.ts
git commit -m "fix(queue): content-keyed idempotencyKey on invite email (double-submit dedup)"
```

---

### Task 7: `email_events` unique index migration 0011 (#6-webhook, schema + generate)

**Files:**
- Modify: `server/database/schema/emailEvents.ts` (add `providerEventId` column + unique index)
- Create: `drizzle/migrations/0011_*.sql` (via `pnpm db:generate`)

**Interfaces:**
- Consumes: nothing.
- Produces: `email_events.providerEventId` (text, nullable) with a unique index `email_events_provider_event_id_unique`. NULL-multiple allowed (seed rows without an svix-id don't collide).

- [ ] **Step 1: Add the column + unique index to the schema**

In `server/database/schema/emailEvents.ts`, add the column inside the table definition (after `messageId`):

```typescript
    providerEventId: text("provider_event_id"),
```

And add to the index array (import `uniqueIndex` from `drizzle-orm/pg-core`):

```typescript
import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
```
```typescript
    uniqueIndex("email_events_provider_event_id_unique").on(table.providerEventId),
```

- [ ] **Step 2: Generate the migration**

Run (interactive — needs a TTY): `pnpm db:generate`
Expected: creates `drizzle/migrations/0011_<name>.sql` containing `ALTER TABLE "email_events" ADD COLUMN "provider_event_id" text;` and `CREATE UNIQUE INDEX "email_events_provider_event_id_unique" ON "email_events" ("provider_event_id");`

Inspect the generated SQL to confirm it's ONLY the add-column + unique-index (no unexpected drops).

- [ ] **Step 3: Apply to dev**

Run: `pnpm db:migrate`
Expected: migration 0011 applied to the dev branch. Verify with `pnpm db:studio` or a `\d email_events` that the column + unique index exist.

- [ ] **Step 4: Commit (schema + migration; prod apply is a separate release step)**

```bash
git add server/database/schema/emailEvents.ts drizzle/migrations/0011_*.sql drizzle/migrations/meta
git commit -m "feat(db): email_events.provider_event_id unique index (webhook idempotency) [0011]"
```

> **Prod apply** (do at release, per Global Constraints — inline prod URL, NOT `db:migrate:prod`): documented in the release checklist at the end of this plan.

---

### Task 8: Webhook writes `providerEventId` + `onConflictDoNothing` (#6-webhook, code)

**Files:**
- Modify: `server/repositories/emailEvent.repository.ts` (`insertEmailEvent` — add `providerEventId`, `onConflictDoNothing`; return whether a row was inserted)
- Modify: `server/services/emailWebhook.service.ts` (`handleResendEvent` — pass the svix-id; gate `recordGuestOpen` on insert success)
- Modify: `server/api/webhooks/resend.post.ts` (pass `svix-id` into the handler)
- Test: `server/repositories/emailEvent.repository.test.ts` (create) or a service-level test

**Interfaces:**
- Consumes: `providerEventId` column (Task 7).
- Produces: `insertEmailEvent(input & { providerEventId?: string | null }): Promise<boolean>` returning `true` iff a NEW row was inserted (false when the unique index absorbed a duplicate). `handleResendEvent` uses that boolean to skip counter updates on a duplicate.

- [ ] **Step 1: Read the current webhook service flow**

Read `server/services/emailWebhook.service.ts` fully: find where `handleResendEvent` calls `insertEmailEvent` and `recordGuestOpen`, and how the parsed Svix payload / svix-id is threaded. Read `server/api/webhooks/resend.post.ts` (already in context) — the svix-id is in `headers["svix-id"]`.

- [ ] **Step 2: Write the failing test**

Create `server/repositories/emailEvent.repository.test.ts` (unit around the insert contract, mocking `getDB`):

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { insertChain } = vi.hoisted(() => ({ insertChain: { returning: vi.fn() } }));

vi.mock("../utils/db", () => ({
  getDB: () => ({
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({ returning: insertChain.returning }),
      }),
    }),
  }),
}));
vi.mock("../database/schema", () => ({ emailEvents: {} }));

import { insertEmailEvent } from "./emailEvent.repository";

describe("insertEmailEvent idempotency", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns true when a new row is inserted", async () => {
    insertChain.returning.mockResolvedValueOnce([{ id: "x" }]);
    const inserted = await insertEmailEvent({
      messageId: "m", type: "opened", recipient: "r", occurredAt: new Date(),
      payload: {}, providerEventId: "svix_1",
    });
    expect(inserted).toBe(true);
  });

  it("returns false when the unique index absorbs a duplicate", async () => {
    insertChain.returning.mockResolvedValueOnce([]);
    const inserted = await insertEmailEvent({
      messageId: "m", type: "opened", recipient: "r", occurredAt: new Date(),
      payload: {}, providerEventId: "svix_1",
    });
    expect(inserted).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run server/repositories/emailEvent.repository.test.ts`
Expected: FAIL — `insertEmailEvent` returns `void` and has no `onConflictDoNothing`.

- [ ] **Step 4: Implement**

In `server/repositories/emailEvent.repository.ts`, change `insertEmailEvent` (lines 41-66):

```typescript
export async function insertEmailEvent(input: {
    messageId: string;
    type: string;
    recipient: string;
    occurredAt: Date;
    payload: unknown;
    providerEventId?: string | null;
    clickedUrl?: string;
    organizationId?: string | null;
    guestId?: string | null;
    eventId?: string | null;
    emailType?: string | null;
}): Promise<boolean> {
    const db = getDB();
    const inserted = await db.insert(schema.emailEvents).values({
        messageId: input.messageId,
        type: input.type,
        recipient: input.recipient,
        occurredAt: input.occurredAt,
        payload: input.payload as object,
        providerEventId: input.providerEventId ?? undefined,
        clickedUrl: input.clickedUrl,
        organizationId: input.organizationId ?? undefined,
        guestId: input.guestId ?? undefined,
        eventId: input.eventId ?? undefined,
        emailType: input.emailType ?? undefined,
    }).onConflictDoNothing().returning({ id: schema.emailEvents.id });
    return inserted.length > 0;
}
```

In `server/services/emailWebhook.service.ts`, thread the svix-id into `handleResendEvent` and gate the counter. Exact edits depend on the current signature (read in Step 1); the shape is:
- Add a `providerEventId` param/field to whatever payload `handleResendEvent` receives (or pass it explicitly).
- Capture the boolean: `const isNew = await insertEmailEvent({ ..., providerEventId });`
- Only call `recordGuestOpen(...)` (and any counter update) `if (isNew)`.

In `server/api/webhooks/resend.post.ts`, pass the svix-id when calling `handleResendEvent` (line ~34):
- Change `await handleResendEvent(parsed);` to include the id, e.g. `await handleResendEvent(parsed, headers["svix-id"]);` (match the signature you defined).

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm vitest run server/repositories/emailEvent.repository.test.ts` → PASS.
Run: `pnpm typecheck` → green (ensure `handleResendEvent`'s new param is consistent at the call site).

- [ ] **Step 6: Commit**

```bash
git add server/repositories/emailEvent.repository.ts server/services/emailWebhook.service.ts server/api/webhooks/resend.post.ts
git commit -m "fix(webhook): DB unique-index idempotency for email_events; skip counter on duplicate"
```

---

### Task 9: Atomic claim-lease for the QStash jobs consumer (#6-jobs)

**Files:**
- Modify: `server/api/jobs/[job].post.ts` (dedup block lines ~72-94)
- Test: `server/api/jobs/jobDedupe.test.ts` (test the claim/release logic via an extracted helper)

**Interfaces:**
- Consumes: `strictCacheClient` (Task 1), the `@upstash/redis` `set(key, val, { nx: true, ex })` option (verified: returns `"OK"` on create, `null` when the key exists — `chunk-2X4SLXT7.mjs:305`).
- Produces: `claimJob(messageId): Promise<boolean>` (true = claim won), `releaseJob(messageId): Promise<void>` (release on throw → same message retried), `finalizeJob(messageId): Promise<void>` (extend TTL after success → late retries deduped). A lost claim makes the route return a retryable non-2xx (425), NOT 200 — see the two-phase note.

- [ ] **Step 1: Read the current dedup block**

Read `server/api/jobs/[job].post.ts` lines 63-95 (in context above). The current flow: `get(dedupeKey)` → early return if set → `runJob` → `set(dedupeKey, '1', TTL)`. Replace with an atomic NX claim released on failure.

- [ ] **Step 2: Write the failing test**

Create `server/api/jobs/jobDedupe.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { setMock, delMock } = vi.hoisted(() => ({ setMock: vi.fn(), delMock: vi.fn() }));

vi.mock("~~/server/utils/drivers", () => ({
  strictCacheClient: {
    // set returns "OK" when NX wins, null when the key already exists.
    setNx: undefined, // placeholder to keep the mock shape explicit
  },
}));

// We test the helper module directly.
import { claimJob, releaseJob } from "./jobDedupe";

describe("job claim-lease", () => {
  beforeEach(() => vi.clearAllMocks());
  // See implementation note: claimJob/releaseJob live in server/api/jobs/jobDedupe.ts
  // and call strictCacheClient. This test asserts the win/lose/release contract.
  it("is documented in the implementation step", () => {
    expect(typeof claimJob).toBe("function");
    expect(typeof releaseJob).toBe("function");
  });
});
```

> Note: because the claim uses Upstash's `set ... NX` return value, the meaningful assertions require mocking `strictCacheClient` to expose a raw `set` that returns `"OK"`/`null`. Refine the mock in Step 4 once the helper's exact `strictCacheClient` surface is chosen (a raw `setNx(key, val, ttl)` added to `strictCacheClient`, OR call `client.set(key, val, { nx: true, ex })` inside the helper). Preferred: add `setNx` to `strictCacheClient` so the helper stays SDK-agnostic.

- [ ] **Step 3: Add `setNx` to `strictCacheClient` (Task 1 file) with its own test**

In `server/utils/drivers.ts` `strictCacheClient`, add:

```typescript
  /**
   * Atomic reservation: SET key val NX EX ttl. Returns true iff THIS call
   * created the key (won the claim). Fail-loud: an Upstash error throws.
   */
  setNx: async (key: string, value: string, ttlSeconds: number): Promise<boolean> => {
    const client = getUpstashClient();
    if (!client) throw new Error(`[cache:strict] Upstash not configured; cannot setNx "${key}"`);
    const res = await client.set(key, value, { nx: true, ex: ttlSeconds });
    return res === "OK";
  },
```

Extend `server/utils/drivers.strict.test.ts`:

```typescript
  it("setNx returns true when the key is created, false when it exists", async () => {
    setMock.mockResolvedValueOnce("OK");
    expect(await strictCacheClient.setNx("k", "1", 60)).toBe(true);
    setMock.mockResolvedValueOnce(null);
    expect(await strictCacheClient.setNx("k", "1", 60)).toBe(false);
    expect(setMock).toHaveBeenLastCalledWith("k", "1", { nx: true, ex: 60 });
  });
```

- [ ] **Step 4: Implement the helper**

Create `server/api/jobs/jobDedupe.ts`:

```typescript
import { strictCacheClient } from "~~/server/utils/drivers";

// Lease sized to the QStash retry window (~35 min): a genuine retry after the
// job finished still finds the key and is deduped; a job that crashes mid-flight
// releases the key so QStash's next delivery can re-run it.
const JOB_LEASE_SECONDS = 24 * 60 * 60;

export async function claimJob(messageId: string): Promise<boolean> {
  return strictCacheClient.setNx(`job:dedupe:${messageId}`, "1", JOB_LEASE_SECONDS);
}

export async function releaseJob(messageId: string): Promise<void> {
  await strictCacheClient.delete(`job:dedupe:${messageId}`);
}
```

Rewrite the dedup block in `server/api/jobs/[job].post.ts` (lines ~72-94). Remove the `JOB_DEDUPE_TTL_SECONDS` const (line 8) and the `cacheClient` import if now unused; import the helpers:

```typescript
import { claimJob, releaseJob, finalizeJob } from './jobDedupe'
```

Replace the get-then-set flow:

```typescript
  const messageId = getHeader(event, 'upstash-message-id')

  // Atomic claim (SET NX) sized to the QStash retry window. Three outcomes:
  //  - claim WON        → run the job.
  //  - claim LOST       → a concurrent delivery is ALREADY running this message.
  //                       Return a NON-2xx so QStash retries LATER (after the
  //                       in-flight attempt has set the durable state), NOT a
  //                       200 — a 200 would ack the message and, if the running
  //                       attempt then crashes, the work would be LOST. This is
  //                       the two-phase choice: never turn a concurrent race into
  //                       at-most-zero.
  //  - job THROWS       → release the claim so the SAME message is retried.
  //  - job COMPLETES    → finalize (extend TTL) so late retries are deduped.
  if (messageId) {
    const won = await claimJob(messageId)
    if (!won) {
      // 409-ish: tell QStash to retry later; the twin is in flight.
      throw createError({ statusCode: 425, statusMessage: 'Job in progress, retry later' })
    }
  }

  let payload
  try {
    payload = parseJobPayload(job, JSON.parse(body))
  } catch (err) {
    console.error(`[jobs] invalid payload for job "${job}":`, err)
    if (messageId) await releaseJob(messageId)
    throw createError({ statusCode: 400, statusMessage: 'Invalid job payload' })
  }

  try {
    await runJob(job, payload)
  } catch (err) {
    if (messageId) await releaseJob(messageId)
    throw err
  }
  if (messageId) await finalizeJob(messageId)
```

> **Why 425 (not 200) on claim-loss.** The old code returned `{ deduped: true }` (200) whenever the key was present. With a claim-lease, the key present means "a twin is running RIGHT NOW" — its durable outcome isn't known yet. Returning 200 acks the message; if that twin then crashes, QStash never retries and the job is lost (worse than the double-run it replaced). Returning a retryable non-2xx (425 Too Early / 409) makes QStash retry after backoff, by which time either the twin finished (the finalized key dedups the retry cleanly) or it crashed-and-released (the retry re-runs). Net: at-least-once preserved, duplicates collapsed. Note: idempotent email jobs (invite via Task 6's Resend key, reminder via 0166dab's key) are ALSO protected at the email layer, so even a rare double-run there sends one email.

Update `jobDedupe.ts` to add `finalizeJob` (extends the claim to the full dedup TTL after success):

```typescript
export async function finalizeJob(messageId: string): Promise<void> {
  // Re-assert the key with the full dedup TTL so a late QStash retry (after the
  // job already succeeded) is deduped rather than re-run.
  await strictCacheClient.set(`job:dedupe:${messageId}`, 'done', JOB_LEASE_SECONDS);
}
```

- [ ] **Step 5: Finalize the test**

Update `server/api/jobs/jobDedupe.test.ts` to mock `strictCacheClient.setNx`/`delete` and assert: claim win → true; second concurrent claim → false; `releaseJob` calls delete. Run: `pnpm vitest run server/api/jobs/jobDedupe.test.ts server/utils/drivers.strict.test.ts` → PASS.

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm typecheck` → green.

```bash
git add server/utils/drivers.ts server/utils/drivers.strict.test.ts "server/api/jobs/[job].post.ts" server/api/jobs/jobDedupe.ts server/api/jobs/jobDedupe.test.ts
git commit -m "fix(queue): atomic SET NX job claim-lease with release-on-throw (double-process fix)"
```

---

## Cluster 3 — Rate-limit atomic + fail-soft isolation (#4)

### Task 10: Better Auth `rateLimit.customStorage` on the atomic INCR primitive (fail-soft)

This task does DOUBLE duty: (a) makes the limiter atomic (fixes #4 — the get→set race), and (b) moves the limiter OFF `secondaryStorage` (now strict) onto an explicit fail-soft store, so an Upstash blip does NOT 500 every `/api/auth/*` request (resolves the Task 3 interaction with spec §5.2).

**Verified interface** (`api-CkmycQ2x.mjs:262`): `getRateLimitStorage` returns `ctx.options.rateLimit.customStorage` when set — so BA supports a custom storage with `get(key) → {count, lastRequest} | undefined` and `set(key, value, isUpdate)`. The default `secondary-storage` adapter (lines 265-273) does NON-atomic get→set with NO try/catch at the call site (lines 320-321) → both the race (#4) and the strict-throw-500 problem. A custom storage backed by the atomic `cacheClient.increment` fixes both.

**Files:**
- Create: `server/utils/authRateLimitStorage.ts` (the custom storage adapter)
- Modify: `server/utils/auth.ts` (`rateLimit` block lines 187-200 — add `customStorage`, keep `customRules`)
- Test: `server/utils/authRateLimitStorage.test.ts`

**Interfaces:**
- Consumes: `cacheClient.increment(key, windowSeconds)` (atomic INCR_WINDOW_LUA; fail-soft is correct — a rate-limit outage must fail-open, not block logins).
- Produces: `createRateLimitStorage()` returning `{ get, set }` matching BA's shape, where the true per-key count comes from an atomic INCR keyed by the request key. Parallel `/sign-in/email` hits are counted race-free.

> **Design note on adapting an atomic counter to BA's get/set shape.** BA calls `get(key)` then, if under the limit, `set(key, {count, lastRequest})`. We can't make BA's two-call flow atomic from outside, BUT we can make the COUNT authoritative: have `set` perform the atomic `cacheClient.increment` (which both increments and returns the true shared count) and have `get` read that count back. Concretely, model each key's window with a single INCR: `get` returns `{ count: <current>, lastRequest: <stored> }`; `set` does the INCR. Because `increment` is atomic, concurrent requests each get a distinct incremented value, so `shouldRateLimit(max, window, {count})` sees the real count and no over-admission occurs. Store `lastRequest` alongside via a second key or fold it into the value. Keep it minimal — the load-bearing property is the atomic count.

- [ ] **Step 1: Re-read the BA storage contract to lock the exact shape**

Read `api-CkmycQ2x.mjs:260-345` (in context above): confirm `get` returns `undefined` or `{ key, count, lastRequest }`, `set(key, value, isUpdate?)`, and `shouldRateLimit(max, window, data)` reads `data.count` + `data.lastRequest`. Lock the value shape you'll store.

- [ ] **Step 2: Write the failing test**

Create `server/utils/authRateLimitStorage.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { incrMock, getMock, setMock, store } = vi.hoisted(() => {
  const store = new Map<string, number>();
  return {
    store,
    incrMock: vi.fn(async (key: string, _ttl: number, by = 1) => {
      const n = (store.get(key) ?? 0) + by; store.set(key, n); return n;
    }),
    getMock: vi.fn(async (key: string) => {
      const v = store.get(key); return v === undefined ? null : String(v);
    }),
    setMock: vi.fn(),
  };
});
vi.mock("./drivers", () => ({ cacheClient: { increment: incrMock, get: getMock, set: setMock } }));

import { createRateLimitStorage } from "./authRateLimitStorage";

describe("BA rate-limit custom storage (atomic)", () => {
  beforeEach(() => { store.clear(); vi.clearAllMocks(); });

  it("counts parallel hits atomically (no over-admission past the window)", async () => {
    const s = createRateLimitStorage();
    const key = "1.2.3.4/sign-in/email";
    // Simulate BA's set-on-each-request; run 5 in parallel.
    const counts = await Promise.all(
      Array.from({ length: 5 }, async () => {
        await s.set(key, { key, count: 0, lastRequest: 1 });
        const d = await s.get(key);
        return d?.count ?? 0;
      }),
    );
    // Atomic INCR → the 5 observed counts are distinct 1..5, never all 1.
    expect(new Set(counts).size).toBe(5);
    expect(Math.max(...counts)).toBe(5);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run server/utils/authRateLimitStorage.test.ts`
Expected: FAIL — `authRateLimitStorage.ts` does not exist.

- [ ] **Step 4: Implement the custom storage**

Create `server/utils/authRateLimitStorage.ts`:

```typescript
import { cacheClient } from "./drivers";

/**
 * Better Auth rate-limit custom storage backed by the ATOMIC INCR primitive
 * (cacheClient.increment / INCR_WINDOW_LUA), fixing two problems with the
 * default "secondary-storage" adapter:
 *  1. it does a NON-atomic get→set → parallel requests over-admit (#4);
 *  2. it reuses `secondaryStorage`, which is now strictCacheClient → an Upstash
 *     blip would 500 every /api/auth/* request. This storage uses fail-soft
 *     cacheClient (a rate-limit outage must fail OPEN, not block logins).
 *
 * BA calls get(key) then set(key,value,isUpdate) per request. We make the COUNT
 * authoritative via the atomic INCR in set(); get() reads the current count so
 * shouldRateLimit() sees the true shared value. lastRequest is stored under a
 * side key so window-reset logic keeps working.
 */
export function createRateLimitStorage() {
  return {
    get: async (key: string): Promise<{ key: string; count: number; lastRequest: number } | undefined> => {
      const countRaw = await cacheClient.get(`rl:ba:${key}:c`);
      if (countRaw == null) return undefined;
      const lastRaw = await cacheClient.get(`rl:ba:${key}:t`);
      return { key, count: Number.parseInt(countRaw, 10) || 0, lastRequest: lastRaw ? Number.parseInt(lastRaw, 10) : 0 };
    },
    set: async (key: string, value: { count: number; lastRequest: number }, _isUpdate?: boolean): Promise<void> => {
      // Window seconds inferred from BA's set TTL is not passed here; use a
      // conservative window matching the tightest custom rule (10s for sign-in,
      // 60s otherwise). BA also enforces max separately, so slight window skew
      // only affects reset timing, not the atomic count.
      const windowSeconds = 60;
      // Atomic increment is the authoritative count; ignore value.count.
      await cacheClient.increment(`rl:ba:${key}:c`, windowSeconds);
      await cacheClient.set(`rl:ba:${key}:t`, String(value.lastRequest), windowSeconds);
    },
  };
}
```

> **Window caveat, stated explicitly (no silent cap):** BA's custom-storage `set` signature does not pass the per-rule window, so this adapter uses a fixed 60s TTL on the count key. Effect: the `/sign-in/email` rule (BA window 10s) is enforced by BA's `max=3` against a count that expires after 60s rather than 10s — i.e. slightly STRICTER reset (safe direction for brute-force). If exact per-rule windows are required, encode the window into the key prefix per rule. Documented here rather than hidden.

In `server/utils/auth.ts`, add `customStorage` to the `rateLimit` block (keep `storage` and `customRules`):

```typescript
        rateLimit: {
            storage: "secondary-storage",
            customStorage: createRateLimitStorage(),
            window: 60,
            max: 100,
            customRules: {
                "/sign-in/email": { window: 10, max: 3 },
                "/request-password-reset": { window: 60, max: 5 },
                "/reset-password": { window: 60, max: 10 },
            },
        },
```

Add the import: `import { createRateLimitStorage } from "./authRateLimitStorage";`

> Note: with `customStorage` set, BA ignores `storage: "secondary-storage"` (the `getRateLimitStorage` early-return at line 262 wins), so the limiter no longer touches `strictCacheClient` → the Task 3 interaction is resolved: sessions are strict, the limiter is fail-soft.

- [ ] **Step 5: Run test + typecheck**

Run: `pnpm vitest run server/utils/authRateLimitStorage.test.ts` → PASS.
Run: `pnpm typecheck` → green.

- [ ] **Step 6: Commit**

```bash
git add server/utils/authRateLimitStorage.ts server/utils/auth.ts server/utils/authRateLimitStorage.test.ts
git commit -m "fix(auth): atomic + fail-soft rate-limit customStorage (parallel bypass; keep limiter off strict store)"
```

---

## Cluster 4 — Quick-wins

### Task 11: Clock-skew — don't discard slow-but-skewed submissions (#12)

**Files:**
- Modify: `server/services/spamProtection.ts` (`isSubmittedTooFast`, line 102-105)
- Test: `server/services/spamProtection.test.ts` (create or extend)

**Interfaces:**
- Consumes: existing `isSubmittedTooFast(loadedAt: unknown): boolean`.
- Produces: same signature. A `loadedAt` in the future (client clock ahead → negative elapsed) is NOT classified "too fast" — only a genuinely small positive elapsed is.

- [ ] **Step 1: Write the failing test**

Create/extend `server/services/spamProtection.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { isSubmittedTooFast } from "./spamProtection";

describe("isSubmittedTooFast", () => {
  afterEach(() => vi.useRealTimers());

  it("blocks a genuinely too-fast submit (<3s elapsed)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:02Z"));
    const loadedAt = new Date("2026-01-01T00:00:00Z").getTime(); // 2s ago
    expect(isSubmittedTooFast(loadedAt)).toBe(true);
  });

  it("does NOT block a slow submit from a client whose clock is ahead (negative elapsed)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:30Z"));
    // Client clock +2min → loadedAt appears in the server's future.
    const loadedAt = new Date("2026-01-01T00:02:00Z").getTime();
    expect(isSubmittedTooFast(loadedAt)).toBe(false);
  });

  it("blocks non-numeric / non-positive loadedAt", () => {
    expect(isSubmittedTooFast(undefined)).toBe(true);
    expect(isSubmittedTooFast(0)).toBe(true);
    expect(isSubmittedTooFast(-1)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/services/spamProtection.test.ts`
Expected: FAIL — the negative-elapsed case currently returns `true` (blocks), discarding the message.

- [ ] **Step 3: Write minimal implementation**

In `server/services/spamProtection.ts`, change `isSubmittedTooFast` (line 102-105):

```typescript
export function isSubmittedTooFast(loadedAt: unknown): boolean {
    if (typeof loadedAt !== "number" || loadedAt <= 0) return true;
    const elapsed = Date.now() - loadedAt;
    // A NEGATIVE elapsed means the client's clock is ahead of the server's
    // (common skew) — we cannot trust the timing, so do NOT treat it as a bot.
    // Only a genuinely small POSITIVE elapsed is "too fast".
    if (elapsed < 0) return false;
    return elapsed < MIN_SUBMIT_TIME_MS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run server/services/spamProtection.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/services/spamProtection.ts server/services/spamProtection.test.ts
git commit -m "fix(spam): clock-skew no longer discards slow submissions as too-fast"
```

---

### Task 12: Fix password-reset audit endpoint mapping (#13)

**Files:**
- Modify: `server/utils/auth.ts` (line 272 `AUTH_PATH_MAP`, line 287 target array)
- Test: extract the map to a testable const if not already; add `server/utils/authAuditMap.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `AUTH_PATH_MAP['/request-password-reset'] = 'auth.password_reset_requested'` and the target array uses `/request-password-reset` (with leading slash).

- [ ] **Step 1: Write the failing test**

The map is inline in the hook. Extract it to a module-level const above `createBetterAuth` so it's importable, then test. Create `server/utils/authAuditMap.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { AUTH_PATH_MAP } from "./authAuditMap";

describe("AUTH_PATH_MAP", () => {
  it("maps the REAL Better Auth endpoint for a reset request", () => {
    expect(AUTH_PATH_MAP["/request-password-reset"]).toBe("auth.password_reset_requested");
  });
  it("does not use the non-existent /forget-password key", () => {
    expect(AUTH_PATH_MAP["/forget-password"]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/utils/authAuditMap.test.ts`
Expected: FAIL — `authAuditMap.ts` does not exist.

- [ ] **Step 3: Extract + fix the map**

Create `server/utils/authAuditMap.ts`:

```typescript
import type { AuditAction } from "./audit/types";

/**
 * Better Auth endpoint path → audit action. Paths are the REAL BA 1.4.x
 * endpoints (request-password-reset, NOT forget-password — verified in source).
 */
export const AUTH_PATH_MAP: Record<string, AuditAction> = {
  '/sign-in/email': 'auth.signed_in',
  '/sign-up/email': 'auth.signed_up',
  '/request-password-reset': 'auth.password_reset_requested',
  '/reset-password': 'auth.password_reset_completed',
};
```

In `server/utils/auth.ts`: remove the inline `AUTH_PATH_MAP` (lines 269-274), import it (`import { AUTH_PATH_MAP } from "./authAuditMap";`), and fix the target array at line 287 — replace `"forget-password"` with `"/request-password-reset"`:

```typescript
                } else if (
                    ["/sign-in/email", "/sign-up/email", "/request-password-reset"]
                        .includes(ctx.path)
                ) {
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm vitest run server/utils/authAuditMap.test.ts` → PASS.
Run: `pnpm typecheck` → green.

- [ ] **Step 5: Commit**

```bash
git add server/utils/auth.ts server/utils/authAuditMap.ts server/utils/authAuditMap.test.ts
git commit -m "fix(audit): correct password-reset endpoint mapping (/request-password-reset)"
```

---

### Task 13: Add missing critical env vars to `REQUIRED_ENV` (#14)

**Files:**
- Modify: `server/plugins/0.validate-env.ts` (`REQUIRED_ENV`, lines 13-38)
- Test: `server/plugins/validateEnv.test.ts` (test the missing-key detection on the exported list)

**Interfaces:**
- Consumes: nothing.
- Produces: `REQUIRED_ENV` includes `NUXT_GOOGLE_CLIENT_ID`, `NUXT_GOOGLE_CLIENT_SECRET`, `NUXT_RESEND_WEBHOOK_SECRET`.

- [ ] **Step 1: Export `REQUIRED_ENV` and write the failing test**

The list is module-private. Export it. Create `server/plugins/validateEnv.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { REQUIRED_ENV } from "./0.validate-env";

describe("REQUIRED_ENV", () => {
  it("includes Google OAuth keys (dereferenced with ! in auth.ts)", () => {
    expect(REQUIRED_ENV).toContain("NUXT_GOOGLE_CLIENT_ID");
    expect(REQUIRED_ENV).toContain("NUXT_GOOGLE_CLIENT_SECRET");
  });
  it("includes the Resend webhook secret (used to verify inbound webhooks)", () => {
    expect(REQUIRED_ENV).toContain("NUXT_RESEND_WEBHOOK_SECRET");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/plugins/validateEnv.test.ts`
Expected: FAIL — `REQUIRED_ENV` not exported / keys missing.

- [ ] **Step 3: Implement**

In `server/plugins/0.validate-env.ts`, change `const REQUIRED_ENV` to `export const REQUIRED_ENV` and add the three keys with grouped comments:

```typescript
    // Auth — Google OAuth (dereferenced with `!` in auth.ts:258-259)
    "NUXT_GOOGLE_CLIENT_ID",
    "NUXT_GOOGLE_CLIENT_SECRET",
    // Webhook — Resend inbound signature verification (emailWebhook.service.ts)
    "NUXT_RESEND_WEBHOOK_SECRET",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run server/plugins/validateEnv.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/plugins/0.validate-env.ts server/plugins/validateEnv.test.ts
git commit -m "fix(env): require Google OAuth + Resend webhook secret at boot"
```

> **Release note**: before deploying to prod, confirm these three are set on Vercel (memory flags some prod secrets as placeholders). A missing value now fails the boot by design.

---

## Cluster 5 — Efficiency & cleanup

### Task 14: Memoize `useServerAuth()` unconditionally

**Files:**
- Modify: `server/utils/auth.ts` (`useServerAuth`, lines 441-450)
- Test: `server/utils/useServerAuth.test.ts` (assert one instance is reused)

**Interfaces:**
- Consumes: `createBetterAuth`.
- Produces: `useServerAuth()` returns the same memoized instance across calls (was rebuilt per call on the vercel preset).

- [ ] **Step 1: Write the failing test**

Create `server/utils/useServerAuth.test.ts`. Because `createBetterAuth` is heavy, assert identity of the returned reference across two calls. This requires the module to not depend on a live DB at import; if `createBetterAuth` can't run in the test env, instead assert the source no longer branches on `preset` (a lighter guard):

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("useServerAuth memoization", () => {
  it("does not rebuild per call (no preset branch that returns a fresh instance)", () => {
    const src = readFileSync(new URL("./auth.ts", import.meta.url), "utf8");
    // The vercel branch that called createBetterAuth() on every call must be gone.
    expect(src).not.toMatch(/preset\s*==\s*["']node-server["']/);
    expect(src).toMatch(/if\s*\(!_auth\)/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/utils/useServerAuth.test.ts`
Expected: FAIL — the `preset == "node-server"` branch is present.

- [ ] **Step 3: Implement**

In `server/utils/auth.ts`, replace `useServerAuth` (lines 441-450):

```typescript
export const useServerAuth = () => {
    // Memoize unconditionally: createBetterAuth builds the whole Better Auth
    // stack (drizzle adapter, org/2FA/Creem plugins). Its inputs (runtimeConfig,
    // getDB(), cacheClient) are module singletons, so the instance can never
    // differ between calls — rebuilding per request only burned Vercel GB-ms.
    if (!_auth) {
        _auth = createBetterAuth();
    }
    return _auth;
};
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm vitest run server/utils/useServerAuth.test.ts` → PASS.
Run: `pnpm typecheck` → green. Confirm the `preset` runtimeConfig key has no other consumer (grep `runtimeConfig.preset` / `\.preset`); if unused elsewhere, note it as removable but DON'T remove in this task (out of scope).

- [ ] **Step 5: Commit**

```bash
git add server/utils/auth.ts server/utils/useServerAuth.test.ts
git commit -m "perf(auth): memoize useServerAuth (stop rebuilding Better Auth per request)"
```

---

### Task 15: Small cleanups (dead ternary, dead config keys, siteMode dup, dead method)

**Files:**
- Modify: `server/utils/drivers.ts` (`cacheClient.set` dead `JSON.stringify` ternary, line 79)
- Modify: `server/utils/runtimeConfig.ts` (remove `githubClientId`/`githubClientSecret`/`openaiApiKey`)
- Modify: `server/utils/siteMode.ts` (extract shared `readOverride()`)
- Modify: `server/services/file/rateLimiter.ts` (remove dead `getCurrentCount`)

**Interfaces:**
- Consumes: nothing.
- Produces: no behaviour change — pure cleanup. Verify each "dead" thing is unreferenced by grep before removing.

- [ ] **Step 1: Verify each removal target is unreferenced**

```bash
grep -rn "getCurrentCount" server --include="*.ts"        # expect: only rateLimiter.ts definition
grep -rn "githubClientId\|githubClientSecret\|openaiApiKey" server --include="*.ts"  # expect: only runtimeConfig.ts
```
Expected: no external consumers. If any exist, leave that item and note it.

- [ ] **Step 2: Apply the cleanups**

`server/utils/drivers.ts` line 79 — `value` is typed `string`, so the `JSON.stringify` branch is dead:

```typescript
        const stringValue = value;
```
(Or inline `value` at the two use sites. Keep the variable name to minimize the diff.)

`server/utils/runtimeConfig.ts` — delete the `githubClientId`, `githubClientSecret` (lines ~30-31) and `openaiApiKey` (line ~53) keys and any matching `.env` runtime mapping.

`server/utils/siteMode.ts` — **do NOT extract a shared `readOverride` that swallows errors**: after Task 3, `getServerSiteMode` and `getSiteModeStatus` have DIFFERENT error policies (reader holds last-known memo; diagnostic returns null). A shared error-swallowing helper would re-introduce bug #5 in the reader. Instead, extract only the pure parse (no try/catch):

```typescript
/** Parses a raw override value; null when absent. Does NOT catch — callers
 *  own their Upstash-error policy (reader holds memo, diagnostic returns null). */
function parseOverride(raw: string | null): SiteMode | null {
  return raw ? resolveSiteMode(raw) : null;
}
```
Use `parseOverride(await strictCacheClient.get(SITE_MODE_OVERRIDE_KEY))` inside each function's own try/catch, keeping the distinct catch bodies from Task 3. This removes the duplicated `raw ? resolveSiteMode(raw) : null` expression without touching error policy. Confirm the Task 3 tests still pass.

`server/services/file/rateLimiter.ts` — delete the `getCurrentCount` method (lines 40-44).

- [ ] **Step 3: Run the full suite + typecheck**

Run: `pnpm typecheck` → green.
Run: `pnpm vitest run` → the whole suite green (siteMode tests from Task 3, rateLimiter.test.ts unaffected — `getCurrentCount` had no test).

- [ ] **Step 4: Commit**

```bash
git add server/utils/drivers.ts server/utils/runtimeConfig.ts server/utils/siteMode.ts server/services/file/rateLimiter.ts
git commit -m "chore(cleanup): dead ternary/config keys, siteMode readOverride dedup, dead getCurrentCount"
```

---

### Task 16: Move QStash signature verification behind `server/queue/` (provider abstraction)

**Files:**
- Create: `server/queue/verifyQStash.ts` (the `Receiver` verification)
- Modify: `server/api/jobs/[job].post.ts` (call the abstraction instead of `new Receiver`)
- Test: covered by keeping the existing jobs-route behaviour; add a thin unit test on the verify wrapper if the signing keys can be stubbed.

**Interfaces:**
- Consumes: `NUXT_QSTASH_CURRENT_SIGNING_KEY` / `NUXT_QSTASH_NEXT_SIGNING_KEY` (via `useRuntimeConfig`).
- Produces: `verifyQStashSignature({ signature, body, url }): Promise<boolean>` in `server/queue/`, so `@upstash/qstash`'s `Receiver` is no longer instantiated inside an API route.

- [ ] **Step 1: Read the current verification block**

Read `server/api/jobs/[job].post.ts` lines 1, 40-68 (in context). The `Receiver` construction + `receiver.verify(...)` moves into `server/queue/verifyQStash.ts`.

- [ ] **Step 2: Implement the abstraction**

Create `server/queue/verifyQStash.ts`:

```typescript
import { Receiver } from "@upstash/qstash";
import { runtimeConfig } from "~~/server/utils/runtimeConfig";

/**
 * Verifies a QStash request signature. Keeps the @upstash/qstash SDK behind the
 * server/queue abstraction (CLAUDE.md: never call a provider SDK directly in a
 * route). Returns false on any verification error (caller → 401).
 */
export async function verifyQStashSignature(args: {
  signature: string;
  body: string;
  url: string;
}): Promise<boolean> {
  const currentSigningKey = runtimeConfig.qstashCurrentSigningKey as string | undefined;
  const nextSigningKey = runtimeConfig.qstashNextSigningKey as string | undefined;
  if (!currentSigningKey) return false;
  const receiver = new Receiver({
    currentSigningKey,
    nextSigningKey: nextSigningKey ?? currentSigningKey,
  });
  try {
    return await receiver.verify({ signature: args.signature, body: args.body, url: args.url });
  } catch {
    return false;
  }
}
```

> Confirm the exact runtimeConfig key names for the signing keys by reading `server/utils/runtimeConfig.ts` (they map `NUXT_QSTASH_CURRENT_SIGNING_KEY` → `qstashCurrentSigningKey` or similar). Use the real names.

In `server/api/jobs/[job].post.ts`: remove the `import { Receiver } from '@upstash/qstash'` (line 1) and the inline `new Receiver` + `receiver.verify` block; replace with:

```typescript
import { verifyQStashSignature } from '~~/server/queue/verifyQStash'
```
```typescript
  const isValid = await verifyQStashSignature({ signature, body, url })
  if (!isValid) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })
  }
```

- [ ] **Step 3: Typecheck + run the suite**

Run: `pnpm typecheck` → green.
Run: `pnpm vitest run` → green.

- [ ] **Step 4: Commit**

```bash
git add server/queue/verifyQStash.ts "server/api/jobs/[job].post.ts"
git commit -m "refactor(queue): QStash signature verify behind server/queue abstraction"
```

---

### Task 17: Fix `verify-rate-limit.ts` dotenv order + Italian comment

**Files:**
- Modify: `server/database/seed/verify-rate-limit.ts` (dotenv before the drivers import; English comment)

**Interfaces:**
- Consumes: nothing.
- Produces: the seed script loads the correct env (dev vs prod) BEFORE `drivers`/`runtimeConfig` are imported, with `override: true`.

- [ ] **Step 1: Read the current script head**

Read `server/database/seed/verify-rate-limit.ts` lines 1-35. The `config({ path })` currently runs after hoisted imports (`drivers`, `runtimeConfig`), so it's inert for prod (same class as the `db:migrate:prod` gotcha), and line 31 has an Italian comment `// cleanup sempre`.

- [ ] **Step 2: Reorder dotenv + translate the comment**

Move the dotenv load into a side-effect import that runs FIRST. Create `server/database/seed/loadEnv.ts`:

```typescript
import { config } from "dotenv";
// Load the right env BEFORE any module that snapshots runtimeConfig/drivers.
config({ path: process.env.NUXT_ENV === "prod" ? ".env.prod" : ".env", override: true });
```

At the very top of `verify-rate-limit.ts`, make it the first import (before `drivers`/`runtimeConfig`):

```typescript
import "./loadEnv";
```

Remove the old inline `config({ path: ... })` call. Change the Italian comment `// cleanup sempre` to `// always clean up`.

- [ ] **Step 3: Verify the script runs**

Run: `NUXT_ENV= tsx server/database/seed/verify-rate-limit.ts` (or the documented invocation) against dev — confirm it exercises the dev Upstash without error. (No unit test; this is a dev script.)

- [ ] **Step 4: Commit**

```bash
git add server/database/seed/verify-rate-limit.ts server/database/seed/loadEnv.ts
git commit -m "fix(seed): load env before drivers import in verify-rate-limit; English comment"
```

---

## Final verification (before merge/push — all manual)

- [ ] `pnpm typecheck` → green.
- [ ] `pnpm vitest run` → full suite green (all new tests: strict client, ttl=0/memory-clear, siteMode strict, banStatus !row, authBanGate, invite idempotencyKey, email_events onConflict, job claim-lease + setNx, sign-in atomic limiter, clock-skew, audit map, REQUIRED_ENV, useServerAuth).
- [ ] `pnpm lint` → clean.
- [ ] **Migration 0011 to prod**: apply with the inline prod URL (`ep-dark-dream` endpoint), NOT `pnpm db:migrate:prod`. Confirm the column + unique index exist on prod.
- [ ] **Prod env vars**: confirm `NUXT_GOOGLE_CLIENT_ID`, `NUXT_GOOGLE_CLIENT_SECRET`, `NUXT_RESEND_WEBHOOK_SECRET` are set (non-placeholder) on Vercel prod — otherwise the boot fails by design (Task 13).
- [ ] Update memory `ceremly-upstash-review-fixes` with the merged commit range.
- [ ] Manual push (never automatic — project convention).

## Out of scope (tracked, not implemented here)
- #9 GDPR export deadlock — already fixed by 0166dab (`failStaleExports` wired in `user.service.ts:282`).
- Orphan no-TTL limiter key — documented accepted trade-off (`drivers.ts:36-37`).
- Sign-in 18/min sustained — tuning trade-off, not a bug.
- Unifying the three rate limiters / a universal idempotency primitive — YAGNI (keys/windows differ).
