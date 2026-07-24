# Task 4 Report: Missing webhook secret = loud alarm, not a silent 401

## Status: DONE

## What was implemented

1. **`server/api/webhooks/resend.post.ts`** — added a diagnostic check immediately after building the `headers` object and before the `try { parsed = verifyResendEvent(...) }` block. If `runtimeConfig.resendWebhookSecret` is falsy, the route now logs `console.error` and throws `{ statusCode: 500, statusMessage: "Webhook secret not configured" }` instead of letting `verifyResendEvent` throw and get caught as a 401. Added the `runtimeConfig` import (`~~/server/utils/runtimeConfig`), matching the route's existing `~~/` alias style.

2. **`server/plugins/emailConfigCheck.ts`** (new) — Nitro startup plugin. In a real production deployment (`runtimeConfig.public.isProdDeployment === true`), logs `console.error` listing any of `NUXT_RESEND_WEBHOOK_SECRET`, `NUXT_RESEND_API_KEY`, `appNotifyEmail`, `appEventsNotifyEmail` that are missing. Log-only (never throws) — a misconfigured deploy becomes visible in monitoring immediately instead of manifesting later as silently-dropped webhook events or malformed `from` addresses.

3. **`server/api/webhooks/resend.post.test.ts`** — added a mutable `runtimeConfig` mock (`vi.hoisted` object, reassigned per test, reset to a truthy default in `beforeEach`) and a new test case asserting the empty-secret path throws `statusCode: 500` and never reaches `verifyResendEvent`.

## Deviation from the brief (and why)

The brief's Step 4 code and its "Facts you need" section both state `runtimeConfig.isProdDeployment` as a top-level property, citing `server/utils/runtimeConfig.ts:83`. I read that file directly: line 83 (`isProdDeployment: process.env.VERCEL_ENV === "production"`) sits **inside** the `public: { ... }` object literal, which opens at line 75 and closes at line 100. There is no top-level `isProdDeployment` on `runtimeConfig`.

I confirmed this isn't a one-off misreading by grepping every other usage of `isProdDeployment` in the codebase:
- `server/utils/creem.ts:93` → `runtimeConfig.public.isProdDeployment`
- `server/services/checkout.service.ts:52` → `runtimeConfig.public.isProdDeployment`
- `server/services/eventReconcile.service.ts:45` → `runtimeConfig.public.isProdDeployment`
- Both `checkout.service.test.ts` and `eventReconcile.service.test.ts` mock it as `{ public: { isProdDeployment: false } }`.

Every real usage in the repo is `runtimeConfig.public.isProdDeployment`, never a bare top-level property. The brief itself authorizes this correction: "Verify `runtimeConfig.isProdDeployment` exists... If the property name differs, use the actual one." I implemented the plugin with `runtimeConfig.public.isProdDeployment`, which also matches the repo's established mocking convention (seen in `checkout.service.test.ts`). Typecheck (which would fail on a nonexistent property under the project's TypeScript config) confirms this is the correct path — the brief's literal top-level form would not have compiled.

(Note: the `advisor` tool was disabled for this conversation — one call was attempted right after finding this discrepancy and it returned "temporarily disabled." I proceeded on direct, verified evidence: file read + repo-wide grep + typecheck as the ultimate arbiter, rather than guessing or blocking on an unavailable tool.)

## Tests + results

### TDD Evidence

**RED** — after adding the test but before touching the route:
```
$ pnpm vitest run server/api/webhooks/resend.post.test.ts
PASS (5) FAIL (1)

1. POST /api/webhooks/resend responds 500 (not 401) when the webhook secret is not configured
   AssertionError: expected undefined to be 500
       at server/api/webhooks/resend.post.test.ts:96:41
```
Failed for the right reason: with no guard in the route, `verifyResendEvent` (mocked to always succeed regardless of the real secret value) lets the handler resolve normally with `{ ok: true }` — nothing throws, so `.catch` never fires and `err` stays `undefined`. This confirms the guard did not exist yet. (Not a 401 in this suite's mock setup specifically because `verifyResendEvent` itself is mocked to always succeed and ignores the secret value — but the absence of any thrown error at all is the correct "before" signal, proving no misconfig guard existed.)

**GREEN** — after implementing the route diagnostic:
```
$ pnpm vitest run server/api/webhooks/resend.post.test.ts
PASS (6) FAIL (0)
```

### Final verification

```
$ pnpm vitest run server/api/webhooks/resend.post.test.ts && pnpm typecheck
PASS (6) FAIL (0)
... (typecheck exit code 0, no type errors — only pre-existing unrelated nuxt-site-config/robots warnings)

$ pnpm vitest run
PASS (159) FAIL (0)
```

Baseline was 158/158 (verified before starting). Final is 159/159 (158 + 1 new test). Exactly as expected.

## Files changed

- `server/api/webhooks/resend.post.ts` (modified, +9/-0)
- `server/api/webhooks/resend.post.test.ts` (modified, +15/-0)
- `server/plugins/emailConfigCheck.ts` (new, 18 lines)

Commit: `3ba6a12` — `fix(email): surface missing webhook secret (500 + startup guard) instead of silent 401`

Staged explicitly via `git add server/api/webhooks/resend.post.ts server/plugins/emailConfigCheck.ts server/api/webhooks/resend.post.test.ts` (never `git add -A`). Working tree's unrelated dirty files (`graphify-out/`, this report file itself pre-edit, etc.) were left untouched — confirmed via `git status --short` before and after commit.

## Self-review

- Route diagnostic is placed exactly where the brief specifies (after `headers`, before `try { verifyResendEvent }`).
- The 500 case is checked BEFORE the try/catch that would otherwise turn an empty-secret svix failure into a 401 — verified `verifyResendEvent` is never called when the secret is empty (`expect(verifyResendEvent).not.toHaveBeenCalled()` in the new test).
- The startup plugin follows the exact structural pattern of the existing `server/plugins/0.validate-env.ts` (bare `defineNitroPlugin`, no import needed — it's Nitro-auto-imported), confirmed by reading that file first.
- The new plugin is log-only (never throws), which is intentional per the brief — it doesn't duplicate or conflict with `0.validate-env.ts`'s prod-fatal throw behavior for `NUXT_RESEND_API_KEY` (that plugin already treats that specific var as boot-fatal in prod; this new plugin's job is broader, softer visibility for the webhook-secret + notify-email vars that `0.validate-env.ts` doesn't cover).
- Test mock design: used a mutable `vi.hoisted` object (`mockRuntimeConfig`) rather than re-mocking per test, since `vi.mock` factories only run once at hoist time. Reset to a truthy default in `beforeEach` so the pre-existing 5 tests are unaffected. This mirrors the static-object mocking convention seen in `checkout.service.test.ts`, adapted for mutability since this route needed the secret to vary across tests within the same file.
- Verified the two new `@typescript-eslint/no-explicit-any` lint findings my test additions introduce are stylistically identical to the file's other 7 pre-existing `any` casts (`(handler as any)({})`, `(err as any).statusCode` — the file's established idiom for invoking the untyped default-export handler and inspecting thrown errors in tests). Confirmed via `git stash`/`eslint`/`git stash pop` comparison that `pnpm lint` already fails project-wide (87 pre-existing errors across 43 files, unrelated to this task) before my change, and that the pre-existing `import/first` and `no-unused-vars` findings in this specific test file predate my edit (same violations, just shifted line numbers due to my insertions above them). No lint gate was named in the task's acceptance criteria (only typecheck + vitest), so this was not chased further, but is disclosed here for transparency.
- Confirmed no numeric-prefix convention was violated: the brief explicitly names the new file `emailConfigCheck.ts` with no prefix; the only existing plugin (`0.validate-env.ts`) is prefixed, but since the new plugin never throws, execution order relative to it has no functional consequence.

## Concerns

- **Advisor tool was unavailable** for this task (returned "temporarily disabled for this conversation" on the one call attempted, made right after discovering the `isProdDeployment` path discrepancy). I proceeded using direct evidence (file reads, repo-wide grep, and ultimately typecheck as the objective arbiter) rather than guessing or blocking. Flagging this so a human reviewer knows the second-opinion step didn't happen as normally expected on this kind of judgment call.
- Pre-existing project-wide lint debt (87 errors, 43 files) is untouched by this task and was not in scope — noted only because my 2 added `any` casts nudge this one file's count from 9 to 11, in the same idiom as its immediate neighbors.
