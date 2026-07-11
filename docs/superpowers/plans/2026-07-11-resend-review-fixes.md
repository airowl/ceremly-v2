# Resend Code Review Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 CRITICAL + 6 IMPORTANT findings from the full-stack Resend code review, moving email-event idempotency from a best-effort Redis cache to a hard DB constraint and making silent failures visible.

**Architecture:** The keystone is a DB unique constraint on `email_events.svix_id` — every Resend delivery carries a unique Svix id, so `onConflictDoNothing` makes the whole webhook idempotent at the database layer regardless of Redis. On top of that: soft bounces stop suppressing valid addresses, the suppressed-send result becomes a non-retryable `skipped` outcome (killing the QStash poison-message loop), the seed write becomes best-effort with backfill, and the webhook route gets rate-limiting plus a missing-secret alarm.

**Tech Stack:** Nuxt 4 / Nitro / Vercel serverless · Drizzle ORM + Neon HTTP driver · Upstash QStash (queue) + Redis (cache) · Resend SDK `^6.5.2` (`resend.batch.send`, `idempotencyKey` confirmed present) · Vitest.

## Global Constraints

- **Backend conventions:** thin routes → services → repositories; Drizzle queries only in `server/repositories/`; `useRuntimeConfig()`/`runtimeConfig` never `process.env`; audit on writes. (`docs/base/STACK-AND-CONVENTIONS.md`)
- **Serverless (Strada A):** no long-lived state; idempotency must not rely on per-instance memory. DB constraints are the only cross-instance-safe barrier.
- **Language:** code/comments/tests/dev-logs in ENGLISH; product/UI strings in Italian.
- **Resend bounce subType is NOT typed** in the SDK (`WebhookEvent` union has no subType field) → treat `data.bounce.subType` as `string | undefined`, unknown value defaults to **soft** (do not suppress).
- **Idempotency-Key window** is 24h; keys must be unique per logical send, never reused for deliberate re-sends.
- **Migrations:** `pnpm db:generate` is interactive (needs TTY). `pnpm db:migrate:prod` migrates DEV unless given an inline prod URL (known gotcha) — noted at the migration task.
- **Existing tests to keep green:** the Vitest suite under `server/` (email idempotency/suppression/sender, `emailWebhook.service.test.ts`, `resend.post.test.ts`).

---

### Task 1: Add `svix_id` column + unique index to `email_events`, make inserts idempotent, add seed backfill

**Files:**
- Modify: `server/database/schema/emailEvents.ts`
- Modify: `server/repositories/emailEvent.repository.ts`
- Create: `drizzle/migrations/00XX_*.sql` (generated)
- Test: `server/repositories/emailEvent.repository.test.ts` (create)

**Interfaces:**
- Consumes: nothing (foundation task).
- Produces:
  - `insertEmailEvent(input: { svixId: string; messageId: string; type: string; recipient: string; occurredAt: Date; payload: unknown; clickedUrl?: string; organizationId?: string | null; guestId?: string | null; eventId?: string | null; emailType?: string | null }): Promise<{ inserted: boolean }>` — `inserted:false` when the `svix_id` already existed (duplicate delivery).
  - `insertEmailSeed(input: { messageId: string; recipient: string; emailType: string; organizationId?: string; guestId?: string; eventId?: string }): Promise<void>` — unchanged signature; now also backfills orphan events (see Task-level note) and never throws is handled by its caller in Task 5, so keep it throwing here.
  - `findSeedContext(messageId: string)` — unchanged signature; now `ORDER BY created_at`.

- [ ] **Step 1: Add the column and unique index to the schema**

In `server/database/schema/emailEvents.ts`, add the `svixId` column and a unique index. Full new file:

```typescript
import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

// Append-only. type: 'sent'(seed) | 'delivered' | 'bounced' | 'complained'
// | 'delivery_delayed' | 'failed' | 'opened' | 'clicked'
// Idempotency is enforced at the DB layer via a unique index on `svix_id`
// (every Resend/Svix delivery carries a unique id). Redis dedup is a
// best-effort short-circuit only. The seed row (type='sent') has no svix_id.
export const emailEvents = pgTable("email_events", {
    id: text("id").primaryKey().$default(() => uuidv7()),
    svixId: text("svix_id"),
    messageId: text("message_id").notNull(),
    type: text("type").notNull(),
    recipient: text("recipient").notNull(),
    organizationId: text("organization_id"),
    emailType: text("email_type"),
    guestId: text("guest_id"),
    eventId: text("event_id"),
    clickedUrl: text("clicked_url"),
    payload: jsonb("payload"),
    occurredAt: timestamp("occurred_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
    // Unique on svix_id: Postgres allows multiple NULLs, so seed rows (svix_id
    // NULL) and legacy rows are unaffected; only webhook deliveries are deduped.
    uniqueIndex("email_events_svix_id_uq").on(table.svixId),
    index("email_events_message_id_idx").on(table.messageId),
    index("email_events_organization_id_idx").on(table.organizationId),
    index("email_events_event_id_idx").on(table.eventId),
    index("email_events_type_idx").on(table.type),
]);
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate` (interactive — accept the generated name; it will add the `svix_id` column and the `email_events_svix_id_uq` unique index).
Expected: a new file `drizzle/migrations/00XX_*.sql` containing `ADD COLUMN "svix_id"` and `CREATE UNIQUE INDEX "email_events_svix_id_uq"`. Verify the SQL visually — it must NOT drop/recreate the table (data-preserving).

- [ ] **Step 3: Write the failing repo tests**

Create `server/repositories/emailEvent.repository.test.ts`. These tests use a mocked `getDB`; assert on the Drizzle call chain (the suite has no live DB). Model them on the existing `server/utils/email.suppression.test.ts` mocking style.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const insertValues = vi.fn();
const onConflictDoNothing = vi.fn();
const returning = vi.fn();

vi.mock("../utils/db", () => ({
    getDB: () => ({
        insert: () => ({ values: insertValues }),
        select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: () => [] }) }) }) }),
        update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    }),
}));

beforeEach(() => {
    vi.clearAllMocks();
    // values(...).onConflictDoNothing().returning() → rows
    onConflictDoNothing.mockReturnValue({ returning });
    insertValues.mockReturnValue({ onConflictDoNothing });
});

describe("insertEmailEvent", () => {
    it("returns inserted:true when a row is written", async () => {
        returning.mockResolvedValue([{ id: "x" }]);
        const { insertEmailEvent } = await import("./emailEvent.repository");
        const res = await insertEmailEvent({
            svixId: "msg_1", messageId: "m1", type: "opened",
            recipient: "a@b.com", occurredAt: new Date(0), payload: {},
        });
        expect(res).toEqual({ inserted: true });
        expect(onConflictDoNothing).toHaveBeenCalled();
    });

    it("returns inserted:false when svix_id already exists (no row returned)", async () => {
        returning.mockResolvedValue([]);
        const { insertEmailEvent } = await import("./emailEvent.repository");
        const res = await insertEmailEvent({
            svixId: "msg_1", messageId: "m1", type: "opened",
            recipient: "a@b.com", occurredAt: new Date(0), payload: {},
        });
        expect(res).toEqual({ inserted: false });
    });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `pnpm vitest run server/repositories/emailEvent.repository.test.ts`
Expected: FAIL — `insertEmailEvent` does not yet return `{ inserted }` / `onConflictDoNothing` not called.

- [ ] **Step 5: Implement the repo changes**

Rewrite `server/repositories/emailEvent.repository.ts`:

```typescript
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDB } from "../utils/db";
import * as schema from "../database/schema";

export async function insertEmailSeed(input: {
    messageId: string;
    recipient: string;
    emailType: string;
    organizationId?: string;
    guestId?: string;
    eventId?: string;
}): Promise<void> {
    const db = getDB();
    await db.insert(schema.emailEvents).values({
        messageId: input.messageId,
        type: "sent",
        recipient: input.recipient,
        emailType: input.emailType,
        organizationId: input.organizationId,
        guestId: input.guestId,
        eventId: input.eventId,
        occurredAt: new Date(),
    });

    // Backfill: webhook events for this message may have arrived BEFORE the seed
    // (race). Re-correlate any orphan rows (context still null) with the now-known
    // entity ids. Idempotent: only touches rows whose organization_id IS NULL.
    if (input.organizationId || input.guestId || input.eventId) {
        await db
            .update(schema.emailEvents)
            .set({
                organizationId: input.organizationId,
                guestId: input.guestId,
                eventId: input.eventId,
                emailType: input.emailType,
            })
            .where(and(
                eq(schema.emailEvents.messageId, input.messageId),
                isNull(schema.emailEvents.organizationId),
            ));
    }
}

export async function findSeedContext(messageId: string) {
    const db = getDB();
    const rows = await db
        .select({
            organizationId: schema.emailEvents.organizationId,
            guestId: schema.emailEvents.guestId,
            eventId: schema.emailEvents.eventId,
            emailType: schema.emailEvents.emailType,
        })
        .from(schema.emailEvents)
        .where(eq(schema.emailEvents.messageId, messageId))
        .orderBy(schema.emailEvents.createdAt)
        .limit(1);
    return rows[0];
}

export async function insertEmailEvent(input: {
    svixId: string;
    messageId: string;
    type: string;
    recipient: string;
    occurredAt: Date;
    payload: unknown;
    clickedUrl?: string;
    organizationId?: string | null;
    guestId?: string | null;
    eventId?: string | null;
    emailType?: string | null;
}): Promise<{ inserted: boolean }> {
    const db = getDB();
    // onConflictDoNothing on the svix_id unique index: a duplicate delivery is a
    // no-op. `returning()` yields the inserted rows — empty means it was a dup.
    const rows = await db
        .insert(schema.emailEvents)
        .values({
            svixId: input.svixId,
            messageId: input.messageId,
            type: input.type,
            recipient: input.recipient,
            occurredAt: input.occurredAt,
            payload: input.payload as object,
            clickedUrl: input.clickedUrl,
            organizationId: input.organizationId ?? undefined,
            guestId: input.guestId ?? undefined,
            eventId: input.eventId ?? undefined,
            emailType: input.emailType ?? undefined,
        })
        .onConflictDoNothing({ target: schema.emailEvents.svixId })
        .returning({ id: schema.emailEvents.id });
    return { inserted: rows.length > 0 };
}

// Updates the open counters on the guest (columns already present on `guests`).
export async function recordGuestOpen(guestId: string, occurredAt: Date): Promise<void> {
    const db = getDB();
    await db
        .update(schema.guests)
        .set({
            openCount: sql`${schema.guests.openCount} + 1`,
            emailOpenedAt: occurredAt,
            firstOpenedAt: sql`COALESCE(${schema.guests.firstOpenedAt}, ${occurredAt})`,
        })
        .where(eq(schema.guests.id, guestId));
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run server/repositories/emailEvent.repository.test.ts`
Expected: PASS (both cases).

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors (the callers in `emailWebhook.service.ts` will still fail to typecheck because they don't pass `svixId` yet — that is Task 2. If typecheck fails ONLY on `emailWebhook.service.ts` missing `svixId`, that is expected; proceed. If it fails elsewhere, fix here.)

- [ ] **Step 8: Commit**

```bash
git add server/database/schema/emailEvents.ts server/repositories/emailEvent.repository.ts server/repositories/emailEvent.repository.test.ts drizzle/migrations/
git commit -m "feat(email): DB-level webhook idempotency via svix_id unique + seed backfill"
```

---

### Task 2: Thread `svixId` into the webhook handler; gate the guest-open counter on a real insert

**Files:**
- Modify: `server/services/emailWebhook.service.ts:58-105` (`handleResendEvent`)
- Modify: `server/api/webhooks/resend.post.ts:34` (pass svix-id)
- Test: `server/services/emailWebhook.service.test.ts`

**Interfaces:**
- Consumes: `insertEmailEvent(...) → { inserted: boolean }` (Task 1), `recordGuestOpen`, `findSeedContext` (Task 1).
- Produces: `handleResendEvent(event: ResendWebhookEvent, svixId: string): Promise<void>`.

- [ ] **Step 1: Update the failing test for the new signature + counter gating**

In `server/services/emailWebhook.service.test.ts`, update `handleResendEvent` call sites to pass a `svixId` and add a case proving the counter does NOT increment on a duplicate. Add:

```typescript
it("does not increment guest open counter when the event insert is a duplicate", async () => {
    insertEmailEventMock.mockResolvedValue({ inserted: false });
    findSeedContextMock.mockResolvedValue({ guestId: "g1", organizationId: "o1", eventId: "e1", emailType: "custom" });
    await handleResendEvent(
        { type: "email.opened", created_at: new Date(0).toISOString(),
          data: { email_id: "m1", from: OWN_FROM, to: ["a@b.com"] } },
        "svix_dup_1",
    );
    expect(recordGuestOpenMock).not.toHaveBeenCalled();
});

it("increments guest open counter on a fresh open insert", async () => {
    insertEmailEventMock.mockResolvedValue({ inserted: true });
    findSeedContextMock.mockResolvedValue({ guestId: "g1", organizationId: "o1", eventId: "e1", emailType: "custom" });
    await handleResendEvent(
        { type: "email.opened", created_at: new Date(0).toISOString(),
          data: { email_id: "m1", from: OWN_FROM, to: ["a@b.com"] } },
        "svix_fresh_1",
    );
    expect(recordGuestOpenMock).toHaveBeenCalledWith("g1", expect.any(Date));
});
```

(Ensure `insertEmailEventMock`, `findSeedContextMock`, `recordGuestOpenMock`, and an `OWN_FROM` constant matching `isOwnDomain` are set up in the mock block. If the existing test file mocks `../repositories/emailEvent.repository`, extend that mock so `insertEmailEvent` returns `{ inserted: true }` by default.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run server/services/emailWebhook.service.test.ts`
Expected: FAIL — signature mismatch (svixId) and counter still fires on duplicate.

- [ ] **Step 3: Implement the handler change**

In `server/services/emailWebhook.service.ts`, replace `handleResendEvent` (lines 58-105) so it takes `svixId`, passes it to every `insertEmailEvent`, and gates `recordGuestOpen` on `inserted`:

```typescript
export async function handleResendEvent(event: ResendWebhookEvent, svixId: string): Promise<void> {
    const { type, data } = event;
    const recipient = data.to?.[0] ?? "";
    if (!recipient) return; // subscribed events always have `to`; nothing to attribute
    const occurredAt = new Date(event.created_at);
    const ctx = await findSeedContext(data.email_id);

    const baseEvent = {
        svixId,
        messageId: data.email_id,
        recipient,
        occurredAt,
        payload: event,
        organizationId: ctx?.organizationId ?? null,
        guestId: ctx?.guestId ?? null,
        eventId: ctx?.eventId ?? null,
        emailType: ctx?.emailType ?? null,
    };

    switch (type) {
        case "email.bounced":
            // Suppression policy handled in Task 3 (isHardBounce). Placeholder
            // kept identical here; Task 3 replaces this branch.
            await upsertSuppression({ email: recipient, reason: "hard_bounce", bounceSubtype: data.bounce?.subType });
            await insertEmailEvent({ ...baseEvent, type: "bounced" });
            break;
        case "email.complained":
            await upsertSuppression({ email: recipient, reason: "complaint" });
            await insertEmailEvent({ ...baseEvent, type: "complained" });
            break;
        case "email.delivered":
        case "email.delivery_delayed":
        case "email.failed":
            await insertEmailEvent({ ...baseEvent, type: type.replace("email.", "") });
            break;
        case "email.opened": {
            // Idempotency is now a DB fact: insert returns inserted:false on a
            // duplicate svix_id, so the counter fires exactly once per distinct
            // Resend open event — no reliance on retry-throws or Redis dedup.
            const { inserted } = await insertEmailEvent({ ...baseEvent, type: "opened" });
            if (inserted && ctx?.guestId) await recordGuestOpen(ctx.guestId, occurredAt);
            break;
        }
        case "email.clicked":
            await insertEmailEvent({ ...baseEvent, type: "clicked", clickedUrl: data.click?.link });
            break;
        default:
            break; // unhandled event → ignore (route still responds 200)
    }
}
```

- [ ] **Step 4: Pass svix-id from the route**

In `server/api/webhooks/resend.post.ts`, change line 34:

```typescript
    await handleResendEvent(parsed, headers["svix-id"]);
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm vitest run server/services/emailWebhook.service.test.ts && pnpm typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add server/services/emailWebhook.service.ts server/api/webhooks/resend.post.ts server/services/emailWebhook.service.test.ts
git commit -m "feat(email): thread svix-id through webhook, gate open counter on real insert"
```

---

### Task 3: Soft bounces stop suppressing — `isHardBounce` gate

**Files:**
- Modify: `server/services/emailWebhook.service.ts` (add `isHardBounce`, rewrite `email.bounced` branch)
- Test: `server/services/emailWebhook.service.test.ts`

**Interfaces:**
- Consumes: `upsertSuppression`, `insertEmailEvent` (Task 1/2).
- Produces: `isHardBounce(subType?: string): boolean`.

- [ ] **Step 1: Write the failing tests**

In `server/services/emailWebhook.service.test.ts`. Note the EXISTING test at ~lines 24-27 asserts `subType:"General"` → suppression; keep that (General is hard). Add:

```typescript
import { isHardBounce } from "./emailWebhook.service";

describe("isHardBounce", () => {
    it("treats permanent subtypes as hard", () => {
        expect(isHardBounce("Permanent")).toBe(true);
        expect(isHardBounce("General")).toBe(true);
        expect(isHardBounce("NoEmail")).toBe(true);
    });
    it("treats transient/unknown subtypes as soft", () => {
        expect(isHardBounce("Transient")).toBe(false);
        expect(isHardBounce("MailboxFull")).toBe(false);
        expect(isHardBounce(undefined)).toBe(false);
        expect(isHardBounce("SomethingNew")).toBe(false);
    });
});

it("does NOT suppress on a transient bounce, but still records the event", async () => {
    await handleResendEvent(
        { type: "email.bounced", created_at: new Date(0).toISOString(),
          data: { email_id: "m1", from: OWN_FROM, to: ["a@b.com"], bounce: { subType: "Transient" } } },
        "svix_soft_1",
    );
    expect(upsertSuppressionMock).not.toHaveBeenCalled();
    expect(insertEmailEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: "bounced" }));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run server/services/emailWebhook.service.test.ts`
Expected: FAIL — `isHardBounce` not exported; transient bounce currently suppresses.

- [ ] **Step 3: Implement `isHardBounce` and the conditional branch**

In `server/services/emailWebhook.service.ts`, add near the top (after imports):

```typescript
// Resend does not type bounce subtypes; values follow SES conventions. We
// whitelist HARD (permanent) subtypes — anything unknown defaults to SOFT so a
// transient failure never permanently suppresses a valid address.
const HARD_BOUNCE_SUBTYPES = new Set([
    "Permanent", "General", "NoEmail", "Suppressed", "OnAccountSuppressionList",
]);

export function isHardBounce(subType?: string): boolean {
    return !!subType && HARD_BOUNCE_SUBTYPES.has(subType);
}
```

Replace the `email.bounced` case:

```typescript
        case "email.bounced": {
            // Only permanent bounces suppress; transient bounces are logged only
            // (Resend retries them upstream). Unknown subtype → treated as soft.
            if (isHardBounce(data.bounce?.subType)) {
                await upsertSuppression({ email: recipient, reason: "hard_bounce", bounceSubtype: data.bounce?.subType });
            }
            await insertEmailEvent({ ...baseEvent, type: "bounced" });
            break;
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run server/services/emailWebhook.service.test.ts`
Expected: PASS (including the retained `General`→hard case).

- [ ] **Step 5: Commit**

```bash
git add server/services/emailWebhook.service.ts server/services/emailWebhook.service.test.ts
git commit -m "fix(email): soft/transient bounces no longer suppress valid addresses"
```

---

### Task 4: Missing webhook secret = loud alarm, not a silent 401

**Files:**
- Modify: `server/api/webhooks/resend.post.ts` (diagnostic before verify)
- Create: `server/plugins/emailConfigCheck.ts` (startup guard)
- Test: `server/api/webhooks/resend.post.test.ts`

**Interfaces:**
- Consumes: `runtimeConfig` (`resendWebhookSecret`, `resendApiKey`, `public.appNotifyEmail`, `public.appEventsNotifyEmail`, `isProdDeployment`).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Write the failing route test**

In `server/api/webhooks/resend.post.test.ts`, add a case: when `resendWebhookSecret` is empty, the route responds 500 (config error, visible in monitoring) — NOT 401 (which reads as hostile traffic). Follow the file's existing h3-event mocking. Assert the thrown error has `statusCode: 500`.

```typescript
it("responds 500 (not 401) when the webhook secret is not configured", async () => {
    // arrange runtimeConfig.resendWebhookSecret = "" for this test
    // (mock runtimeConfig as the file already does)
    await expect(invokeRoute(validSignedRequest)).rejects.toMatchObject({ statusCode: 500 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/api/webhooks/resend.post.test.ts`
Expected: FAIL — currently an empty secret makes `verify` throw → caught → 401.

- [ ] **Step 3: Implement the route diagnostic**

In `server/api/webhooks/resend.post.ts`, insert BEFORE the `try { parsed = verifyResendEvent(...) }` block (after reading headers):

```typescript
    // Distinguish "secret not configured" (our misconfig → must be visible) from
    // "invalid signature" (hostile/garbled → 401). An empty secret otherwise makes
    // svix throw and masquerade as a 401, silently dropping every bounce/complaint.
    if (!runtimeConfig.resendWebhookSecret) {
        console.error("[webhook:resend] NUXT_RESEND_WEBHOOK_SECRET is not configured — rejecting all events");
        throw createError({ statusCode: 500, statusMessage: "Webhook secret not configured" });
    }
```

Add the import at the top if missing:

```typescript
import { runtimeConfig } from "~~/server/utils/runtimeConfig";
```

- [ ] **Step 4: Create the startup guard**

Create `server/plugins/emailConfigCheck.ts`:

```typescript
import { runtimeConfig } from "~~/server/utils/runtimeConfig";

/**
 * Startup guard: in a production deployment, loudly log any missing email/webhook
 * env so a misconfigured deploy is visible immediately instead of silently dropping
 * webhook events or sending from a malformed `from`.
 */
export default defineNitroPlugin(() => {
    if (!runtimeConfig.isProdDeployment) return;
    const missing: string[] = [];
    if (!runtimeConfig.resendWebhookSecret) missing.push("NUXT_RESEND_WEBHOOK_SECRET");
    if (!runtimeConfig.resendApiKey) missing.push("NUXT_RESEND_API_KEY");
    if (!runtimeConfig.public.appNotifyEmail) missing.push("appNotifyEmail");
    if (!runtimeConfig.public.appEventsNotifyEmail) missing.push("appEventsNotifyEmail");
    if (missing.length) {
        console.error(`[startup] Missing production email config: ${missing.join(", ")}`);
    }
});
```

(Verify `runtimeConfig.isProdDeployment` exists — the review confirmed it at `runtimeConfig.ts:83`. If the property name differs, use the actual one.)

- [ ] **Step 5: Run test + typecheck**

Run: `pnpm vitest run server/api/webhooks/resend.post.test.ts && pnpm typecheck`
Expected: PASS; clean.

- [ ] **Step 6: Commit**

```bash
git add server/api/webhooks/resend.post.ts server/plugins/emailConfigCheck.ts server/api/webhooks/resend.post.test.ts
git commit -m "fix(email): surface missing webhook secret (500 + startup guard) instead of silent 401"
```

---

### Task 5: `EmailResult.skipped` for suppressed sends + best-effort seed

**Files:**
- Modify: `server/utils/email.ts` (`EmailResult`, suppressed branch, seed try/catch)
- Test: `server/utils/email.suppression.test.ts`

**Interfaces:**
- Consumes: `isEmailSuppressed`, `insertEmailSeed` (Task 1).
- Produces: `EmailResult = { success: boolean; messageId?: string; error?: string; skipped?: boolean }`. `skipped:true` means "not sent by policy (suppressed)" — a **terminal non-error**, callers must NOT retry.

- [ ] **Step 1: Write the failing tests**

In `server/utils/email.suppression.test.ts`, add:

```typescript
it("returns skipped:true (not a retryable error) when the recipient is suppressed", async () => {
    // arrange isEmailSuppressed → true (mock as the file does)
    const res = await sendEmail({ type: "custom", to: "x@y.com", subject: "s", html: "<p>h</p>", text: "h" });
    expect(res.success).toBe(false);
    expect(res.skipped).toBe(true);
});

it("still reports success when the post-send seed write fails", async () => {
    // arrange: isEmailSuppressed → false; resend.emails.send → { data: { id: "m1" } };
    //          insertEmailSeed → throws
    const res = await sendEmail({
        type: "custom", to: "x@y.com", subject: "s", html: "<p>h</p>", text: "h",
        context: { organizationId: "o1", guestId: "g1", eventId: "e1" },
    });
    expect(res.success).toBe(true);
    expect(res.messageId).toBe("m1");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run server/utils/email.suppression.test.ts`
Expected: FAIL — no `skipped` field; seed throw currently bubbles to the catch → `success:false`.

- [ ] **Step 3: Implement the changes**

In `server/utils/email.ts`:

Add `skipped` to the interface:

```typescript
export interface EmailResult {
    success: boolean;
    messageId?: string;
    error?: string;
    /** True when the send was intentionally skipped (recipient suppressed).
     *  Terminal non-error: do NOT retry. */
    skipped?: boolean;
}
```

Change the suppressed branch (currently `return { success: false, error: 'suppressed' }`):

```typescript
        if (await isEmailSuppressed(options.to)) {
            await logAudit(null, 'email.failed', {
                userId: options.userId,
                targetType: 'email',
                targetId: options.to,
                status: 'failure',
                details: { error: 'suppressed', emailType: options.type },
            });
            return { success: false, skipped: true, error: 'suppressed' };
        }
```

Wrap the seed write (currently the `if (options.context && response.data?.id) { await insertEmailSeed(...) }` block) so a seed failure never rewrites a successful send outcome:

```typescript
        // Best-effort: the email is already sent (audit email.sent written above).
        // A seed failure must not flip the result to "failed"; the backfill in
        // insertEmailSeed re-correlates later if a subsequent seed lands.
        if (options.context && response.data?.id) {
            try {
                await insertEmailSeed({
                    messageId: response.data.id,
                    recipient: options.to,
                    emailType: options.type,
                    organizationId: options.context.organizationId,
                    guestId: options.context.guestId,
                    eventId: options.context.eventId,
                });
            } catch (seedErr) {
                console.error(
                    `[Email] seed correlation write failed for ${response.data.id}: ${seedErr instanceof Error ? seedErr.message : "unknown"}`
                );
            }
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run server/utils/email.suppression.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/email.ts server/utils/email.suppression.test.ts
git commit -m "feat(email): skipped result for suppressed sends + best-effort seed write"
```

---

### Task 6: Reminder handler treats `skipped` as terminal (no poison-message loop)

**Files:**
- Modify: `server/queue/handlers/sendReminderEmail.handler.ts:66-68`
- Test: `server/queue/handlers/sendReminderEmail.handler.test.ts` (create if absent)

**Interfaces:**
- Consumes: `sendEmail(...) → EmailResult` with `skipped` (Task 5).
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Create/extend `server/queue/handlers/sendReminderEmail.handler.test.ts`. Mock the repo lookups so the handler reaches `sendEmail`, then mock `sendEmail`:

```typescript
it("does NOT throw when sendEmail returns skipped (suppressed) — no QStash retry", async () => {
    sendEmailMock.mockResolvedValue({ success: false, skipped: true, error: "suppressed" });
    await expect(handleSendReminderEmail(validPayload)).resolves.toBeUndefined();
    expect(insertActivitiesMock).not.toHaveBeenCalled();
});

it("throws on a real send error (retryable)", async () => {
    sendEmailMock.mockResolvedValue({ success: false, error: "network" });
    await expect(handleSendReminderEmail(validPayload)).rejects.toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/queue/handlers/sendReminderEmail.handler.test.ts`
Expected: FAIL — current code throws on any `!result.success`, including skipped.

- [ ] **Step 3: Implement the change**

In `server/queue/handlers/sendReminderEmail.handler.ts`, replace lines 66-68:

```typescript
  if (!result.success) {
    // Suppressed = terminal: the recipient is on the suppression list, retrying
    // will never succeed. Return (no throw) so QStash does not build a poison loop.
    if (result.skipped) {
      console.warn(`[job:send-reminder-email] guest ${guest.id} suppressed, skipping`)
      return
    }
    throw new Error(`[job:send-reminder-email] send failed for guest ${guest.id}: ${result.error}`)
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run server/queue/handlers/sendReminderEmail.handler.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/queue/handlers/sendReminderEmail.handler.ts server/queue/handlers/sendReminderEmail.handler.test.ts
git commit -m "fix(email): reminder handler treats suppressed send as terminal, not retryable"
```

---

### Task 7: Invite handler — add idempotency key + treat `skipped` as terminal

**Files:**
- Modify: `server/queue/handlers/sendInviteEmail.handler.ts:53-56`
- Test: `server/queue/handlers/sendInviteEmail.handler.test.ts` (create if absent)

**Interfaces:**
- Consumes: `sendEmail(...) → EmailResult` with `skipped` (Task 5).
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Create/extend `server/queue/handlers/sendInviteEmail.handler.test.ts`:

```typescript
it("passes a stable idempotencyKey invite:<eventId>:<guestId>", async () => {
    sendEmailMock.mockResolvedValue({ success: true, messageId: "m1" });
    await handleSendInviteEmail(validPayload); // guest.id = "g1", guest.eventId = "e1"
    expect(sendEmailMock).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: "invite:e1:g1" }),
    );
});

it("does NOT throw when sendEmail returns skipped (suppressed)", async () => {
    sendEmailMock.mockResolvedValue({ success: false, skipped: true, error: "suppressed" });
    await expect(handleSendInviteEmail(validPayload)).resolves.toBeUndefined();
});
```

(Match the real field names from `findGuestForEmail`: the review shows `guest.eventId` and `guest.id` are in scope.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/queue/handlers/sendInviteEmail.handler.test.ts`
Expected: FAIL — no idempotencyKey passed; skipped currently throws.

- [ ] **Step 3: Implement the change**

In `server/queue/handlers/sendInviteEmail.handler.ts`, replace lines 53-56:

```typescript
  // Idempotency: one invite per guest. Closes the send-ok → post-send-write-fail
  // → QStash retry → duplicate-email window (Resend replays the same send).
  const result = await sendEmail({ type: 'custom', to: guest.email, subject, html, text, context: { organizationId: guest.organizationId, guestId: guest.id, eventId: guest.eventId }, idempotencyKey: `invite:${guest.eventId}:${guest.id}` })
  if (!result.success) {
    if (result.skipped) {
      console.warn(`[job:send-invite-email] guest ${guest.id} suppressed, skipping`)
      return
    }
    throw new Error(`[job:send-invite-email] send failed for guest ${guest.id}: ${result.error}`)
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run server/queue/handlers/sendInviteEmail.handler.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/queue/handlers/sendInviteEmail.handler.ts server/queue/handlers/sendInviteEmail.handler.test.ts
git commit -m "fix(email): invite handler idempotency key + terminal on suppressed send"
```

---

### Task 8: Rate-limit the Resend webhook route

**Files:**
- Modify: `nuxt.config.ts:177-183` (the `/api/webhooks/resend` route rule)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Locate the current rule**

In `nuxt.config.ts` around lines 177-183 the route rule sets `rateLimiter: false` for `/api/webhooks/resend` (mirroring Creem). Read the surrounding `security` route-rules block to match the exact object shape `nuxt-security` expects for a per-route `rateLimiter` (the global limiter at ~line 361 is the reference for the option keys).

- [ ] **Step 2: Replace `rateLimiter: false` with a dedicated generous limiter**

Change the webhook route rule so instead of disabling the limiter, it sets a per-IP window sized above Resend's legitimate retry burst but below abuse. Keep `corsHandler`/`xssValidator` disabled (needed for raw-body HMAC). Example shape (align keys to the version in use):

```typescript
  '/api/webhooks/resend': {
    security: {
      corsHandler: false,
      xssValidator: false,
      rateLimiter: {
        tokensPerInterval: 120,
        interval: 60000, // 120 req/min per IP — far above Resend retry cadence
      },
    },
  },
```

Leave the global `requestSizeLimiter` (1MB) untouched — it must stay in force on this route.

- [ ] **Step 3: Verify build config parses**

Run: `pnpm typecheck`
Expected: no config type errors. (There is no unit test for `nuxt.config.ts`; the guard is typecheck + build.)

- [ ] **Step 4: Verify the route still serves under the limiter (build)**

Run: `pnpm build`
Expected: build completes (the pre-existing `sharp-wasm32` warning is known and unrelated).

- [ ] **Step 5: Commit**

```bash
git add nuxt.config.ts
git commit -m "fix(security): rate-limit Resend webhook route instead of disabling the limiter"
```

---

### Task 9: Org-invite email failure is visible in the audit

**Files:**
- Modify: `server/utils/auth.ts:376-391` (`sendInvitationEmail` + `afterCreateInvitation` audit)
- Test: `server/utils/auth.invite.test.ts` (create) OR extend an existing auth test if one covers this hook

**Interfaces:**
- Consumes: `sendEmail(...) → EmailResult` (Task 5).
- Produces: nothing.

- [ ] **Step 1: Read the current hook**

Read `server/utils/auth.ts:370-395` to confirm the exact shape of `sendInvitationEmail` and the `afterCreateInvitation` hook that writes `logAudit(..., 'team.member_invited', { status: 'success' })`. Capture the real variable names (invitationId, org, inviter).

- [ ] **Step 2: Write the failing test**

The Better Auth wiring is awkward to unit-test in isolation. Prefer a focused test of a small extracted helper. Extract the audit call into a helper `logInviteAudit(invitationId, delivered: boolean)` and test THAT:

```typescript
import { logInviteAudit } from "./auth";

it("records failure status when the invite email did not send", async () => {
    await logInviteAudit("inv1", false);
    expect(logAuditMock).toHaveBeenCalledWith(
        null, "team.member_invited",
        expect.objectContaining({ status: "failure", details: expect.objectContaining({ emailDelivered: false }) }),
    );
});
```

If extraction is impractical, mark this task's test as an integration check performed manually (see Step 5) and keep the implementation change.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run server/utils/auth.invite.test.ts`
Expected: FAIL — helper does not exist / status always success.

- [ ] **Step 4: Implement the change**

Capture the email result in `sendInvitationEmail` and thread it into the audit. Concretely: have `sendInvitationEmail` return the `EmailResult` (or a boolean `delivered`), then in `afterCreateInvitation` write the audit with `status: delivered ? 'success' : 'failure'` and `details: { ...existing, emailDelivered: delivered }`. Full illustrative shape:

```typescript
// inside sendInvitationEmail: capture and return delivery status
const result = await sendEmail({ /* ...existing invite options... */ });
if (!result.success) {
    console.error(`[auth] org invite email to ${data.email} failed: ${result.error ?? 'unknown'}`);
}
return result.success; // delivered?

// afterCreateInvitation: reflect real delivery in the audit
await logInviteAudit(invitation.id, delivered);
```

Where `logInviteAudit`:

```typescript
export async function logInviteAudit(invitationId: string, delivered: boolean): Promise<void> {
    await logAudit(null, 'team.member_invited', {
        targetType: 'invitation',
        targetId: invitationId,
        status: delivered ? 'success' : 'failure',
        details: { emailDelivered: delivered },
    });
}
```

(Preserve any existing audit `details` fields — merge, don't drop them.)

- [ ] **Step 5: Run test + typecheck**

Run: `pnpm vitest run server/utils/auth.invite.test.ts && pnpm typecheck`
Expected: PASS; clean. (If test extraction was impractical, run typecheck only and note the manual E2E: create an org invite to a suppressed address, confirm the audit row has `status:'failure'`.)

- [ ] **Step 6: Commit**

```bash
git add server/utils/auth.ts server/utils/auth.invite.test.ts
git commit -m "fix(email): org-invite audit reflects real email delivery status"
```

---

### Task 10: `sendBatchEmails` uses `resend.batch.send()` (no concurrency 429s)

**Files:**
- Modify: `server/utils/email.ts:325-341` (`sendBatchEmails`)
- Test: `server/utils/email.batch.test.ts` (create)

**Interfaces:**
- Consumes: `getResendInstance().batch.send(payload: CreateEmailOptions[], options?)` (confirmed in SDK `^6.5.2`: `Batch.send<Options>(payload, options)`); `buildEmailContent`, `getSender`, `isEmailSuppressed` (existing in email.ts).
- Produces: `sendBatchEmails(emails: EmailOptions[]): Promise<EmailResult[]>` — same signature; internally one `batch.send` per chunk of ≤100 (Resend batch cap), suppressed recipients filtered out first.

- [ ] **Step 1: Write the failing test**

Create `server/utils/email.batch.test.ts`:

```typescript
it("sends via resend.batch.send in a single call for <=100 emails (no per-email concurrency)", async () => {
    // arrange: isEmailSuppressed → false; batch.send → { data: [{ id: "a" }, { id: "b" }] }
    const res = await sendBatchEmails([
        { type: "custom", to: "a@x.com", subject: "s", html: "<p>a</p>", text: "a" },
        { type: "custom", to: "b@x.com", subject: "s", html: "<p>b</p>", text: "b" },
    ]);
    expect(batchSendMock).toHaveBeenCalledTimes(1);
    expect(res).toHaveLength(2);
    expect(res.every(r => r.success)).toBe(true);
});

it("filters suppressed recipients out of the batch", async () => {
    // arrange: isEmailSuppressed("a@x.com") → true, else false
    const res = await sendBatchEmails([
        { type: "custom", to: "a@x.com", subject: "s", html: "<p>a</p>", text: "a" },
        { type: "custom", to: "b@x.com", subject: "s", html: "<p>b</p>", text: "b" },
    ]);
    expect(res[0]).toMatchObject({ success: false, skipped: true });
    // only b@x.com reaches the batch
    expect(batchSendMock).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ to: "b@x.com" })]),
        undefined,
    );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/utils/email.batch.test.ts`
Expected: FAIL — current `sendBatchEmails` calls `sendEmail` per item (Promise.all), never `batch.send`.

- [ ] **Step 3: Implement the change**

Replace `sendBatchEmails` in `server/utils/email.ts`. It must: filter suppressed recipients (returning `skipped` results for them, preserving input order), build content for the rest, call `batch.send` in chunks of ≤100, and map responses back to `EmailResult[]`. Note `batch.send` does not run templates — build `{from,to,subject,html,text}` here via the existing `buildEmailContent`/`getSender`.

```typescript
const RESEND_BATCH_MAX = 100;

export async function sendBatchEmails(
    emails: EmailOptions[]
): Promise<EmailResult[]> {
    // Resolve suppression first so suppressed recipients never enter the batch.
    const results: (EmailResult | null)[] = await Promise.all(
        emails.map(async (e) => (await isEmailSuppressed(e.to)) ? { success: false, skipped: true, error: "suppressed" } : null)
    );

    // Collect the sendable emails with their original index for order-preserving merge.
    const sendable: { index: number; options: EmailOptions }[] = [];
    emails.forEach((options, index) => {
        if (results[index] === null) sendable.push({ index, options });
    });

    for (let i = 0; i < sendable.length; i += RESEND_BATCH_MAX) {
        const chunk = sendable.slice(i, i + RESEND_BATCH_MAX);
        const payload = await Promise.all(chunk.map(async ({ options }) => {
            const { subject, html, text } = await buildEmailContent(options);
            return { from: getSender(options), to: options.to, subject, html, text };
        }));
        const response = await getResendInstance().batch.send(payload, undefined);
        chunk.forEach(({ index }, j) => {
            if (response.error) {
                results[index] = { success: false, error: response.error.message };
            } else {
                results[index] = { success: true, messageId: response.data?.data?.[j]?.id };
            }
        });
    }

    return results.map((r) => r ?? { success: false, error: "unknown" });
}
```

(Verify the exact response shape of `batch.send` in the SDK — the review confirmed `CreateBatchResponse` with a `data` array. If the nested path differs from `response.data.data[j].id`, adjust to the real shape found in `node_modules/resend/dist/index.d.mts`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run server/utils/email.batch.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + typecheck**

Run: `pnpm vitest run server/ && pnpm typecheck`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add server/utils/email.ts server/utils/email.batch.test.ts
git commit -m "fix(email): sendBatchEmails uses resend.batch.send to avoid rate-limit losses"
```

---

### Task 11: Update EMAIL-ARCHITECTURE.md (doc drift)

**Files:**
- Modify: `docs/base/EMAIL-ARCHITECTURE.md` (§2.1, §6)

**Interfaces:** none.

- [ ] **Step 1: Read the stale sections**

Read `docs/base/EMAIL-ARCHITECTURE.md` §2.1 ("no idempotency key") and §6 ("no Resend webhooks") — both are now false.

- [ ] **Step 2: Rewrite the two sections**

Update §2.1 to state that transactional sends and QStash-driven guest invite/reminder pass a Resend `idempotencyKey` (24h window), and that suppressed sends return a terminal `skipped` result. Update §6 to state that the Resend webhook is implemented (`/api/webhooks/resend`), Svix-verified on the raw body, DB-idempotent via `email_events.svix_id`, with soft bounces logged-only and hard bounce/complaint suppressing globally. Keep the doc's existing style/headings.

- [ ] **Step 3: Commit**

```bash
git add docs/base/EMAIL-ARCHITECTURE.md
git commit -m "docs(email): align EMAIL-ARCHITECTURE with implemented webhook + idempotency"
```

---

## Final verification (after all tasks)

- [ ] Run full suite: `pnpm vitest run server/` → all green.
- [ ] Typecheck: `pnpm typecheck` → clean.
- [ ] Build: `pnpm build` → completes (ignore known `sharp-wasm32` warning).
- [ ] Apply migration to dev: `pnpm db:migrate` → `email_events` has `svix_id` + `email_events_svix_id_uq`.
- [ ] Manual E2E (out of CI, optional): `resend webhooks listen --forward-to <local>` — send a transient bounce (no suppression row), then deliver the same open event twice (openCount increments once).
- [ ] `graphify update .` to refresh the knowledge graph.

## Deferred to production ops (not code)

- Apply the migration to **prod** with the inline-URL gotcha (`ceremly-db-migrate-prod-gotcha`): `pnpm db:migrate:prod` alone migrates dev.
- Confirm real Resend `bounce.subType` values against production webhook payloads; widen `HARD_BOUNCE_SUBTYPES` only if a genuinely-permanent subtype is observed outside the whitelist.

## Out of scope (from spec §8) — MINOR follow-ups not in this plan

`findSeedContext` ordering (done incidentally in Task 1), `GREATEST` guard on `emailOpenedAt`, suppression escalation (`onConflictDoUpdate`), PII masking in logs/audit, `List-Unsubscribe` header + SPF/DKIM/DMARC on `events.` subdomain, hardcoded `@ceremly.com` legal fallbacks, dead `isEmailServiceConfigured()`, `email_events` retention, Creem route rate-limit.
