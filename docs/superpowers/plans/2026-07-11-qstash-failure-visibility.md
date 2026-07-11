# QStash Failure Visibility (F3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface permanently-failed invite/reminder email deliveries to the planner (today: DLQ is silent, dashboard shows "Sent" forever) via QStash failureCallback → `guest_activities` + Resend bounce → `guest_activities`, exposed in the guest timeline and guest list.

**Architecture:** QStash `failureCallback` (fires only after ALL retries are exhausted) hits a new signed endpoint `/api/jobs/failure` which records an `invite_failed`/`reminder_failed` activity. The Resend webhook additionally projects `bounced`/`complained`/`failed` events into an `email_bounced` activity. The guest list gains a derived `deliveryFailed` flag + summary count; the existing guest timeline renders the new activity types via three new i18n labels.

**Tech Stack:** Nuxt 4 / Nitro routes, `@upstash/qstash` Receiver, Drizzle ORM (Neon HTTP), Zod, Vitest, vue-i18n.

## Global Constraints

- Comments/JSDoc/tests/logs in ENGLISH; product/UI strings in ITALIAN (IT-first, EN alternate) — project language convention.
- NEVER put the character `@` inside vue-i18n message strings (it breaks the whole locale file — project gotcha).
- Multi-tenancy: every tenant query filters by `organizationId`.
- Thin routes: logic in services/`server/queue/`, routes validate + delegate.
- `guest_activities.type` is a free `text` column → NO DB migration needed.
- QStash signs failure callbacks like normal messages: verify with `Receiver` over the RAW body, `url` = the callback URL itself.
- `/api/jobs/**` already has `rateLimiter/xssValidator/corsHandler` disabled in `nuxt.config.ts:188-194` and is exempt from site-mode/block-bots middleware — the new static route `/api/jobs/failure` inherits this (Nitro static routes win over the `[job]` param route).
- Run `pnpm vitest run` (full suite) and `pnpm typecheck` before each commit.

---

### Task 1: failureCallback URL helper + publish opt-in

**Files:**
- Modify: `server/queue/types.ts` (after `buildJobUrl`, line ~58)
- Modify: `server/queue/index.ts:43-53` (`dispatch`)
- Create: `server/queue/dispatch.test.ts`

**Interfaces:**
- Produces: `buildFailureCallbackUrl(baseURL: string): string` → `{base}/api/jobs/failure` (trailing-slash normalized like `buildJobUrl`). Used by Task 3's route for signature verification.
- Produces: `dispatch()` publishes with `failureCallback` for `send-invite-email` and `send-reminder-email` ONLY.

- [ ] **Step 1: Write the failing tests**

Create `server/queue/dispatch.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const publishJSON = vi.fn(() => Promise.resolve({ messageId: "msg_1" }));

vi.mock("@upstash/qstash", () => ({
    Client: class {
        publishJSON = (...a: unknown[]) => publishJSON(...a);
    },
}));
vi.mock("~~/server/utils/runtimeConfig", () => ({
    runtimeConfig: {
        qstashToken: "tok_test",
        qstashUrl: "",
        public: { baseURL: "https://app.test/" },
    },
}));

import { buildFailureCallbackUrl } from "~~/server/queue/types";

describe("buildFailureCallbackUrl", () => {
    it("normalizes the trailing slash", () => {
        expect(buildFailureCallbackUrl("https://app.test/")).toBe("https://app.test/api/jobs/failure");
        expect(buildFailureCallbackUrl("https://app.test")).toBe("https://app.test/api/jobs/failure");
    });
});

describe("dispatch failureCallback opt-in", () => {
    beforeEach(() => {
        vi.resetModules();
        publishJSON.mockClear();
    });

    it("email jobs publish WITH failureCallback", async () => {
        const { dispatch } = await import("~~/server/queue");
        await dispatch("send-invite-email", { guestId: "g1" });
        expect(publishJSON).toHaveBeenCalledWith(expect.objectContaining({
            url: "https://app.test/api/jobs/send-invite-email",
            failureCallback: "https://app.test/api/jobs/failure",
        }));
    });

    it("non-email jobs publish WITHOUT failureCallback", async () => {
        const { dispatch } = await import("~~/server/queue");
        await dispatch("data-export", { exportId: "x1", userId: "u1" });
        const arg = publishJSON.mock.calls[0]![0] as Record<string, unknown>;
        expect(arg.failureCallback).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run server/queue/dispatch.test.ts`
Expected: FAIL — `buildFailureCallbackUrl` is not exported.

- [ ] **Step 3: Implement**

In `server/queue/types.ts`, after `buildJobUrl`:

```ts
/**
 * Failure-callback URL — QStash calls it ONLY after all retries are exhausted.
 * Signed like a normal message: the consumer verifies with Receiver over this URL.
 */
export function buildFailureCallbackUrl(baseURL: string): string {
    return `${baseURL.replace(/\/+$/, '')}/api/jobs/failure`
}
```

In `server/queue/index.ts`: import `buildFailureCallbackUrl` from `./types`, add above `dispatch`:

```ts
/** Jobs whose permanent failure must be visible to the planner (activity written by the failure callback). */
const FAILURE_CALLBACK_JOBS: ReadonlySet<JobName> = new Set(['send-invite-email', 'send-reminder-email'])
```

and change the `publishJSON` call to:

```ts
  await client.publishJSON({
    url: buildJobUrl(baseURL, job),
    body: payload,
    // NB: no contentBasedDeduplication. The payload is just {guestId}, identical
    // across sends, so content-dedup silently collapsed a DELIBERATE re-send to
    // an already-invited guest (a real UI feature: explicit guest selection).
    // At-most-once on QStash RETRIES is handled at the consumer (upstash-message-id
    // dedup); accidental double-send is guarded in the UI (button disabled while
    // sending + confirm dialog + the default flow only targets sentAt===null guests).
    retries: 3,
    // Permanent failure (all retries exhausted → DLQ) must not stay silent:
    // the callback records an invite_failed/reminder_failed guest activity.
    ...(FAILURE_CALLBACK_JOBS.has(job)
      ? { failureCallback: buildFailureCallbackUrl(baseURL) }
      : {}),
  })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run server/queue/dispatch.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/queue/types.ts server/queue/index.ts server/queue/dispatch.test.ts
git commit -m "feat(queue): publish email jobs with QStash failureCallback"
```

---

### Task 2: failure-callback processing (pure service) + new activity types

**Files:**
- Modify: `shared/types/ceremly.ts:280-286` (`GuestActivityType`)
- Modify: `server/queue/types.ts` (add `failureCallbackSchema` + `parseFailureCallback`)
- Create: `server/queue/failureCallback.ts`
- Create: `server/queue/failureCallback.test.ts`

**Interfaces:**
- Consumes: `parseJobPayload`, `isJobName` from `server/queue/types.ts`; `findGuestForEmail(guestId)` → `{ guest, event, responseId } | null` and `insertActivities(rows)` from `server/repositories/distributionRepository.ts`.
- Produces: `processJobFailure(raw: unknown): Promise<'recorded' | 'skipped'>` — used by Task 3's route. New `GuestActivityType` members: `'invite_failed' | 'reminder_failed' | 'email_bounced'` (the third is used by Task 4).

- [ ] **Step 1: Extend the shared union**

In `shared/types/ceremly.ts` replace lines 280-286 with:

```ts
export type GuestActivityType =
  | 'invite_sent'
  | 'link_opened'
  | 'email_opened'
  | 'rsvp_submitted'
  | 'rsvp_updated'
  | 'reminder_sent'
  | 'invite_failed'
  | 'reminder_failed'
  | 'email_bounced'
```

- [ ] **Step 2: Write the failing tests**

Create `server/queue/failureCallback.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const findGuestForEmail = vi.fn();
const insertActivities = vi.fn();

vi.mock("~~/server/repositories/distributionRepository", () => ({
    findGuestForEmail: (...a: unknown[]) => findGuestForEmail(...a),
    insertActivities: (...a: unknown[]) => insertActivities(...a),
}));

import { processJobFailure } from "~~/server/queue/failureCallback";

function callbackBody(job: string, payload: object, overrides: object = {}) {
    return {
        sourceMessageId: "msg_src_1",
        url: `https://app.test/api/jobs/${job}`,
        sourceBody: Buffer.from(JSON.stringify(payload)).toString("base64"),
        dlqId: "dlq_1",
        retried: 3,
        maxRetries: 3,
        status: 500,
        ...overrides,
    };
}

const guestRow = {
    guest: { id: "g1", organizationId: "o1", eventId: "e1" },
    event: { id: "e1" },
    responseId: null,
};

beforeEach(() => {
    [findGuestForEmail, insertActivities].forEach((m) => m.mockReset());
    findGuestForEmail.mockResolvedValue(guestRow);
});

describe("processJobFailure", () => {
    it("invite job failure → invite_failed activity with dlq meta", async () => {
        const res = await processJobFailure(callbackBody("send-invite-email", { guestId: "g1" }));
        expect(res).toBe("recorded");
        expect(insertActivities).toHaveBeenCalledWith([{
            organizationId: "o1",
            eventId: "e1",
            guestId: "g1",
            type: "invite_failed",
            meta: { messageId: "msg_src_1", dlqId: "dlq_1" },
        }]);
    });

    it("reminder job failure → reminder_failed activity with reminderId", async () => {
        const res = await processJobFailure(callbackBody("send-reminder-email", { guestId: "g1", reminderId: "r1" }));
        expect(res).toBe("recorded");
        expect(insertActivities).toHaveBeenCalledWith([expect.objectContaining({
            type: "reminder_failed",
            meta: { messageId: "msg_src_1", dlqId: "dlq_1", reminderId: "r1" },
        })]);
    });

    it("non-email job (data-export) → skipped, no activity", async () => {
        const res = await processJobFailure(callbackBody("data-export", { exportId: "x", userId: "u" }));
        expect(res).toBe("skipped");
        expect(insertActivities).not.toHaveBeenCalled();
    });

    it("malformed body → skipped without throwing", async () => {
        const res = await processJobFailure({ nope: true });
        expect(res).toBe("skipped");
        expect(insertActivities).not.toHaveBeenCalled();
    });

    it("guest deleted between failure and callback → skipped", async () => {
        findGuestForEmail.mockResolvedValue(null);
        const res = await processJobFailure(callbackBody("send-invite-email", { guestId: "gone" }));
        expect(res).toBe("skipped");
        expect(insertActivities).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run server/queue/failureCallback.test.ts`
Expected: FAIL — module `server/queue/failureCallback` does not exist.

- [ ] **Step 4: Implement schema + service**

In `server/queue/types.ts`, after `parseJobPayload` (Zod `z` is already imported):

```ts
/**
 * QStash failure-callback body (subset we consume). Sent AFTER all retries are
 * exhausted; `sourceBody` is the base64 of the original job payload and `url`
 * is the original destination ({base}/api/jobs/{job}).
 */
const failureCallbackSchema = z.object({
    sourceMessageId: z.string().min(1),
    url: z.string().min(1),
    sourceBody: z.string().min(1),
    dlqId: z.string().optional(),
    retried: z.number().optional(),
    maxRetries: z.number().optional(),
    status: z.number().optional(),
})

export type FailureCallbackBody = z.infer<typeof failureCallbackSchema>

export function parseFailureCallback(raw: unknown): FailureCallbackBody {
    return failureCallbackSchema.parse(raw)
}
```

Create `server/queue/failureCallback.ts`:

```ts
import { isJobName, parseFailureCallback, parseJobPayload } from './types'
import type { JobName, JobPayload } from './types'
import { findGuestForEmail, insertActivities } from '~~/server/repositories/distributionRepository'

/** Jobs whose permanent failure is projected into the guest timeline. */
const FAILURE_ACTIVITY = {
    'send-invite-email': 'invite_failed',
    'send-reminder-email': 'reminder_failed',
} as const

type FailureJob = keyof typeof FAILURE_ACTIVITY

/**
 * Record a guest activity for a permanently-failed email job (QStash failure
 * callback = all retries exhausted, message moved to the DLQ). Non-email jobs
 * and unparseable callbacks are skipped: a callback retry cannot fix them, so
 * the route must still answer 2xx. DB errors THROW → the route responds 500
 * and QStash retries the callback.
 */
export async function processJobFailure(raw: unknown): Promise<'recorded' | 'skipped'> {
    let cb
    try {
        cb = parseFailureCallback(raw)
    } catch (err) {
        console.error('[jobs:failure] malformed callback body:', err)
        return 'skipped'
    }

    const jobName = cb.url.match(/\/api\/jobs\/([a-z-]+)$/)?.[1]
    if (!jobName || !isJobName(jobName) || !(jobName in FAILURE_ACTIVITY)) {
        return 'skipped'
    }
    const job = jobName as FailureJob

    let payload: JobPayload<FailureJob>
    try {
        payload = parseJobPayload(job as JobName, JSON.parse(Buffer.from(cb.sourceBody, 'base64').toString('utf8'))) as JobPayload<FailureJob>
    } catch (err) {
        console.error(`[jobs:failure] invalid sourceBody for job "${job}":`, err)
        return 'skipped'
    }

    const row = await findGuestForEmail(payload.guestId)
    if (!row) {
        console.warn(`[jobs:failure] guest ${payload.guestId} not found, skip`)
        return 'skipped'
    }
    const { guest } = row

    await insertActivities([{
        organizationId: guest.organizationId,
        eventId: guest.eventId,
        guestId: guest.id,
        type: FAILURE_ACTIVITY[job],
        meta: {
            messageId: cb.sourceMessageId,
            ...(cb.dlqId ? { dlqId: cb.dlqId } : {}),
            ...('reminderId' in payload ? { reminderId: payload.reminderId } : {}),
        },
    }])
    return 'recorded'
}
```

NOTE for the implementer: if `insertActivities`'s row type rejects the new
`type` values, the type union it uses is `GuestActivityType` — Step 1 already
extended it; re-run `pnpm typecheck` to confirm.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run server/queue/failureCallback.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add shared/types/ceremly.ts server/queue/types.ts server/queue/failureCallback.ts server/queue/failureCallback.test.ts
git commit -m "feat(queue): process QStash failure callbacks into guest activities"
```

---

### Task 3: signed route `/api/jobs/failure`

**Files:**
- Create: `server/api/jobs/failure.post.ts`

**Interfaces:**
- Consumes: `processJobFailure` (Task 2), `buildFailureCallbackUrl` (Task 1), `cacheClient` from `~~/server/utils/drivers`.
- Produces: HTTP endpoint; QStash calls it with the same signature scheme as job deliveries.

- [ ] **Step 1: Implement the route**

Create `server/api/jobs/failure.post.ts` (mirrors the verification flow of `server/api/jobs/[job].post.ts` — static route, wins over the `[job]` param route in Nitro's router):

```ts
import { Receiver } from '@upstash/qstash'
import { processJobFailure } from '~~/server/queue/failureCallback'
import { buildFailureCallbackUrl } from '~~/server/queue/types'
import { cacheClient } from '~~/server/utils/drivers'

/** TTL of the dedup key (24h): covers QStash callback redelivery. */
const CALLBACK_DEDUPE_TTL_SECONDS = 24 * 60 * 60

/**
 * QStash failure-callback consumer (fires once per message, AFTER all retries
 * are exhausted). Authorization is the QStash HMAC signature over the RAW
 * body, verified against THIS endpoint's URL. Unparseable/irrelevant bodies
 * are answered 200 (a callback retry cannot fix them); DB errors bubble to a
 * 500 so QStash retries the callback.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  const currentSigningKey = config.qstashCurrentSigningKey as string | undefined
  const nextSigningKey = config.qstashNextSigningKey as string | undefined
  if (!currentSigningKey) {
    console.error('[jobs:failure] QStash signing keys not configured')
    throw createError({ statusCode: 500, statusMessage: 'Jobs not configured' })
  }

  const signature = getHeader(event, 'upstash-signature')
  if (!signature) {
    throw createError({ statusCode: 401, statusMessage: 'Missing signature' })
  }

  const body = await readRawBody(event)
  if (!body) {
    throw createError({ statusCode: 400, statusMessage: 'Empty body' })
  }

  const baseURL = config.public.baseURL as string | undefined
  if (!baseURL) {
    console.error('[jobs:failure] public.baseURL not configured — cannot verify QStash signature')
    throw createError({ statusCode: 500, statusMessage: 'Jobs not configured' })
  }

  const receiver = new Receiver({
    currentSigningKey,
    nextSigningKey: nextSigningKey ?? currentSigningKey,
  })

  let isValid = false
  try {
    isValid = await receiver.verify({ signature, body, url: buildFailureCallbackUrl(baseURL) })
  } catch {
    isValid = false
  }
  if (!isValid) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })
  }

  // Callback redelivery dedup (same pattern as the job consumer): key on the
  // CALLBACK's message id, set only after a successful write.
  const messageId = getHeader(event, 'upstash-message-id')
  const dedupeKey = messageId ? `job:failcb:${messageId}` : undefined
  if (dedupeKey && (await cacheClient.get(dedupeKey))) {
    return { ok: true, deduped: true }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    console.error('[jobs:failure] body is not JSON, ignoring')
    return { ok: true, skipped: true }
  }

  const outcome = await processJobFailure(parsed)

  if (dedupeKey) {
    await cacheClient.set(dedupeKey, '1', CALLBACK_DEDUPE_TTL_SECONDS)
  }

  return { ok: true, outcome }
})
```

- [ ] **Step 2: Full suite + typecheck**

Run: `pnpm vitest run && pnpm typecheck`
Expected: all green (route logic is covered by Task 2's service tests; the signature flow is byte-for-byte the consumer's, already exercised in prod).

- [ ] **Step 3: Commit**

```bash
git add server/api/jobs/failure.post.ts
git commit -m "feat(api): signed QStash failure-callback endpoint"
```

---

### Task 4: Resend webhook → `email_bounced` activity

**Files:**
- Modify: `server/services/emailWebhook.service.ts:76-89` (switch cases)
- Modify: `server/services/emailWebhook.service.test.ts`

**Interfaces:**
- Consumes: `insertActivities` from `~~/server/repositories/distributionRepository`; existing `ctx` (`findSeedContext`) already carries `organizationId/guestId/eventId`.
- Produces: `email_bounced` activities (type added in Task 2) with `meta: { messageId, reason }`, `reason ∈ 'bounce' | 'complaint' | 'failed'`.

- [ ] **Step 1: Write the failing tests**

In `server/services/emailWebhook.service.test.ts` add to the `vi.hoisted` block:

```ts
    insertActivities: vi.fn(),
```

(destructure it too: `const { upsertSuppression, insertEmailEvent, recordGuestOpen, findSeedContext, insertActivities } = vi.hoisted(...)`), add the mock after line 11:

```ts
vi.mock("../repositories/distributionRepository", () => ({ insertActivities }));
```

and add the tests inside the existing `describe`:

```ts
    it("bounce with guest context → email_bounced activity", async () => {
        await handleResendEvent({ type: "email.bounced", created_at: "2026-01-01T00:00:00Z",
            data: { email_id: "m1", from: "noreply@airowlgasga.dev", to: ["a@x.com"], bounce: { subType: "General" } } });
        expect(insertActivities).toHaveBeenCalledWith([{
            organizationId: "o1", eventId: "e1", guestId: "g1",
            type: "email_bounced", meta: { messageId: "m1", reason: "bounce" },
        }]);
    });

    it("failed with guest context → email_bounced activity with reason failed", async () => {
        await handleResendEvent({ type: "email.failed", created_at: "2026-01-01T00:00:00Z",
            data: { email_id: "m3", from: "noreply@airowlgasga.dev", to: ["a@x.com"] } });
        expect(insertActivities).toHaveBeenCalledWith([expect.objectContaining({
            type: "email_bounced", meta: { messageId: "m3", reason: "failed" },
        })]);
    });

    it("bounce WITHOUT guest context → no activity", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findSeedContext.mockResolvedValueOnce({ organizationId: "o1", guestId: null, eventId: null, emailType: "verification" } as any);
        await handleResendEvent({ type: "email.bounced", created_at: "2026-01-01T00:00:00Z",
            data: { email_id: "m2", from: "noreply@airowlgasga.dev", to: ["u@x.com"] } });
        expect(insertActivities).not.toHaveBeenCalled();
    });

    it("delivered → no activity", async () => {
        await handleResendEvent({ type: "email.delivered", created_at: "2026-01-01T00:00:00Z",
            data: { email_id: "m4", from: "noreply@airowlgasga.dev", to: ["a@x.com"] } });
        expect(insertActivities).not.toHaveBeenCalled();
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run server/services/emailWebhook.service.test.ts`
Expected: FAIL — `insertActivities` never called.

- [ ] **Step 3: Implement**

In `server/services/emailWebhook.service.ts`: add the import

```ts
import { insertActivities } from "../repositories/distributionRepository";
```

add a helper above `handleResendEvent`:

```ts
/**
 * Project a NEGATIVE delivery event into the guest timeline (guest_activities),
 * which is what the dashboard reads — email_events alone is write-only today.
 * The Svix layer already de-duplicates webhook redeliveries upstream.
 */
async function recordGuestDeliveryFailure(
    ctx: { organizationId: string | null; guestId: string | null; eventId: string | null } | undefined,
    messageId: string,
    reason: "bounce" | "complaint" | "failed",
): Promise<void> {
    if (!ctx?.guestId || !ctx.eventId || !ctx.organizationId) return;
    await insertActivities([{
        organizationId: ctx.organizationId,
        eventId: ctx.eventId,
        guestId: ctx.guestId,
        type: "email_bounced",
        meta: { messageId, reason },
    }]);
}
```

and change the switch cases (lines 76-89) to:

```ts
        case "email.bounced":
            await upsertSuppression({ email: recipient, reason: "hard_bounce", bounceSubtype: data.bounce?.subType });
            await insertEmailEvent({ ...baseEvent, type: "bounced" });
            await recordGuestDeliveryFailure(ctx, data.email_id, "bounce");
            break;
        case "email.complained":
            await upsertSuppression({ email: recipient, reason: "complaint" });
            await insertEmailEvent({ ...baseEvent, type: "complained" });
            await recordGuestDeliveryFailure(ctx, data.email_id, "complaint");
            break;
        case "email.failed":
            await insertEmailEvent({ ...baseEvent, type: "failed" });
            await recordGuestDeliveryFailure(ctx, data.email_id, "failed");
            break;
        case "email.delivered":
        case "email.delivery_delayed":
            await insertEmailEvent({ ...baseEvent, type: type.replace("email.", "") });
            break;
```

(NB: `email.failed` gets its own case — it previously shared the `delivered/delivery_delayed` fallthrough; the `type.replace` result for it is the literal `"failed"`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run server/services/emailWebhook.service.test.ts`
Expected: PASS (7 tests: 3 pre-existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add server/services/emailWebhook.service.ts server/services/emailWebhook.service.test.ts
git commit -m "feat(email): project bounce/complaint/failed into guest timeline"
```

---

### Task 5: `deliveryFailed` flag in the guest list

**Files:**
- Modify: `server/repositories/guestRepository.ts` (new query, after `findGuestsByEventWithResponse`)
- Modify: `server/services/guest.service.ts:94-121` (`listGuests`)
- Modify: `shared/types/ceremly.ts:263-268` (`GuestWithStatus`)
- Modify: `app/composables/useEventGuests.ts:20-29` (`GuestListSummary`)
- Modify: `server/services/guest.service.test.ts`

**Interfaces:**
- Consumes: `email_bounced`/`invite_failed`/`reminder_failed` activity types (Tasks 2/4).
- Produces: `GuestWithStatus.deliveryFailed: boolean`; `GuestListSummary.deliveryFailed: number`; repository `findDeliveryFailedGuestIds(organizationId, eventId): Promise<Set<string>>`. Task 6's UI reads both.

- [ ] **Step 1: Write the failing test**

In `server/services/guest.service.test.ts` the guest repository is mocked at line 12 with INLINE `vi.fn()` entries (line ~17: `findActivitiesByGuestScoped: vi.fn(), findGuestByIdScoped: vi.fn(), ...`) — inline fns are not referenceable from tests. Promote the two we need to top-level named fns (same pattern as `findEventByIdScoped` at line 3):

```ts
const findGuestsByEventWithResponse = vi.fn();
const findDeliveryFailedGuestIds = vi.fn(() => Promise.resolve(new Set<string>()));
```

and inside the `vi.mock("~~/server/repositories/guestRepository", ...)` factory replace the inline `findGuestsByEventWithResponse: vi.fn()` entry (if present — otherwise add it) and add `findDeliveryFailedGuestIds`, both delegating: `findGuestsByEventWithResponse: (...a: unknown[]) => findGuestsByEventWithResponse(...a), findDeliveryFailedGuestIds: (...a: unknown[]) => findDeliveryFailedGuestIds(...a),`.

Then add a new `describe("listGuests deliveryFailed", ...)` reusing the file's `fakeEvent` (line 27) and its `findEventByIdScoped` setup (mock it resolving `{ id: "e1", organizationId: "org_test" }` in a `beforeEach`, as the existing describes do):

```ts
    it("flags guests with a failed delivery and counts them in the summary", async () => {
        findGuestsByEventWithResponse.mockResolvedValue([
            { guest: { id: "g1", email: "a@x.com", firstOpenedAt: null, removedAt: null }, responseId: null, attending: null, companionsCount: null, submittedAt: null, responseUpdatedAt: null },
            { guest: { id: "g2", email: "b@x.com", firstOpenedAt: null, removedAt: null }, responseId: null, attending: null, companionsCount: null, submittedAt: null, responseUpdatedAt: null },
        ]);
        findDeliveryFailedGuestIds.mockResolvedValue(new Set(["g2"]));
        const { listGuests } = await import("~~/server/services/guest.service");
        const res = await listGuests(fakeEvent, "e1");
        expect(res.guests.find((g) => g.id === "g1")!.deliveryFailed).toBe(false);
        expect(res.guests.find((g) => g.id === "g2")!.deliveryFailed).toBe(true);
        expect(res.summary.deliveryFailed).toBe(1);
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/services/guest.service.test.ts`
Expected: FAIL — `deliveryFailed` undefined.

- [ ] **Step 3: Implement**

In `server/repositories/guestRepository.ts` (uses the same `getDB`/`schema` imports already in the file; add `inArray` to the drizzle-orm import if missing):

```ts
/** Activity types that mean "the email never reached the guest". */
const DELIVERY_FAILED_TYPES = ["invite_failed", "reminder_failed", "email_bounced"];

/** Guests of the event with at least one failed-delivery activity. */
export async function findDeliveryFailedGuestIds(
    organizationId: string,
    eventId: string,
): Promise<Set<string>> {
    const db = getDB();
    const rows = await db
        .selectDistinct({ guestId: schema.guestActivities.guestId })
        .from(schema.guestActivities)
        .where(
            and(
                eq(schema.guestActivities.organizationId, organizationId),
                eq(schema.guestActivities.eventId, eventId),
                inArray(schema.guestActivities.type, DELIVERY_FAILED_TYPES),
            ),
        );
    return new Set(rows.map((r) => r.guestId));
}
```

In `server/services/guest.service.ts` `listGuests`: import `findDeliveryFailedGuestIds` from the repository, then:

```ts
    const [rows, failedIds] = await Promise.all([
        findGuestsByEventWithResponse(organizationId, eventId),
        findDeliveryFailedGuestIds(organizationId, eventId),
    ]);

    const guests = rows.map((row) => {
        const rsvpStatus = deriveRsvpStatus(row.attending, row.guest.firstOpenedAt);
        return {
            ...row.guest,
            rsvpStatus,
            respondedAt: row.responseId ? (row.responseUpdatedAt ?? row.submittedAt) : null,
            totalPeople: rsvpStatus === "confirmed" ? 1 + (row.companionsCount ?? 0) : 0,
            deliveryFailed: failedIds.has(row.guest.id),
        };
    });
```

and add to the `summary` object:

```ts
    deliveryFailed: active.filter((g) => g.deliveryFailed).length,
```

In `shared/types/ceremly.ts` extend `GuestWithStatus`:

```ts
export interface GuestWithStatus extends CeremlyGuest {
  rsvpStatus: GuestRsvpStatus
  respondedAt: string | null
  /** 1 + companionsCount if confirmed, otherwise 0. */
  totalPeople: number
  /** At least one failed-delivery activity (bounce, DLQ invite/reminder). */
  deliveryFailed: boolean
}
```

In `app/composables/useEventGuests.ts` add to `GuestListSummary`:

```ts
    /** Active guests with at least one failed email delivery. */
    deliveryFailed: number;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run server/services/guest.service.test.ts && pnpm typecheck`
Expected: PASS + typecheck green.

- [ ] **Step 5: Commit**

```bash
git add server/repositories/guestRepository.ts server/services/guest.service.ts shared/types/ceremly.ts app/composables/useEventGuests.ts server/services/guest.service.test.ts
git commit -m "feat(guests): expose per-guest deliveryFailed flag and summary count"
```

---

### Task 6: UI — timeline labels, guest-row badge, distribution warning

**Files:**
- Modify: `app/pages/dashboard/events/[id]/guests.vue:328-345` (`activityLabel`) and `:661-664` (channel cell)
- Modify: `app/pages/dashboard/events/[id]/distribution.vue:677` (anchor: the `sendHistory` block)
- Modify: `i18n/locales/it-IT.json` (namespace `ceremly.event.guests`, block at line ~3440; namespace `ceremly.event.distribution`)
- Modify: `i18n/locales/en-US.json` (same namespaces — the ACTIVE `guests` block is the one mirroring it-IT.json:3440, i.e. the `ceremly.event.guests.*` keys; do NOT touch the duplicate `ceremly.event.detail.*` block)

**Interfaces:**
- Consumes: `g.deliveryFailed`, `summary.deliveryFailed` (Task 5); activity types (Tasks 2/4).

- [ ] **Step 1: i18n keys**

`i18n/locales/it-IT.json`, inside `ceremly.event.guests` next to the other `activity*` keys (after line ~3447 `"activityReminderSent"`) — NO `@` characters in the strings:

```json
"activityInviteFailed": "Consegna invito fallita (tentativi esauriti)",
"activityReminderFailed": "Consegna reminder fallita (tentativi esauriti)",
"activityEmailBounced": "Email non recapitata",
"deliveryFailed": "Email fallita",
```

inside `ceremly.event.distribution`:

```json
"deliveryFailedWarning": "{n} invito/i non consegnati — apri la scheda ospite per i dettagli",
```

`i18n/locales/en-US.json`, same keys in the same namespaces:

```json
"activityInviteFailed": "Invitation delivery failed (retries exhausted)",
"activityReminderFailed": "Reminder delivery failed (retries exhausted)",
"activityEmailBounced": "Email not delivered",
"deliveryFailed": "Email failed",
```

```json
"deliveryFailedWarning": "{n} invitation(s) not delivered — open the guest detail for more",
```

- [ ] **Step 2: timeline labels**

In `guests.vue` `activityLabel` (line ~328), add before `default:`:

```ts
        case "invite_failed":
            return t("ceremly.event.guests.activityInviteFailed");
        case "reminder_failed":
            return t("ceremly.event.guests.activityReminderFailed");
        case "email_bounced":
            return t("ceremly.event.guests.activityEmailBounced");
```

- [ ] **Step 3: guest-row badge**

In `guests.vue` channel cell (lines 661-664), replace with:

```vue
                            <td>
                                <span v-if="g.email" class="row small" style="gap: 5px;">
                                    <span class="muted" style="display: inline-flex;"><CerIcon name="mail" :s="12" /></span> Email
                                    <span v-if="g.deliveryFailed" class="pill decline" style="margin-left: 4px;"><span class="cer-dot" />{{ $t('ceremly.event.guests.deliveryFailed') }}</span>
                                </span>
                                <span v-else class="row small" style="gap: 5px;"><span class="muted" style="display: inline-flex;"><CerIcon name="whatsapp" :s="12" /></span> WhatsApp</span>
                            </td>
```

- [ ] **Step 4: distribution warning banner**

In `distribution.vue`, immediately BEFORE the `sendHistory` block (line 677, `<div v-if="sendHistory.length > 0" ...>`), insert:

```vue
                <div v-if="(summary?.deliveryFailed ?? 0) > 0" class="row small" style="gap: 6px; margin-top: 12px; color: var(--decline); align-items: center;">
                    <CerIcon name="alert" :s="14" />
                    <span>{{ $t('ceremly.event.distribution.deliveryFailedWarning', { n: summary!.deliveryFailed }) }}</span>
                </div>
```

NOTE for the implementer: check `CerIcon` supports the name `alert` (`grep -n "alert" app/components/ceremly/CerIcon.vue`); if not, use an existing warning-like icon name from that component or drop the icon span.

- [ ] **Step 5: full verification**

Run: `pnpm vitest run && pnpm typecheck && pnpm build`
Expected: suite green, typecheck green, build completes (the i18n gotcha — a broken locale file — only surfaces at build/SSR: this step is mandatory).

- [ ] **Step 6: Commit**

```bash
git add app/pages/dashboard/events/\[id\]/guests.vue app/pages/dashboard/events/\[id\]/distribution.vue i18n/locales/it-IT.json i18n/locales/en-US.json
git commit -m "feat(ui): surface failed email deliveries to the planner"
```

---

## Deployment note (post-merge, manual)

No new env vars and no DB migration. The failureCallback only applies to messages published AFTER deploy. Existing DLQ items (if any) stay invisible: check the Upstash console DLQ once after deploy.
