# Resend Webhooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ricevere e processare gli eventi webhook di Resend per igiene deliverability (suppression bounce/complaint + stato consegna) ed engagement (open/click su inviti/reminder).

**Architecture:** Endpoint HTTP unico (`/api/webhooks/resend`) verificato via Svix, idempotente (dedup `svix-id` su Redis), che filtra per dominio dell'ambiente e dispatcha per `event.type` verso un service → repository su due tabelle nuove (`email_suppressions` globale, `email_events`). `sendEmail()` controlla la suppression prima dell'invio, sceglie il `from` (sottodominio tracciato per gli inviti) e scrive una riga seed per correlare `messageId → org/guest/event`.

**Tech Stack:** Nuxt 4 / Nitro (h3), Drizzle ORM + Neon HTTP, Resend SDK 6.5.2 (`webhooks.verify` usa `svix` 1.76.1 già transitivo), Upstash Redis (`cacheClient`), Vitest (da configurare in Task 1).

**Spec di riferimento:** `docs/superpowers/specs/2026-06-19-resend-webhooks-design.md`.

## Global Constraints

- **Strada A serverless**: nessun processo persistente; il webhook è una rotta HTTP. Scritture inline (Neon HTTP), risposta 200 veloce.
- **Thin route → service → repository**: nessuna logica nelle rotte; query Drizzle solo nei repository.
- **Multi-tenancy**: `email_events.organizationId` per query tenant; `email_suppressions` è **globale** (account-level, non org-scoped) — decisione D3.
- **Provider abstraction**: Resend solo via `getResendInstance()` (`server/utils/drivers.ts`); mai `new Resend()` altrove.
- **Env**: sempre `runtimeConfig` (`server/utils/runtimeConfig.ts`), mai `process.env` nelle rotte.
- **UUID v7** per le PK delle tabelle di dominio: `import { v7 as uuidv7 } from "uuid"; text("id").primaryKey().$default(() => uuidv7())`.
- **Raw body**: `readRawBody(event)` (mai `readBody` → romperebbe la firma).
- **Dedup**: `cacheClient.set(key, '1', 86400)` SOLO a processing riuscito (pattern `/api/jobs/[job].post.ts`).
- **Eventi sottoscritti**: `email.delivered`, `email.bounced`, `email.complained`, `email.delivery_delayed`, `email.failed`, `email.opened`, `email.clicked`.

> **Nota testing**: su `main` NON esiste infra di test (niente `vitest`, niente script `test`). Il **Task 1** la introduce (minimale, mirror del config già provato nel worktree creem). TDD applicato alla **logica pura** (`getSender`, decisione suppression, filtro dominio, dispatch, wrapper verify). Repository/rotta/middleware: test unit con mock di `getDB`/`cacheClient`/service + verifica E2E manuale (`resend webhooks listen`). Se preferisci seguire la convenzione attuale "niente test" e verificare solo manualmente, salta gli step di test marcati `[TEST]`.

---

### Task 1: Setup Vitest (infra di test)

**Files:**
- Create: `vitest.config.ts`
- Create: `test/setup.ts`
- Modify: `package.json` (script `test`, devDependency `vitest`)

**Interfaces:**
- Produces: comando `pnpm test`; alias `~~`/`@@` = root, `~`/`@` = `app/`.

- [ ] **Step 1: Installare Vitest**

Run: `pnpm add -D vitest@^2`
Expected: aggiunto a `devDependencies`.

- [ ] **Step 2: Creare `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const app = fileURLToPath(new URL("./app", import.meta.url));

export default defineConfig({
    test: {
        environment: "node",
        include: ["server/**/*.test.ts", "shared/**/*.test.ts", "test/**/*.test.ts"],
        setupFiles: ["./test/setup.ts"],
        fileParallelism: false,
        testTimeout: 20000,
    },
    resolve: {
        alias: { "~~": root, "@@": root, "~": app, "@": app },
    },
});
```

- [ ] **Step 3: Creare `test/setup.ts`** (env minime per `runtimeConfig` in CLI mode)

```typescript
process.env.NUXT_PUBLIC_APP_NAME ||= "Ceremly";
process.env.NUXT_PUBLIC_APP_NOTIFY_EMAIL ||= "noreply@airowlgasga.dev";
process.env.NUXT_PUBLIC_APP_EVENTS_NOTIFY_EMAIL ||= "inviti@events.airowlgasga.dev";
process.env.NUXT_RESEND_API_KEY ||= "re_test";
process.env.NUXT_RESEND_WEBHOOK_SECRET ||= "whsec_test";
```

- [ ] **Step 4: Aggiungere lo script `test` in `package.json`**

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Verificare**

Run: `pnpm test`
Expected: `No test files found` (exit 0) — l'infra funziona.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts test/setup.ts package.json pnpm-lock.yaml
git commit -m "test: setup vitest harness"
```

---

### Task 2: Config & env (secret webhook + from tracciato)

**Files:**
- Modify: `server/utils/runtimeConfig.ts` (private `resendWebhookSecret` ~riga 33; public `appEventsNotifyEmail` ~riga 88)
- Modify: `.env.example` (sezione Email)

**Interfaces:**
- Produces: `runtimeConfig.resendWebhookSecret`, `runtimeConfig.public.appEventsNotifyEmail`.

- [ ] **Step 1: Aggiungere la key privata** in `generateRuntimeConfig()`, sotto `// Resend`:

```typescript
        // Resend
        resendApiKey: process.env.NUXT_RESEND_API_KEY,
        resendWebhookSecret: process.env.NUXT_RESEND_WEBHOOK_SECRET,
```

- [ ] **Step 2: Aggiungere la key pubblica** nel blocco `public: {`, sotto `appNotifyEmail`:

```typescript
            appNotifyEmail: process.env.NUXT_PUBLIC_APP_NOTIFY_EMAIL,
            // Sottodominio tracciato (open+click) per inviti/reminder eventi.
            appEventsNotifyEmail: process.env.NUXT_PUBLIC_APP_EVENTS_NOTIFY_EMAIL,
```

- [ ] **Step 3: Documentare in `.env.example`** (sezione `# Email (Resend)`):

```bash
# Webhook Resend (firma Svix). Ottenuto da `resend webhooks create` o dashboard. Sensitive.
NUXT_RESEND_WEBHOOK_SECRET=whsec_xxx
# From per inviti/reminder eventi: sottodominio con tracking ON (open+click).
# Transazionali restano su NUXT_PUBLIC_APP_NOTIFY_EMAIL (tracking OFF).
NUXT_PUBLIC_APP_EVENTS_NOTIFY_EMAIL="Ceremly <inviti@events.ceremly.com>"
```

- [ ] **Step 4: Verificare typecheck**

Run: `pnpm typecheck`
Expected: PASS (le nuove key sono opzionali, nessun consumer ancora).

- [ ] **Step 5: Commit**

```bash
git add server/utils/runtimeConfig.ts .env.example
git commit -m "feat(email): runtimeConfig per webhook secret + from eventi tracciato"
```

---

### Task 3: Schema — `email_suppressions` + `email_events`

**Files:**
- Create: `server/database/schema/emailSuppressions.ts`
- Create: `server/database/schema/emailEvents.ts`
- Modify: `server/database/schema/index.ts` (barrel)

**Interfaces:**
- Produces: tabelle `email_suppressions`, `email_events` (esportate dal barrel come `emailSuppressions`, `emailEvents`).

- [ ] **Step 1: `emailSuppressions.ts`**

```typescript
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

// GLOBALE (account-level), non org-scoped: un hard bounce/complaint è oggettivo.
export const emailSuppressions = pgTable("email_suppressions", {
    id: text("id").primaryKey().$default(() => uuidv7()),
    email: text("email").notNull().unique(),
    reason: text("reason").notNull(), // 'hard_bounce' | 'complaint' | 'manual'
    bounceSubtype: text("bounce_subtype"),
    source: text("source").notNull().default("resend_webhook"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
    index("email_suppressions_email_idx").on(table.email),
]);
```

- [ ] **Step 2: `emailEvents.ts`**

```typescript
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

// Append-only. type: 'sent'(seed) | 'delivered' | 'bounced' | 'complained'
// | 'delivery_delayed' | 'failed' | 'opened' | 'clicked'
export const emailEvents = pgTable("email_events", {
    id: text("id").primaryKey().$default(() => uuidv7()),
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
    index("email_events_message_id_idx").on(table.messageId),
    index("email_events_organization_id_idx").on(table.organizationId),
    index("email_events_event_id_idx").on(table.eventId),
    index("email_events_type_idx").on(table.type),
]);
```

- [ ] **Step 3: Aggiungere al barrel** `server/database/schema/index.ts`:

```typescript
export * from './emailSuppressions'
export * from './emailEvents'
```

- [ ] **Step 4: Generare + applicare la migrazione**

Run (richiede TTY — eseguilo tu):
```bash
pnpm db:generate   # dai un nome es. "email_webhooks"
pnpm db:migrate
```
Expected: nuovo file in `drizzle/migrations/`, tabelle create su Neon (branch dev).

- [ ] **Step 5: Commit**

```bash
git add server/database/schema/emailSuppressions.ts server/database/schema/emailEvents.ts server/database/schema/index.ts drizzle/migrations/
git commit -m "feat(db): tabelle email_suppressions + email_events"
```

---

### Task 4: Repository suppression

**Files:**
- Create: `server/repositories/emailSuppression.repository.ts`
- Test: `server/repositories/emailSuppression.repository.test.ts`

**Interfaces:**
- Produces:
  - `isEmailSuppressed(email: string): Promise<boolean>`
  - `upsertSuppression(input: { email: string; reason: "hard_bounce" | "complaint" | "manual"; bounceSubtype?: string; source?: string }): Promise<void>`

- [ ] **Step 1 [TEST]: Test del comportamento upsert (mock getDB)**

```typescript
// emailSuppression.repository.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const onConflictDoNothing = vi.fn();
const values = vi.fn(() => ({ onConflictDoNothing }));
const insert = vi.fn(() => ({ values }));
const limit = vi.fn(() => Promise.resolve([] as unknown[]));
const where = vi.fn(() => ({ limit }));
const from = vi.fn(() => ({ where }));
const select = vi.fn(() => ({ from }));
vi.mock("../utils/db", () => ({ getDB: () => ({ insert, select }) }));

import { isEmailSuppressed, upsertSuppression } from "./emailSuppression.repository";

beforeEach(() => vi.clearAllMocks());

describe("emailSuppression.repository", () => {
    it("upsertSuppression inserisce con onConflictDoNothing", async () => {
        await upsertSuppression({ email: "a@x.com", reason: "hard_bounce" });
        expect(insert).toHaveBeenCalledOnce();
        expect(values).toHaveBeenCalledWith(
            expect.objectContaining({ email: "a@x.com", reason: "hard_bounce" })
        );
        expect(onConflictDoNothing).toHaveBeenCalledOnce();
    });

    it("isEmailSuppressed false se nessuna riga", async () => {
        expect(await isEmailSuppressed("a@x.com")).toBe(false);
    });
});
```

- [ ] **Step 2 [TEST]: Eseguire → FAIL** (modulo non esiste)

Run: `pnpm test server/repositories/emailSuppression.repository.test.ts`
Expected: FAIL (cannot find module).

- [ ] **Step 3: Implementare il repository**

```typescript
import { eq } from "drizzle-orm";
import { getDB } from "../utils/db";
import * as schema from "../database/schema";

export async function isEmailSuppressed(email: string): Promise<boolean> {
    const db = getDB();
    const rows = await db
        .select({ id: schema.emailSuppressions.id })
        .from(schema.emailSuppressions)
        .where(eq(schema.emailSuppressions.email, email.toLowerCase()))
        .limit(1);
    return rows.length > 0;
}

export async function upsertSuppression(input: {
    email: string;
    reason: "hard_bounce" | "complaint" | "manual";
    bounceSubtype?: string;
    source?: string;
}): Promise<void> {
    const db = getDB();
    await db
        .insert(schema.emailSuppressions)
        .values({
            email: input.email.toLowerCase(),
            reason: input.reason,
            bounceSubtype: input.bounceSubtype,
            source: input.source ?? "resend_webhook",
        })
        .onConflictDoNothing();
}
```

- [ ] **Step 4 [TEST]: Eseguire → PASS**

Run: `pnpm test server/repositories/emailSuppression.repository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/repositories/emailSuppression.repository.ts server/repositories/emailSuppression.repository.test.ts
git commit -m "feat(email): repository suppression (isEmailSuppressed + upsert)"
```

---

### Task 5: Repository eventi email

**Files:**
- Create: `server/repositories/emailEvent.repository.ts`

**Interfaces:**
- Consumes: `schema.emailEvents`, `schema.guests`.
- Produces:
  - `insertEmailSeed(input: { messageId: string; recipient: string; emailType: string; organizationId?: string; guestId?: string; eventId?: string }): Promise<void>`
  - `findSeedContext(messageId: string): Promise<{ organizationId: string | null; guestId: string | null; eventId: string | null; emailType: string | null } | undefined>`
  - `insertEmailEvent(input: { messageId: string; type: string; recipient: string; occurredAt: Date; payload: unknown; clickedUrl?: string; organizationId?: string | null; guestId?: string | null; eventId?: string | null; emailType?: string | null }): Promise<void>`
  - `recordGuestOpen(guestId: string, occurredAt: Date): Promise<void>`

- [ ] **Step 1: Implementare il repository** (thin; no test dedicato — la logica è testata via service in Task 7)

```typescript
import { eq, sql } from "drizzle-orm";
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
        .limit(1);
    return rows[0];
}

export async function insertEmailEvent(input: {
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
}): Promise<void> {
    const db = getDB();
    await db.insert(schema.emailEvents).values({
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
    });
}

// Aggiorna i contatori apertura sull'ospite (colonne già esistenti su `guests`).
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

- [ ] **Step 2: Verificare typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/repositories/emailEvent.repository.ts
git commit -m "feat(email): repository email_events (seed/context/insert + recordGuestOpen)"
```

---

### Task 6: `sendEmail()` — suppression + sender tracciato + correlazione

**Files:**
- Modify: `server/utils/email.ts` (interfacce ~19-89, `getDefaultSender` ~94-96, `sendEmail` ~202-259)
- Test: `server/utils/email.sender.test.ts`

**Interfaces:**
- Consumes: `isEmailSuppressed`, `insertEmailSeed` (Task 4-5).
- Produces:
  - `interface EmailContext { organizationId?: string; guestId?: string; eventId?: string }`
  - `getSender(options: EmailOptions): string`
  - `sendEmail` invariato in firma esterna ma con enforcement suppression + seed.

- [ ] **Step 1: Estendere `BaseEmailOptions`** con il contesto (riga ~25):

```typescript
export interface EmailContext {
    organizationId?: string;
    guestId?: string;
    eventId?: string;
}

// Base options for all emails
export interface BaseEmailOptions {
    to: string;
    language?: SupportedLanguage;
    userId?: string;
    /** Contesto per correlare i webhook (open/click) all'ospite/evento. */
    context?: EmailContext;
}
```

- [ ] **Step 2 [TEST]: Test `getSender`** (eventi → sottodominio tracciato; resto → dominio principale)

```typescript
// email.sender.test.ts
import { describe, it, expect } from "vitest";
import { getSender } from "./email";

describe("getSender", () => {
    it("usa il from eventi quando context.eventId è presente", () => {
        const s = getSender({ type: "custom", to: "g@x.com", subject: "s", html: "h", text: "t", context: { eventId: "ev1" } });
        expect(s).toContain("events.airowlgasga.dev");
    });
    it("usa il from principale per i transazionali", () => {
        const s = getSender({ type: "verification", to: "u@x.com", verificationUrl: "https://x" });
        expect(s).toContain("noreply@airowlgasga.dev");
        expect(s).not.toContain("events.");
    });
});
```

- [ ] **Step 3 [TEST]: Eseguire → FAIL** (`getSender` non esiste)

Run: `pnpm test server/utils/email.sender.test.ts`
Expected: FAIL.

- [ ] **Step 4: Sostituire `getDefaultSender` con `getSender`** (riga ~94):

```typescript
/** From principale (tracking OFF) per i transazionali. */
export function getDefaultSender(): string {
    return `${runtimeConfig.public.appName} <${runtimeConfig.public.appNotifyEmail}>`;
}

/** From per evento-correlate (sottodominio tracciato, open+click ON). */
function getEventsSender(): string {
    return `${runtimeConfig.public.appName} <${runtimeConfig.public.appEventsNotifyEmail}>`;
}

/** Sceglie il from: sottodominio tracciato se il send è event-related. */
export function getSender(options: EmailOptions): string {
    if (options.context?.eventId) return getEventsSender();
    return getDefaultSender();
}
```

- [ ] **Step 5 [TEST]: Eseguire → PASS**

Run: `pnpm test server/utils/email.sender.test.ts`
Expected: PASS.

- [ ] **Step 6: Modificare `sendEmail`** — import + enforcement suppression + sender + seed. In cima al file aggiungere gli import:

```typescript
import { isEmailSuppressed } from "../repositories/emailSuppression.repository";
import { insertEmailSeed } from "../repositories/emailEvent.repository";
```

Poi nel corpo di `sendEmail`, dopo `const { subject, html, text } = await buildEmailContent(options);` sostituire `const from = getDefaultSender();` con:

```typescript
        // Enforcement suppression list (hard bounce / complaint): non inviare.
        if (await isEmailSuppressed(options.to)) {
            await logAudit(null, 'email.failed', {
                userId: options.userId,
                targetType: 'email',
                targetId: options.to,
                status: 'failure',
                details: { error: 'suppressed', emailType: options.type },
            });
            return { success: false, error: 'suppressed' };
        }

        const from = getSender(options);
```

E subito dopo il blocco `if (response.error) { ... }` (cioè nel ramo di successo, prima del `return { success: true, ... }`), aggiungere il seed:

```typescript
        // Correlazione webhook → entità: riga seed solo se c'è contesto.
        if (options.context && response.data?.id) {
            await insertEmailSeed({
                messageId: response.data.id,
                recipient: options.to,
                emailType: options.type,
                organizationId: options.context.organizationId,
                guestId: options.context.guestId,
                eventId: options.context.eventId,
            });
        }
```

- [ ] **Step 7 [TEST]: Test enforcement suppression** (mock repo + Resend)

```typescript
// email.suppression.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const send = vi.fn(() => Promise.resolve({ data: { id: "m1" }, error: null }));
vi.mock("./drivers", () => ({ getResendInstance: () => ({ emails: { send } }) }));
const isEmailSuppressed = vi.fn();
vi.mock("../repositories/emailSuppression.repository", () => ({ isEmailSuppressed }));
vi.mock("../repositories/emailEvent.repository", () => ({ insertEmailSeed: vi.fn() }));
vi.mock("../utils/audit", () => ({ logAudit: vi.fn() }));

import { sendEmail } from "./email";

beforeEach(() => vi.clearAllMocks());

describe("sendEmail suppression", () => {
    it("salta l'invio se il destinatario è soppresso", async () => {
        isEmailSuppressed.mockResolvedValue(true);
        const r = await sendEmail({ type: "verification", to: "x@x.com", verificationUrl: "https://x" });
        expect(r).toEqual({ success: false, error: "suppressed" });
        expect(send).not.toHaveBeenCalled();
    });
    it("invia se non soppresso", async () => {
        isEmailSuppressed.mockResolvedValue(false);
        const r = await sendEmail({ type: "verification", to: "x@x.com", verificationUrl: "https://x" });
        expect(r.success).toBe(true);
        expect(send).toHaveBeenCalledOnce();
    });
});
```

> Nota: l'import path di `logAudit` nel mock deve combaciare con quello reale in `email.ts` (`../utils/audit`). Verificalo e allinea il `vi.mock`.

- [ ] **Step 8 [TEST]: Eseguire → PASS**

Run: `pnpm test server/utils/email.suppression.test.ts server/utils/email.sender.test.ts`
Expected: PASS.

- [ ] **Step 9: Passare il contesto dai send guest.** In `server/queue/handlers/sendInviteEmail.handler.ts:53`:

```typescript
const result = await sendEmail({ type: 'custom', to: guest.email, subject, html, text, context: { organizationId: guest.organizationId, guestId: guest.id, eventId: guest.eventId } })
```

In `server/queue/handlers/sendReminderEmail.handler.ts:62`:

```typescript
const result = await sendEmail({ type: 'custom', to: guest.email, subject, html, text, context: { organizationId: guest.organizationId, guestId: guest.id, eventId: guest.eventId } })
```

- [ ] **Step 10: Typecheck + commit**

Run: `pnpm typecheck` → PASS
```bash
git add server/utils/email.ts server/utils/email.sender.test.ts server/utils/email.suppression.test.ts server/queue/handlers/sendInviteEmail.handler.ts server/queue/handlers/sendReminderEmail.handler.ts
git commit -m "feat(email): suppression enforcement + sender tracciato + correlazione context"
```

---

### Task 7: Service webhook (verify + filtro dominio + dispatch)

**Files:**
- Create: `server/services/emailWebhook.service.ts`
- Test: `server/services/emailWebhook.service.test.ts`

**Interfaces:**
- Consumes: `getResendInstance`, `runtimeConfig`, repository suppression + eventi (Task 4-5).
- Produces:
  - `interface ResendWebhookEvent { type: string; created_at: string; data: { email_id: string; from: string; to: string[]; subject?: string; click?: { link?: string }; bounce?: { subType?: string } } }`
  - `verifyResendEvent(payload: string, headers: { "svix-id": string; "svix-timestamp": string; "svix-signature": string }): ResendWebhookEvent`
  - `isOwnDomain(from: string): boolean`
  - `handleResendEvent(event: ResendWebhookEvent): Promise<void>`

- [ ] **Step 1: Confermare la firma di `webhooks.verify`**

Run: `grep -n "verify" node_modules/resend/dist/index.d.cts | head`
Expected: vedere il nome esatto del campo secret (`secret` o `webhookSecret`). Allineare lo `Step 3` di conseguenza (la doc ufficiale usa `secret`).

- [ ] **Step 2 [TEST]: Test filtro dominio + dispatch** (mock repo)

```typescript
// emailWebhook.service.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const upsertSuppression = vi.fn();
const insertEmailEvent = vi.fn();
const recordGuestOpen = vi.fn();
const findSeedContext = vi.fn(() => Promise.resolve({ organizationId: "o1", guestId: "g1", eventId: "e1", emailType: "custom" }));
vi.mock("../repositories/emailSuppression.repository", () => ({ upsertSuppression }));
vi.mock("../repositories/emailEvent.repository", () => ({ insertEmailEvent, recordGuestOpen, findSeedContext }));

import { isOwnDomain, handleResendEvent } from "./emailWebhook.service";

beforeEach(() => vi.clearAllMocks());

describe("emailWebhook.service", () => {
    it("isOwnDomain riconosce dominio e sottodominio dell'ambiente", () => {
        expect(isOwnDomain("Ceremly <noreply@airowlgasga.dev>")).toBe(true);
        expect(isOwnDomain("X <inviti@events.airowlgasga.dev>")).toBe(true);
        expect(isOwnDomain("X <a@altrodominio.com>")).toBe(false);
    });

    it("hard bounce → upsert suppression + insert event", async () => {
        await handleResendEvent({ type: "email.bounced", created_at: "2026-01-01T00:00:00Z",
            data: { email_id: "m1", from: "noreply@airowlgasga.dev", to: ["a@x.com"], bounce: { subType: "General" } } });
        expect(upsertSuppression).toHaveBeenCalledWith(expect.objectContaining({ email: "a@x.com", reason: "hard_bounce" }));
        expect(insertEmailEvent).toHaveBeenCalledOnce();
    });

    it("opened con guest → recordGuestOpen", async () => {
        await handleResendEvent({ type: "email.opened", created_at: "2026-01-01T00:00:00Z",
            data: { email_id: "m1", from: "inviti@events.airowlgasga.dev", to: ["g@x.com"] } });
        expect(recordGuestOpen).toHaveBeenCalledWith("g1", expect.any(Date));
        expect(insertEmailEvent).toHaveBeenCalledOnce();
    });
});
```

- [ ] **Step 3 [TEST]: Eseguire → FAIL**, poi implementare il service:

```typescript
import { getResendInstance } from "../utils/drivers";
import { runtimeConfig } from "../utils/runtimeConfig";
import { upsertSuppression } from "../repositories/emailSuppression.repository";
import { insertEmailEvent, recordGuestOpen, findSeedContext } from "../repositories/emailEvent.repository";

export interface ResendWebhookEvent {
    type: string;
    created_at: string;
    data: {
        email_id: string;
        from: string;
        to: string[];
        subject?: string;
        click?: { link?: string };
        bounce?: { subType?: string };
    };
}

/** Verifica la firma Svix tramite l'SDK Resend (usa svix internamente). Lancia se invalida. */
export function verifyResendEvent(
    payload: string,
    headers: { "svix-id": string; "svix-timestamp": string; "svix-signature": string }
): ResendWebhookEvent {
    return getResendInstance().webhooks.verify({
        payload,
        headers,
        secret: runtimeConfig.resendWebhookSecret as string,
    }) as ResendWebhookEvent;
}

function domainOf(from: string): string {
    // "Name <addr@domain>" oppure "addr@domain"
    const m = from.match(/<([^>]+)>/);
    const addr = (m ? m[1] : from).trim();
    return addr.split("@")[1]?.toLowerCase() ?? "";
}

/** True se il `from` appartiene ai domini di QUESTO ambiente (dominio principale o sottodominio eventi). */
export function isOwnDomain(from: string): boolean {
    const d = domainOf(from);
    const own = [runtimeConfig.public.appNotifyEmail, runtimeConfig.public.appEventsNotifyEmail]
        .map((e) => domainOf(String(e ?? "")))
        .filter(Boolean);
    return own.includes(d);
}

export async function handleResendEvent(event: ResendWebhookEvent): Promise<void> {
    const { type, data } = event;
    const recipient = data.to?.[0] ?? "";
    const occurredAt = new Date(event.created_at);
    const ctx = await findSeedContext(data.email_id);

    const baseEvent = {
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
        case "email.opened":
            if (ctx?.guestId) await recordGuestOpen(ctx.guestId, occurredAt);
            await insertEmailEvent({ ...baseEvent, type: "opened" });
            break;
        case "email.clicked":
            await insertEmailEvent({ ...baseEvent, type: "clicked", clickedUrl: data.click?.link });
            break;
        default:
            // evento non gestito → ignora (la rotta risponde comunque 200)
            break;
    }
}
```

- [ ] **Step 4 [TEST]: Eseguire → PASS**

Run: `pnpm test server/services/emailWebhook.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/emailWebhook.service.ts server/services/emailWebhook.service.test.ts
git commit -m "feat(email): service webhook Resend (verify + filtro dominio + dispatch)"
```

---

### Task 8: Rotta webhook `/api/webhooks/resend`

**Files:**
- Create: `server/api/webhooks/resend.post.ts`
- Test: `server/api/webhooks/resend.post.test.ts`

**Interfaces:**
- Consumes: `verifyResendEvent`, `isOwnDomain`, `handleResendEvent` (Task 7), `cacheClient` (`server/utils/drivers.ts`).

- [ ] **Step 1: Implementare la rotta**

```typescript
import { verifyResendEvent, isOwnDomain, handleResendEvent } from "~~/server/services/emailWebhook.service";
import { cacheClient } from "~~/server/utils/drivers";

const DEDUPE_TTL_SECONDS = 86400; // 24h

export default defineEventHandler(async (event) => {
    const payload = await readRawBody(event); // mai readBody (romperebbe la firma)
    if (!payload) throw createError({ statusCode: 400, statusMessage: "Empty body" });

    const headers = {
        "svix-id": getHeader(event, "svix-id") ?? "",
        "svix-timestamp": getHeader(event, "svix-timestamp") ?? "",
        "svix-signature": getHeader(event, "svix-signature") ?? "",
    };

    let parsed;
    try {
        parsed = verifyResendEvent(payload, headers);
    } catch {
        throw createError({ statusCode: 401, statusMessage: "Invalid signature" });
    }

    // Idempotenza: dedup su svix-id, chiave settata SOLO a processing riuscito.
    const dedupeKey = headers["svix-id"] ? `resend:webhook:${headers["svix-id"]}` : undefined;
    if (dedupeKey && (await cacheClient.get(dedupeKey))) {
        return { ok: true, deduped: true };
    }

    // Env isolation: webhook account-wide → processa solo i domini di questo ambiente.
    if (!isOwnDomain(parsed.data.from)) {
        return { ok: true, skipped: "foreign-domain" };
    }

    await handleResendEvent(parsed);

    if (dedupeKey) await cacheClient.set(dedupeKey, "1", DEDUPE_TTL_SECONDS);
    return { ok: true };
});
```

- [ ] **Step 2 [TEST]: Test della rotta** (mock service + cacheClient + h3 helpers)

```typescript
// resend.post.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.stubGlobal("defineEventHandler", (h: unknown) => h);
vi.stubGlobal("readRawBody", vi.fn(() => Promise.resolve('{"type":"email.delivered"}')));
vi.stubGlobal("getHeader", vi.fn((_e: unknown, n: string) => (n === "svix-id" ? "id1" : "x")));
vi.stubGlobal("createError", (o: { statusCode: number }) => Object.assign(new Error("err"), o));

const handleResendEvent = vi.fn();
const verifyResendEvent = vi.fn(() => ({ type: "email.delivered", data: { from: "noreply@airowlgasga.dev", to: ["a@x.com"], email_id: "m1" } }));
const isOwnDomain = vi.fn(() => true);
vi.mock("~~/server/services/emailWebhook.service", () => ({ verifyResendEvent, isOwnDomain, handleResendEvent }));
const get = vi.fn(() => Promise.resolve(null));
const set = vi.fn();
vi.mock("~~/server/utils/drivers", () => ({ cacheClient: { get, set } }));

import handler from "./resend.post";

beforeEach(() => vi.clearAllMocks());

describe("POST /api/webhooks/resend", () => {
    it("processa e setta il dedup a successo", async () => {
        const r = await (handler as any)({});
        expect(handleResendEvent).toHaveBeenCalledOnce();
        expect(set).toHaveBeenCalledWith("resend:webhook:id1", "1", 86400);
        expect(r).toEqual({ ok: true });
    });

    it("dedup hit → non riprocessa", async () => {
        get.mockResolvedValueOnce("1");
        const r = await (handler as any)({});
        expect(handleResendEvent).not.toHaveBeenCalled();
        expect(r).toEqual({ ok: true, deduped: true });
    });
});
```

> Nota: `defineEventHandler`/`readRawBody`/`getHeader`/`createError` sono auto-import Nitro; nel test vanno stubbati come global (vedi sopra). Conferma che `handler` sia esportato di default come la funzione passata a `defineEventHandler` (lo stub la restituisce as-is).

- [ ] **Step 3 [TEST]: Eseguire → PASS**

Run: `pnpm test server/api/webhooks/resend.post.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/api/webhooks/resend.post.ts server/api/webhooks/resend.post.test.ts
git commit -m "feat(email): rotta webhook Resend (verify + dedup + env-filter)"
```

---

### Task 9: Esenzioni middleware + security

**Files:**
- Modify: `server/middleware/0.site-mode.ts` (dopo riga 51)
- Modify: `server/middleware/4.block-bots.ts` (lista riga 5-13)
- Modify: `nuxt.config.ts` (routeRules, dopo il blocco `/api/auth/creem/**` ~riga 172)

**Interfaces:**
- Produces: `/api/webhooks/resend` esente da site-mode gate, bot-block, security (cors/xss/rateLimiter).

- [ ] **Step 1: `0.site-mode.ts`** — aggiungere dopo la riga del Creem skip:

```typescript
    if (path.startsWith("/api/auth/creem/webhook")) return;
    // Webhook Resend: mai gate (eventi delivery/bounce, Resend ritenta a finestra limitata).
    if (path.startsWith("/api/webhooks/resend")) return;
```

- [ ] **Step 2: `4.block-bots.ts`** — aggiungere `/api/webhooks` alla lista di skip:

```typescript
    if (
        path.startsWith("/api/admin") ||
        path.startsWith("/api/auth/") ||
        path.startsWith("/api/jobs") ||
        path.startsWith("/api/cron") ||
        path.startsWith("/api/webhooks")
    ) {
        return;
    }
```

- [ ] **Step 3: `nuxt.config.ts`** — aggiungere la routeRule dopo il blocco Creem:

```typescript
        // Disable security for Resend webhook - ha la sua verifica firma (Svix)
        "/api/webhooks/resend": {
            security: {
                corsHandler: false,
                xssValidator: false,
                rateLimiter: false,
            },
        },
```

- [ ] **Step 4: Verificare typecheck + avvio**

Run: `pnpm typecheck` → PASS
Run: `pnpm dev` → la rotta `/api/webhooks/resend` risponde (401 senza firma valida è atteso).

- [ ] **Step 5: Commit**

```bash
git add server/middleware/0.site-mode.ts server/middleware/4.block-bots.ts nuxt.config.ts
git commit -m "chore(security): esenta /api/webhooks/resend da site-mode/bot/security"
```

---

### Task 10: Setup operativo Resend (manuale) + docs

**Files:**
- Modify: `CLAUDE.md` (sezione Database Schema — correzione `email_logs`)
- Modify: `docs/base/EMAIL-ARCHITECTURE.md` (§6 gap → ora coperto)

**Interfaces:** nessuna (operativo + documentazione).

- [ ] **Step 1: Configurare il tracking dei domini (per ambiente).** Tracking OFF sul dominio principale, ON sul sottodominio eventi (da verificare prima in Resend). Via CLI installato (account dev):

```bash
# verificare/creare il sottodominio events.airowlgasga.dev in Resend (DNS) — dashboard o:
resend domains create --help     # per i flag esatti (name + tracking)
# tracking OFF sul dominio principale, ON sul sottodominio eventi:
resend domains list --json       # individua gli ID
# poi update con openTracking/clickTracking via dashboard o API
```

> Operazione DNS/dashboard: per `events.<dominio>` servono i record DNS dedicati. In prod ripetere su `events.ceremly.com`.

- [ ] **Step 2: Registrare il webhook (per ambiente)** e salvare il secret:

```bash
resend webhooks create \
  --endpoint https://<host-ambiente>/api/webhooks/resend \
  --events email.delivered email.bounced email.complained email.delivery_delayed email.failed email.opened email.clicked
# → stampa il signing_secret (whsec_...): salvarlo come NUXT_RESEND_WEBHOOK_SECRET (env Sensitive)
```

> Account-wide: l'endpoint riceverà eventi di TUTTI i domini → il filtro `isOwnDomain` scarta quelli di altri ambienti. Dev locale: usare `resend webhooks listen --forward-to http://localhost:3000/api/webhooks/resend` invece di registrare un endpoint pubblico.

- [ ] **Step 3: Correggere `CLAUDE.md`** — nella sezione *Database Schema*, sostituire il riferimento alla tabella inesistente `email_logs`:

Vecchio: `..., `email_logs`, ...`
Nuovo: `..., `email_suppressions`, `email_events`, ...` (rimuovere `email_logs`).

- [ ] **Step 4: Aggiornare `docs/base/EMAIL-ARCHITECTURE.md`** — in §6 annotare che il gap "niente webhook" è risolto, con rimando a questo piano/spec.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/base/EMAIL-ARCHITECTURE.md
git commit -m "docs(email): webhook Resend coperti; correzione tabella email_logs"
```

---

## Self-Review

**1. Spec coverage** (spec §3-9):
- §3 architettura (route/service/repo) → Task 7-9 ✓
- §4 modello dati (2 tabelle + correlazione) → Task 3 (tabelle), Task 5 (seed/context), Task 6 (scrittura seed) ✓
- §5 sottodominio tracciato (`getSender`, env) → Task 2 (env) + Task 6 (`getSender`) + Task 10 (config domini) ✓
- §6 data flow (suppression in send, dispatch) → Task 6 + Task 7 ✓
- §7 error handling (401/500/200, dedup post-success, upsert idempotente) → Task 7-8 ✓
- §8 idempotenza + env isolation → Task 8 (dedup + `isOwnDomain`) ✓
- §9 config/secret/registrazione → Task 2 + Task 10 ✓
- §11 fuori scope (inbound, dashboard UI) → non implementati (corretto) ✓

**2. Placeholder scan**: nessun "TBD"/"add error handling" generico; ogni step di codice ha codice reale. Le uniche operazioni manuali (Task 3 Step 4 db:generate TTY; Task 10 DNS/dashboard) sono intrinsecamente operative e hanno comandi espliciti.

**3. Type consistency**: `EmailContext`/`context` (Task 6) consumato in `insertEmailSeed` (Task 5) e passato dai handler (Task 6 Step 9) — nomi coerenti. `verifyResendEvent`/`isOwnDomain`/`handleResendEvent` (Task 7) consumati invariati in Task 8. `findSeedContext` ritorna `{organizationId, guestId, eventId, emailType}` (nullable) e `handleResendEvent` li usa come `?? null` — coerente. `recordGuestOpen(guestId, occurredAt)` definito Task 5, chiamato Task 7 con la stessa firma. ✓

## Note di rischio per l'esecuzione
- **`webhooks.verify` param**: Task 7 Step 1 verifica il nome esatto (`secret` vs `webhookSecret`) dai tipi dell'SDK prima di implementare.
- **Mock auto-import Nitro** (Task 8): `defineEventHandler`/`readRawBody`/`getHeader`/`createError` vanno stubbati come global nei test; in alternativa testare la sola logica estraendola, se gli stub risultano fragili.
- **Test su main assenti**: se si sceglie di NON introdurre Vitest (Task 1), saltare tutti gli step `[TEST]` e validare con `resend webhooks listen --forward-to` (E2E manuale).
