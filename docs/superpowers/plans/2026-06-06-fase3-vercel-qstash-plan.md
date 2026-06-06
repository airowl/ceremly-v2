# FASE 3 — Deploy Vercel serverless + background (QStash + Vercel Cron) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configurare il deploy serverless su Vercel (preset Nitro `vercel`) e spostare ogni lavoro background su coda HTTP (Upstash QStash) o Vercel Cron, eliminando ogni connessione TCP persistente e ogni worker in-process.

**Architecture:** Un'astrazione `server/queue/` con `dispatch()` tipizzato pubblica job HTTP su QStash (payload = solo ID). I consumer `server/api/jobs/[job].post.ts` verificano la firma HMAC QStash sul raw body, poi eseguono handler puri idempotenti (`server/queue/handlers/*`) condivisi anche dal fallback dev in-process. Il cron `server/api/cron/cleanup-files.get.ts` è invocato da Vercel Cron (registrato via `nitro.vercel.config.crons`) e protetto da `CRON_SECRET`. La cache (`cacheClient`, usata come Better Auth `secondaryStorage`) passa da ioredis TCP a Upstash Redis HTTP; il middleware rate-limit con `setInterval` viene rimosso a favore del rateLimiter di `nuxt-security`.

**Tech Stack:** Nuxt 4 + Nitro (preset `vercel`), Upstash QStash (`@upstash/qstash`), Upstash Redis HTTP (`@upstash/redis`), Vercel Cron, Drizzle ORM, Cloudflare R2, Better Auth.

---

## Prerequisiti / Gate (cosa deve essere landed PRIMA)

**DIPENDENZA DURA — FASE 2 (Neon HTTP) deve essere landed prima di iniziare FASE 3.**

Verifica oggettiva eseguita su questo repo (stato attuale, FASE 2 NON ancora landed):

- `server/utils/db.ts:1,3` importa `drizzle-orm/node-postgres` e crea il client con `getPgPool()`.
- `server/utils/drivers.ts:2,3,22-41` importa `ioredis` e `pg`, e crea `new pg.Pool({ max: 90, idleTimeoutMillis: 30000 })` (pool TCP persistente).

Mettere `preset: 'vercel'` su questo pool TCP è rotto sul serverless (ogni invocazione apre connessioni TCP che non vengono mai chiuse → esaurimento connessioni Neon). Per questo lo swap driver a Neon HTTP (`@neondatabase/serverless`, già in `package.json:26`) è **FASE 2** e deve precedere.

Gate per iniziare FASE 3 (eseguire e confermare):

```bash
grep -rIE "node-postgres|getPgPool|new pg\.Pool" server/utils/db.ts server/utils/drivers.ts
```

- **Output atteso DOPO FASE 2 (gate verde): 0 hit.** Se ci sono hit, FASE 2 non è landed → NON procedere con FASE 3.

Conseguenza per la divisione di proprietà del grep finale:

- FASE 3 possiede gli zeri di **`ioredis`** (rimosso da `drivers.ts`) e **`setInterval`** (middleware rate-limit rimosso).
- FASE 2 possiede lo zero di **`new pg`** (pool TCP rimosso).
- Il gate combinato `grep -rIE "ioredis|setInterval|new pg" server/ → 0 hit` passa **solo dopo che entrambe le fasi sono landed**.

Note di stato verificate (non rivalutare):

- Webhook Creem **già esente** dalla security (`nuxt.config.ts:108-115`) e dall'iniezione sessione (`server/middleware/1.auth.ts:16`). Nessuna azione.
- `ioredis` non è in `package.json` (dipendenza transitiva di altro pacchetto): NON si disinstalla. Il gate è sul codice sorgente in `server/`, da cui rimuoviamo l'`import Redis from "ioredis"`.
- L'export GDPR gira con `allEvents: []` stub (`dataExport.service.ts:123`) finché 1c non ripristina il lookup org. Irrilevante per il meccanismo coda.

---

## File Structure (creati/modificati, con responsabilità)

| Path | Azione | Responsabilità |
|------|--------|----------------|
| `package.json` | Modify | Aggiunge `@upstash/qstash` e `@upstash/redis` alle dependencies |
| `server/utils/runtimeConfig.ts` | Modify | Aggiunge `qstashToken`, `qstashCurrentSigningKey`, `qstashNextSigningKey`, `cronSecret`, `upstashRedisRestUrl`, `upstashRedisRestToken` (server scope) |
| `.env.example` | Modify | Allinea `NUXT_NITRO_PRESET=vercel`, rimuove residui Hyperdrive, aggiunge QStash/Upstash/CRON_SECRET |
| `server/queue/types.ts` | Create | Registry tipizzato `JobName` → `JobPayload` (union chiuso) |
| `server/queue/handlers/dataExport.handler.ts` | Create | Handler puro idempotente per il job `data-export` |
| `server/queue/handlers/imageVariant.handler.ts` | Create | Handler puro idempotente per il job `image-variant` |
| `server/queue/handlers/index.ts` | Create | Mappa `JobName` → handler, importata staticamente da route e dinamicamente dal fallback |
| `server/queue/index.ts` | Create | `dispatch<K>()` tipizzato: publish su QStash se token presente, fallback in-process (await) altrimenti |
| `server/api/jobs/[job].post.ts` | Create | Consumer: `readRawBody` → `Receiver.verify` → parse → handler. 401 se firma invalida |
| `server/api/cron/cleanup-files.get.ts` | Create | Endpoint cron: verifica `Authorization: Bearer ${CRON_SECRET}`, esegue `cleanupOrphanFiles` |
| `server/services/dataExport.service.ts` | Modify | Aggiunge `getExportById()` per idempotenza |
| `server/services/user.service.ts` | Modify | Sostituisce `processExport(...).catch(...)` (riga 251) con `await dispatch('data-export', ...)` |
| `server/services/file/fileService.ts` | Modify | Espone `processVariantsForFileId(fileId)` pubblico idempotente; sostituisce i 2 `.catch()` (righe 189, 451) con `await dispatch('image-variant', ...)` |
| `server/utils/drivers.ts` | Modify | Sostituisce SOLO il blocco cache ioredis (43-170) con Upstash Redis HTTP; rimuove `import Redis from "ioredis"` |
| `server/middleware/3.rate-limit.ts` | Delete | Rimuove il rate-limit in-process con `setInterval` (ridondante con `nuxt-security`) |
| `nuxt.config.ts` | Modify | `nitro.preset='vercel'`, `nitro.vercel.config.crons`, `nitro.vercel.functionRules`; esenzioni security `/api/jobs/**` e `/api/cron/**` in `routeRules` |
| `scripts/smoke-qstash.sh` | Create | Smoke runnable: POST `/api/jobs/data-export` con firma garbage → atteso 401 |

---

## Vincoli load-bearing (verificati su codice + doc Nitro/Upstash 2025/2026)

1. **Nuxt nesting:** in questo progetto Nuxt, ogni config Nitro (`preset`, `vercel`) va annidata sotto la chiave `nitro:` di `nuxt.config.ts`, NON top-level. Il blocco `nitro: { routeRules: {...} }` esistente (`nuxt.config.ts:296-303`) è dove vive già la config Nitro: lo si estende.
2. **`receiver.verify({ url })` deve essere identico all'URL pubblicato.** QStash firma l'URL di destinazione nel claim `sub` del JWT. `dispatch` pubblica su `${baseURL}/api/jobs/${job}` con `baseURL = runtimeConfig.public.baseURL`. Il consumer DEVE passare a `verify` la **stessa** stringa, ricostruita da `runtimeConfig.public.baseURL` + nome job dal route param — MAI da `getRequestURL(event)` (il proxy Vercel riscrive host/URL → 401 in prod, verde in dev).
3. **`readRawBody`, mai `readBody`:** la verifica HMAC è sul raw body. Parse SOLO dopo verify.
4. **`xssValidator` muta il body POST** → su `/api/jobs/**` va disattivato (specchio dell'esenzione Creem), altrimenti la firma è invalidata.
5. **Upstash Redis `automaticDeserialization: false`:** Better Auth `secondaryStorage` salva una stringa serializzata e si aspetta la stessa stringa indietro. Il default di `@upstash/redis` fa `JSON.parse` del valore → `get` ritorna un oggetto, non la stringa → sessioni corrotte. Disattivare la deserializzazione e mantenere identica la shape `{get,set,delete}`.
6. **Crons solo via `nitro.vercel.config.crons`** (merge nel Build Output API `config.json`). NON usare `scheduledTasks`/`experimental.tasks`: genererebbero `/_vercel/cron` in conflitto con le rotte `/api/cron/*` (è l'opzione B rifiutata dallo spec). Un solo meccanismo.
7. **L'autorità della config di deploy è `.vercel/output/config.json`** (Build Output API v3), NON un `vercel.json` di root. Il gate runnable per i crons è ispezionare quel file dopo `pnpm build`.
8. **Fallback dev senza ciclo di import:** `fileService → dispatch → handler → fileService` è circolare. Solo `server/queue/index.ts` fa `await import()` dinamico dell'handler nel ramo dev (token assente). Il consumer `[job].post.ts` può importare gli handler staticamente (nessuno importa la route). Il `Client` QStash va costruito lazy solo quando il token è presente.

---

## Task 1 — Installare le dipendenze QStash + Upstash Redis

**Files:**
- Modify: `package.json` (sezione `dependencies`)
- Verify: `node_modules/@upstash/qstash`, `node_modules/@upstash/redis`

Steps:

- [ ] Verifica che le dipendenze NON siano già presenti:
  ```bash
  grep -nE '"@upstash/qstash"|"@upstash/redis"' /Users/airowlgasga/coding/project/boilerplate-saas/package.json || echo "NOT PRESENT (atteso)"
  ```
  Output atteso: `NOT PRESENT (atteso)`.

- [ ] Installa entrambe le dipendenze:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && pnpm add @upstash/qstash @upstash/redis
  ```
  Output atteso: `dependencies:` con `+ @upstash/qstash` e `+ @upstash/redis`, exit code 0.

- [ ] Conferma installazione:
  ```bash
  ls /Users/airowlgasga/coding/project/boilerplate-saas/node_modules/@upstash/qstash >/dev/null && ls /Users/airowlgasga/coding/project/boilerplate-saas/node_modules/@upstash/redis >/dev/null && echo "BOTH INSTALLED"
  ```
  Output atteso: `BOTH INSTALLED`.

- [ ] Commit:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add package.json pnpm-lock.yaml && git commit -m "chore: add @upstash/qstash + @upstash/redis (phase 3)"
  ```

---

## Task 2 — Aggiungere le variabili runtime (server scope)

**Files:**
- Modify: `server/utils/runtimeConfig.ts:44-45` (dopo `adminApiKey`)
- Verify: `pnpm typecheck`

Steps:

- [ ] In `server/utils/runtimeConfig.ts`, aggiungi le nuove variabili a server scope subito dopo la riga `adminApiKey: process.env.NUXT_ADMIN_API_KEY,` (riga 45). Sostituisci:
  ```ts
        // Admin API
        adminApiKey: process.env.NUXT_ADMIN_API_KEY,
  ```
  con:
  ```ts
        // Admin API
        adminApiKey: process.env.NUXT_ADMIN_API_KEY,
        // QStash (background jobs)
        qstashToken: process.env.NUXT_QSTASH_TOKEN,
        qstashCurrentSigningKey: process.env.NUXT_QSTASH_CURRENT_SIGNING_KEY,
        qstashNextSigningKey: process.env.NUXT_QSTASH_NEXT_SIGNING_KEY,
        // Vercel Cron
        cronSecret: process.env.NUXT_CRON_SECRET,
        // Upstash Redis (HTTP cache / Better Auth secondaryStorage)
        upstashRedisRestUrl: process.env.NUXT_UPSTASH_REDIS_REST_URL,
        upstashRedisRestToken: process.env.NUXT_UPSTASH_REDIS_REST_TOKEN,
  ```

- [ ] Esegui il typecheck:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && pnpm typecheck
  ```
  Output atteso: nessun errore relativo a `runtimeConfig.ts` (eventuali errori pre-esistenti non correlati restano invariati).

- [ ] Commit:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add server/utils/runtimeConfig.ts && git commit -m "feat: add qstash/cron/upstash runtime config (phase 3)"
  ```

---

## Task 3 — Allineare `.env.example`

**Files:**
- Modify: `.env.example` — flip `NUXT_NITRO_PRESET` → `vercel`; rimuovi `NUXT_REDIS_URL`; append QStash/Upstash/CRON
- Verify: lettura visiva
- **Accoppiamento con FASE 2 (importante):** FASE 2 ha GIÀ rimosso `NUXT_CF_HYPERDRIVE_ID` e `cloudflare-module` dal commento, **mantenendo** `NUXT_NITRO_PRESET=node-server` (vedi piano FASE 2, Task 6). Questo task **non** tocca Hyperdrive (già assente) e assume lo stato post-FASE-2. Per robustezza gli Edit qui sotto matchano sul **testo stabile**, non sui numeri di riga (che driftano dopo FASE 2).

Steps:

- [ ] In `.env.example`, cambia il valore del preset (match testuale sul token `NUXT_NITRO_PRESET=node-server`, indipendente dal numero di riga). Da:
  ```
  NUXT_NITRO_PRESET=node-server
  ```
  a:
  ```
  NUXT_NITRO_PRESET=vercel                         # vercel (serverless) | node-server (self-host)
  ```
  > Se FASE 2 ha lasciato un commento dopo `node-server`, includilo nell'`old_string` reale al momento dell'esecuzione (rileggi la riga prima dell'Edit).

- [ ] In `.env.example`, rimuovi la riga `NUXT_REDIS_URL` (match testuale; la cache passa a Upstash Redis HTTP in Task 12, `NUXT_REDIS_URL`/ioredis non è più letto dal codice). Elimina:
  ```
  NUXT_REDIS_URL=redis://localhost:6379            # Optional: session caching
  ```
  (Dev locale usa il fallback in-memory; serverless usa Upstash Redis HTTP — vedi blocco UPSTASH più sotto.)

- [ ] In `.env.example`, aggiungi in coda al file (dopo la riga 86, blocco R2):
  ```

  # ==============================================================================
  # BACKGROUND JOBS (Upstash QStash) + VERCEL CRON
  # ==============================================================================
  # Dashboard: https://console.upstash.com/qstash
  # QStash delivers jobs over HTTP to {NUXT_PUBLIC_BASE_URL}/api/jobs/* and auto-retries.
  # In local dev (QSTASH token empty) jobs run in-process; QStash HTTP cannot reach localhost.
  # ------------------------------------------------------------------------------
  NUXT_QSTASH_TOKEN=                               # publish jobs (empty in local dev → in-process fallback)
  NUXT_QSTASH_CURRENT_SIGNING_KEY=                 # verify job signature (HMAC)
  NUXT_QSTASH_NEXT_SIGNING_KEY=                    # verify job signature during key rotation

  # Vercel Cron secret: Vercel sends `Authorization: Bearer ${NUXT_CRON_SECRET}` on GET /api/cron/*
  NUXT_CRON_SECRET=your-cron-secret-min-16-chars

  # ==============================================================================
  # UPSTASH REDIS (HTTP cache — Better Auth secondaryStorage on serverless)
  # ==============================================================================
  # Dashboard: https://console.upstash.com/redis (Global database → REST API)
  # Required when NUXT_NITRO_PRESET=vercel (ioredis TCP is not usable on serverless).
  # ------------------------------------------------------------------------------
  NUXT_UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
  NUXT_UPSTASH_REDIS_REST_TOKEN=your-upstash-rest-token
  ```

- [ ] Commit:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add .env.example && git commit -m "docs: env vars for vercel preset + qstash + upstash (phase 3)"
  ```

---

## Task 4 — Creare il registry tipizzato dei job (`server/queue/types.ts`)

**Files:**
- Create: `server/queue/types.ts`
- Verify: `pnpm typecheck`

> Nota: 3 call site di lavoro async, ma solo **2** job. I due call site variant (`fileService.ts:189` e `:451`) condividono il job `image-variant`.

Steps:

- [ ] Crea `server/queue/types.ts` con:
  ```ts
  /**
   * Typed job registry for the QStash-backed queue.
   * Each JobName maps to a closed payload shape. Payloads carry ONLY IDs
   * (never buffers/base64): the handler re-fetches data from DB/R2.
   */

  export interface JobPayloadMap {
    'data-export': { exportId: string; userId: string }
    'image-variant': { fileId: string }
  }

  export type JobName = keyof JobPayloadMap

  export type JobPayload<K extends JobName> = JobPayloadMap[K]

  export const JOB_NAMES: readonly JobName[] = ['data-export', 'image-variant'] as const

  export function isJobName(value: string): value is JobName {
    return (JOB_NAMES as readonly string[]).includes(value)
  }
  ```

- [ ] Esegui il typecheck:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && pnpm typecheck
  ```
  Output atteso: nessun nuovo errore relativo a `server/queue/types.ts`.

- [ ] Commit:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add server/queue/types.ts && git commit -m "feat: typed job registry for queue (phase 3)"
  ```

---

## Task 5 — Aggiungere `getExportById` per l'idempotenza dell'export

**Files:**
- Modify: `server/services/dataExport.service.ts` (dopo `getExportByToken`, riga 249)
- Verify: `pnpm typecheck`

Steps:

- [ ] In `server/services/dataExport.service.ts`, subito dopo la funzione `getExportByToken` (che termina a riga 249), aggiungi:
  ```ts

  /**
   * Get export request by id (used for idempotency in the queue consumer).
   */
  export async function getExportById(exportId: string) {
      const db = getDB();

      return db.query.dataExports.findFirst({
          where: eq(dataExports.id, exportId),
      });
  }
  ```

- [ ] Verifica che `eq` sia già importato (riga 5: `import { eq, and, desc } from 'drizzle-orm';`) — lo è. Nessun import da aggiungere.

- [ ] Esegui il typecheck:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && pnpm typecheck
  ```
  Output atteso: nessun nuovo errore relativo a `dataExport.service.ts`.

- [ ] Commit:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add server/services/dataExport.service.ts && git commit -m "feat: getExportById for export idempotency (phase 3)"
  ```

---

## Task 6 — Esporre `processVariantsForFileId` pubblico e idempotente in `FileService`

**Files:**
- Modify: `server/services/file/fileService.ts` (import `desc` già presente riga 6; nuovo metodo pubblico dopo `generateAndStoreVariants`, riga 250)
- Verify: `pnpm typecheck`

> Il payload del job variant è `{ fileId }`. Il metodo re-fetcha il record `file` per id, scarica il buffer originale da R2 (`storage.download(record.path)`), ricostruisce `basePath` (rimuove il filename dal path), `mimeType`, `organizationId`, `uploadedBy`, `isPublic`, ed è idempotente (no-op se esistono già varianti per `variantOf === fileId`).

Steps:

- [ ] In `server/services/file/fileService.ts`, subito dopo la chiusura del metodo `generateAndStoreVariants` (riga 250, prima di `requestPresignedUpload` a riga 252), aggiungi il nuovo metodo pubblico:
  ```ts

    /**
     * Public, idempotent entry point used by the queue consumer.
     * Re-fetches the original file by id, downloads its buffer from storage,
     * and generates variants. No-op if variants already exist for this file
     * (QStash may redeliver).
     */
    async processVariantsForFileId(fileId: string): Promise<void> {
      const db = await useDB()

      const [record] = await db.select()
        .from(fileTable)
        .where(eq(fileTable.id, fileId))
        .limit(1)

      if (!record) {
        console.warn(`[fileService] processVariantsForFileId: file ${fileId} not found, skipping`)
        return
      }

      if (!isProcessableImage(record.mimeType)) {
        return
      }

      // Idempotency: skip if variants already generated for this file
      const existingVariant = await db.select({ id: fileTable.id })
        .from(fileTable)
        .where(eq(fileTable.variantOf, fileId))
        .limit(1)

      if (existingVariant.length > 0) {
        return
      }

      const bytes = await this.storage.download(record.path)
      const { Buffer: NodeBuffer } = await import('node:buffer')
      const buffer = NodeBuffer.from(bytes)

      // Reconstruct basePath: strip the filename from the storage path
      const pathParts = record.path.split('/')
      pathParts.pop()
      const basePath = pathParts.join('/')

      await this.generateAndStoreVariants(
        buffer,
        record.mimeType,
        record.id,
        basePath,
        record.organizationId ?? undefined,
        record.uploadedBy ?? undefined,
        record.isPublic,
      )
    }
  ```

- [ ] Esegui il typecheck:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && pnpm typecheck
  ```
  Output atteso: nessun nuovo errore relativo a `fileService.ts`.

- [ ] Commit:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add server/services/file/fileService.ts && git commit -m "feat: public idempotent processVariantsForFileId (phase 3)"
  ```

---

## Task 7 — Creare gli handler dei job (`server/queue/handlers/*`)

**Files:**
- Create: `server/queue/handlers/dataExport.handler.ts`
- Create: `server/queue/handlers/imageVariant.handler.ts`
- Create: `server/queue/handlers/index.ts`
- Verify: `pnpm typecheck`

> Gli handler sono funzioni pure: ricevono il payload tipizzato, eseguono lavoro idempotente, non dipendono dalla sessione utente.

Steps:

- [ ] Crea `server/queue/handlers/dataExport.handler.ts`:
  ```ts
  import type { JobPayload } from '../types'
  import { getExportById, processExport } from '~~/server/services/dataExport.service'

  /**
   * Process a GDPR data export. Idempotent: if the export is already
   * completed (QStash may redeliver), it is a no-op.
   */
  export async function handleDataExport(payload: JobPayload<'data-export'>): Promise<void> {
    const { exportId, userId } = payload

    const existing = await getExportById(exportId)
    if (!existing) {
      console.warn(`[job:data-export] export ${exportId} not found, skipping`)
      return
    }
    if (existing.status === 'completed') {
      return
    }

    await processExport(exportId, userId)
  }
  ```

- [ ] Crea `server/queue/handlers/imageVariant.handler.ts`:
  ```ts
  import type { JobPayload } from '../types'
  import { FileService, useFileManagerConfig } from '~~/server/services/file/fileService'
  import { createR2Storage } from '~~/server/services/file/storage/r2'

  /**
   * Generate image variants for an uploaded file. Idempotent: no-op if
   * variants already exist for this file id.
   */
  export async function handleImageVariant(payload: JobPayload<'image-variant'>): Promise<void> {
    const config = useFileManagerConfig()
    const storage = createR2Storage(config.storage)
    const fileService = new FileService(storage)

    await fileService.processVariantsForFileId(payload.fileId)
  }
  ```

- [ ] Crea `server/queue/handlers/index.ts`:
  ```ts
  import type { JobName, JobPayload } from '../types'
  import { handleDataExport } from './dataExport.handler'
  import { handleImageVariant } from './imageVariant.handler'

  type JobHandler<K extends JobName> = (payload: JobPayload<K>) => Promise<void>

  type JobHandlers = {
    [K in JobName]: JobHandler<K>
  }

  export const jobHandlers: JobHandlers = {
    'data-export': handleDataExport,
    'image-variant': handleImageVariant,
  }

  /**
   * Run a job handler by name. Used by both the QStash consumer route and
   * the in-process dev fallback. Payload is validated/typed by the caller.
   */
  export async function runJob<K extends JobName>(job: K, payload: JobPayload<K>): Promise<void> {
    const handler = jobHandlers[job]
    await handler(payload)
  }
  ```

- [ ] Esegui il typecheck:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && pnpm typecheck
  ```
  Output atteso: nessun nuovo errore relativo a `server/queue/handlers/`.

- [ ] Commit:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add server/queue/handlers && git commit -m "feat: queue job handlers (data-export, image-variant) (phase 3)"
  ```

---

## Task 8 — Creare l'astrazione `dispatch()` (`server/queue/index.ts`)

**Files:**
- Create: `server/queue/index.ts`
- Verify: `pnpm typecheck`

> `dispatch` pubblica su QStash quando `qstashToken` è presente; altrimenti (dev) esegue l'handler in-process con `await` (mai promise droppata). Il `Client` QStash è costruito lazy solo quando il token c'è. Il fallback dev usa `await import()` dinamico degli handler per rompere il ciclo `fileService → dispatch → handler → fileService`. L'URL pubblicato è `${baseURL}/api/jobs/${job}` con `baseURL = runtimeConfig.public.baseURL` — la **stessa** stringa che il consumer userà in `verify`.

Steps:

- [ ] Crea `server/queue/index.ts`:
  ```ts
  import { Client } from '@upstash/qstash'
  import { runtimeConfig } from '~~/server/utils/runtimeConfig'
  import type { JobName, JobPayload } from './types'

  let qstashClient: Client | undefined

  function getQStashClient(token: string): Client {
    if (!qstashClient) {
      qstashClient = new Client({ token })
    }
    return qstashClient
  }

  /**
   * Dispatch a background job.
   * - Production (NUXT_QSTASH_TOKEN set): publish over HTTP to QStash, which
   *   delivers to {baseURL}/api/jobs/{job} and auto-retries.
   * - Local dev (token empty): run the handler in-process with `await`
   *   (QStash HTTP cannot reach localhost). Dynamic import breaks the
   *   import cycle service → dispatch → handler → service.
   *
   * Payload carries ONLY IDs — the handler re-fetches data from DB/R2.
   */
  export async function dispatch<K extends JobName>(job: K, payload: JobPayload<K>): Promise<void> {
    const token = runtimeConfig.qstashToken as string | undefined

    if (!token) {
      // Dev fallback: execute synchronously, in-process.
      const { runJob } = await import('./handlers')
      await runJob(job, payload)
      return
    }

    const baseURL = runtimeConfig.public.baseURL as string | undefined
    if (!baseURL) {
      throw new Error('[queue] runtimeConfig.public.baseURL is required to publish jobs')
    }

    const client = getQStashClient(token)
    await client.publishJSON({
      url: `${baseURL}/api/jobs/${job}`,
      body: payload,
      // Idempotency hint to QStash in addition to handler-level idempotency.
      contentBasedDeduplication: true,
      retries: 3,
    })
  }
  ```

- [ ] Esegui il typecheck:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && pnpm typecheck
  ```
  Output atteso: nessun nuovo errore relativo a `server/queue/index.ts`.

- [ ] Commit:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add server/queue/index.ts && git commit -m "feat: typed dispatch() with dev in-process fallback (phase 3)"
  ```

---

## Task 9 — Creare il consumer `server/api/jobs/[job].post.ts`

**Files:**
- Create: `server/api/jobs/[job].post.ts`
- Verify: `pnpm typecheck`

> Ordine obbligatorio: `getHeader(upstash-signature)` → `readRawBody` → `Receiver.verify({ signature, body, url })` (401 se invalido) → `JSON.parse` DOPO verify → `runJob`. L'`url` passato a `verify` è ricostruito da `runtimeConfig.public.baseURL` + nome job (identico al publish), MAI da `getRequestURL`. Autorizzazione = firma QStash, non sessione. Import statico degli handler (nessuno importa questa route → niente ciclo).

Steps:

- [ ] Crea `server/api/jobs/[job].post.ts`:
  ```ts
  import { Receiver } from '@upstash/qstash'
  import { runJob } from '~~/server/queue/handlers'
  import { isJobName } from '~~/server/queue/types'
  import type { JobName, JobPayload } from '~~/server/queue/types'

  /**
   * QStash job consumer. Authorization is the QStash HMAC signature, NOT the
   * user session. Verify the signature on the RAW body before parsing.
   */
  export default defineEventHandler(async (event) => {
    const config = useRuntimeConfig()

    const jobParam = getRouterParam(event, 'job')
    if (!jobParam || !isJobName(jobParam)) {
      throw createError({ statusCode: 404, statusMessage: 'Unknown job' })
    }
    const job = jobParam as JobName

    const currentSigningKey = config.qstashCurrentSigningKey as string | undefined
    const nextSigningKey = config.qstashNextSigningKey as string | undefined
    if (!currentSigningKey) {
      console.error('[jobs] QStash signing keys not configured')
      throw createError({ statusCode: 500, statusMessage: 'Jobs not configured' })
    }

    const signature = getHeader(event, 'upstash-signature')
    if (!signature) {
      throw createError({ statusCode: 401, statusMessage: 'Missing signature' })
    }

    // RAW body — the HMAC is computed over the raw payload.
    const rawBody = await readRawBody(event)
    if (!rawBody) {
      throw createError({ statusCode: 400, statusMessage: 'Empty body' })
    }
    const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')

    // URL must match exactly what dispatch() published (signed into the JWT `sub`).
    const baseURL = config.public.baseURL as string | undefined
    const url = `${baseURL}/api/jobs/${job}`

    const receiver = new Receiver({
      currentSigningKey,
      nextSigningKey: nextSigningKey ?? currentSigningKey,
    })

    let isValid = false
    try {
      isValid = await receiver.verify({ signature, body, url })
    } catch {
      isValid = false
    }
    if (!isValid) {
      throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })
    }

    // Parse ONLY after the signature is verified.
    const payload = JSON.parse(body) as JobPayload<typeof job>

    await runJob(job, payload)

    return { ok: true }
  })
  ```

- [ ] Esegui il typecheck:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && pnpm typecheck
  ```
  Output atteso: nessun nuovo errore relativo a `server/api/jobs/[job].post.ts`.

- [ ] Commit:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add server/api/jobs && git commit -m "feat: qstash job consumer with HMAC verify on raw body (phase 3)"
  ```

---

## Task 10 — Migrare i 3 call site fire-and-forget a `dispatch()`

**Files:**
- Modify: `server/services/user.service.ts:250-253` (export)
- Modify: `server/services/file/fileService.ts:186-190` (variant upload diretto)
- Modify: `server/services/file/fileService.ts:433-452` (variant confirm presigned)
- Verify: `pnpm typecheck` + grep

Steps:

- [ ] In `server/services/user.service.ts`, aggiungi l'import di `dispatch` in cima al file. Apri il file e verifica gli import esistenti, poi aggiungi dopo gli import esistenti:
  ```ts
  import { dispatch } from '~~/server/queue'
  ```

- [ ] In `server/services/user.service.ts`, sostituisci il blocco fire-and-forget (righe 250-253):
  ```ts
    // Process export in background (in production, use a job queue)
    processExport(exportId, userId).catch((error: unknown) => {
      console.error('Export processing failed:', error)
    })
  ```
  con (NOTA control-flow: se `await dispatch` throwasse, `logAudit` + il `return` finali verrebbero saltati e la riga `pending` resterebbe orfana — bloccando le richieste future via `hasPendingExport`. Se l'enqueue fallisce, marca l'export come `failed` così l'utente può ritentare, poi rilancia):
  ```ts
    // Enqueue export job (QStash in prod, in-process in dev).
    // If enqueue fails, mark the request failed so it doesn't stay pending
    // forever and block future requests via hasPendingExport().
    try {
      await dispatch('data-export', { exportId, userId })
    } catch (error) {
      await updateExportStatus(exportId, 'failed', {
        errorMessage: error instanceof Error ? error.message : 'Failed to enqueue export',
      })
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to start export. Please try again.',
      })
    }
  ```
  Verifica che `updateExportStatus` sia importabile in `user.service.ts`. Controlla:
  ```bash
  grep -n "updateExportStatus\|from '.*dataExport.service'" /Users/airowlgasga/coding/project/boilerplate-saas/server/services/user.service.ts
  ```
  Se `updateExportStatus` non è già importato da `./dataExport.service`, aggiungilo alla riga di import esistente da quel modulo (insieme a `processExport`/`createDataExportRequest`/`hasPendingExport` che `requestDataExport` già usa).

- [ ] Rimuovi l'import ora inutilizzato di `processExport` da `user.service.ts` SE non è usato altrove. Verifica:
  ```bash
  grep -n "processExport" /Users/airowlgasga/coding/project/boilerplate-saas/server/services/user.service.ts
  ```
  Se l'unica occorrenza rimasta è nell'`import`, rimuovi `processExport` dalla lista di import. (Se compare anche altrove, lascialo.)

- [ ] In `server/services/file/fileService.ts`, aggiungi l'import di `dispatch` dopo gli import esistenti (dopo riga 12):
  ```ts
  import { dispatch } from '~~/server/queue'
  ```

- [ ] In `server/services/file/fileService.ts`, sostituisci il blocco variant dell'upload diretto (righe 186-190):
  ```ts
        // Generate image variants (non-blocking, best-effort)
        if (isProcessableImage(mimeType)) {
          this.generateAndStoreVariants(fileBuffer, mimeType, fileRecord.id, basePath, eventId, uploadedBy, isPublic)
            .catch(err => console.error('[fileService] variant generation failed:', err))
        }
  ```
  con (NOTA control-flow: questo blocco è dentro il `try` di `uploadFile`, il cui `catch` a riga 193 logga `'file.uploaded'` come **failure** e **re-throwa**. Un bare `await dispatch` farebbe fallire con 500 un upload riuscito se il publish QStash incespica. Per preservare la resilienza fire-and-forget originale, l'enqueue va in un try/catch locale che logga e prosegue):
  ```ts
        // Enqueue image variant generation (QStash in prod, in-process in dev).
        // Best-effort: an enqueue failure must NOT fail the successful upload
        // (preserves the original fire-and-forget resilience).
        if (isProcessableImage(mimeType)) {
          try {
            await dispatch('image-variant', { fileId: fileRecord.id })
          } catch (err) {
            console.error('[fileService] variant enqueue failed:', err)
          }
        }
  ```

- [ ] In `server/services/file/fileService.ts`, sostituisci il blocco variant del confirm presigned (righe 433-452):
  ```ts
        // Generate image variants for presigned uploads
        if (isProcessableImage(pendingFile.mimeType)) {
          // Extract basePath from the full key (remove the filename part)
          const pathParts = pendingFile.path.split('/')
          pathParts.pop() // Remove filename
          const basePath = pathParts.join('/')

          const { Buffer: NodeBuffer } = await import('node:buffer')
          const buffer = NodeBuffer.from(fileContent)

          this.generateAndStoreVariants(
            buffer,
            pendingFile.mimeType,
            fileId,
            basePath,
            pendingFile.organizationId ?? undefined,
            uploadedBy,
            pendingFile.isPublic,
          ).catch(err => console.error('[fileService] variant generation failed:', err))
        }
  ```
  con (NOTA control-flow: questo blocco è dentro il `try` del check dedup, il cui `catch` a riga 453-455 logga "SHA256/dedup check failed, proceeding" e **inghiotte** l'errore. Un bare `await dispatch` che fallisse produrrebbe un log fuorviante e l'enqueue verrebbe silenziosamente saltato. Try/catch locale dedicato):
  ```ts
        // Enqueue image variant generation (QStash in prod, in-process in dev).
        // The job re-fetches the file by id and downloads the buffer from R2.
        // Best-effort: isolated try/catch so an enqueue failure is logged
        // explicitly and does not get masked by the surrounding dedup catch.
        if (isProcessableImage(pendingFile.mimeType)) {
          try {
            await dispatch('image-variant', { fileId })
          } catch (err) {
            console.error('[fileService] variant enqueue failed:', err)
          }
        }
  ```

- [ ] Verifica che non resti alcun fire-and-forget `.catch(` su variant/export:
  ```bash
  grep -nE "generateAndStoreVariants\(|processExport\(.*\)\.catch" /Users/airowlgasga/coding/project/boilerplate-saas/server/services/file/fileService.ts /Users/airowlgasga/coding/project/boilerplate-saas/server/services/user.service.ts
  ```
  Output atteso: le uniche occorrenze di `generateAndStoreVariants(` sono la definizione del metodo (riga ~209) e la chiamata interna in `processVariantsForFileId` (Task 6). Nessuna chiamata `.catch()` fire-and-forget.

- [ ] Esegui il typecheck:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && pnpm typecheck
  ```
  Output atteso: nessun nuovo errore. In particolare, se `fileContent` o variabili (`pathParts`, `NodeBuffer`, `buffer`) diventano inutilizzate nel blocco confirm, il typecheck/lint le segnalerebbe: rimuovi eventuali variabili ora orfane prima del confirm (es. la riga che leggeva `fileContent` solo per i variant — verifica che `fileContent` sia ancora usato per il calcolo SHA256/dedup prima del blocco; se sì, lascialo).

- [ ] Commit:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add server/services/user.service.ts server/services/file/fileService.ts && git commit -m "feat: route export + image variants through queue dispatch (phase 3)"
  ```

---

## Task 11 — Creare l'endpoint cron `server/api/cron/cleanup-files.get.ts`

**Files:**
- Create: `server/api/cron/cleanup-files.get.ts`
- Verify: `pnpm typecheck`

> Vercel Cron invoca via HTTP GET con header `Authorization: Bearer ${CRON_SECRET}`. Verificare l'header (401 altrimenti). Lavoro idempotente (delete per cutoff). Riusa `cleanupOrphanFiles` (già esistente) e logga via `logAudit`.

Steps:

- [ ] Crea `server/api/cron/cleanup-files.get.ts`:
  ```ts
  import { useFileManagerConfig } from '~~/server/services/file/fileService'
  import { createR2Storage } from '~~/server/services/file/storage/r2'
  import { cleanupOrphanFiles } from '~~/server/services/file/cleanup'
  import { logAudit } from '~~/server/utils/audit'

  /**
   * Vercel Cron endpoint: delete orphaned pending uploads past their grace
   * period. Authorized by `Authorization: Bearer ${CRON_SECRET}` (Vercel
   * Cron sends a GET). Idempotent — safe on missed/duplicate runs.
   */
  export default defineEventHandler(async (event) => {
    const config = useRuntimeConfig()
    const cronSecret = config.cronSecret as string | undefined

    if (!cronSecret) {
      console.error('[cron] CRON_SECRET not configured')
      throw createError({ statusCode: 500, statusMessage: 'Cron not configured' })
    }

    const authorization = getHeader(event, 'authorization')
    if (authorization !== `Bearer ${cronSecret}`) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }

    const fileConfig = useFileManagerConfig()
    const storage = createR2Storage(fileConfig.storage)

    const result = await cleanupOrphanFiles(storage, 1)

    await logAudit(event, 'admin.cleanup_files', {
      targetType: 'system',
      details: {
        graceHours: 1,
        trigger: 'cron',
        ...result,
      },
    })

    return result
  })
  ```

- [ ] `'admin.cleanup_files'` è un audit action valido: è già usato (e compila) in `server/api/admin/cleanup-files.post.ts:23`. Nessuna verifica aggiuntiva necessaria.

- [ ] Esegui il typecheck:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && pnpm typecheck
  ```
  Output atteso: nessun nuovo errore relativo a `server/api/cron/cleanup-files.get.ts`.

- [ ] Commit:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add server/api/cron && git commit -m "feat: vercel cron endpoint for orphan file cleanup (phase 3)"
  ```

---

## Task 12 — Sostituire `cacheClient` ioredis con Upstash Redis HTTP

**Files:**
- Modify: `server/utils/drivers.ts` (rimuovere `import Redis from "ioredis"`; sostituire SOLO il blocco cache, ancorato per testo)
- Verify: `pnpm typecheck` + grep ioredis

> ⚠️ ATTENZIONE NUMERI DI RIGA: questo task gira **dopo** FASE 2, che rimuove il blocco pg (`getDatabaseUrl`/`createPgPool`/`getPgPool`/Hyperdrive, ~30 righe). Quindi **tutti i numeri di riga driftano verso l'alto di ~30** rispetto al file odierno. NON fidarti dei numeri: usa gli **anchor testuali**. Nel file ODIERNO (pre-FASE-2): import `ioredis` a riga 2; commento `// Cache Client` a riga 43; `export const cacheClient = {` chiude con `};` (la riga `};` **immediatamente prima** di `let _resendInstance` / `export const getResendInstance`). **Rileggi il file prima di ogni Edit** e matcha su questi marker, non sui numeri.

> Questo file è co-posseduto con FASE 2. NON toccare la metà driver DB (Neon HTTP, post-FASE-2). Modificare SOLO: (a) la riga di import `ioredis`, (b) il blocco cache. Usare Edit chirurgici ancorati al testo, NON un Write dell'intero file.

Steps:

- [ ] Apri `server/utils/drivers.ts` e individua la riga `import Redis from "ioredis";` (anchor testuale; ~riga 2). Rimuovila con un Edit mirato (sostituisci `import Redis from "ioredis";\n` con stringa vuota, ovvero elimina solo quella riga).

- [ ] Aggiungi l'import di Upstash Redis. Subito sopra `import { runtimeConfig } from "./runtimeConfig";` aggiungi:
  ```ts
  import { Redis as UpstashRedis } from "@upstash/redis";
  ```

- [ ] Sostituisci l'INTERO blocco cache, dal commento `// Cache Client` fino alla riga `};` che **chiude** `export const cacheClient = {...}` (la `};` immediatamente prima di `let _resendInstance`) — **inclusa**. Anchor testuali, non numeri di riga (driftano dopo FASE 2; nel file odierno è il range 43→170, ma rileggi e verifica). Sostituiscilo con:
  ```ts
  // Cache Client
  // node-server / dev: in-memory fallback (ioredis removed; keep self-host simple).
  // serverless (vercel): Upstash Redis over HTTP (no TCP). Used by Better Auth
  //   secondaryStorage — MUST keep the exact string round-trip, so
  //   automaticDeserialization is disabled.
  let upstashClient: UpstashRedis | undefined;

  // In-memory fallback cache for development / node-server without Redis
  const memoryCache = new Map<string, { value: string; expires?: number }>();

  const getUpstashClient = (): UpstashRedis | undefined => {
      if (upstashClient) return upstashClient;

      const url = runtimeConfig.upstashRedisRestUrl as string | undefined;
      const token = runtimeConfig.upstashRedisRestToken as string | undefined;
      if (!url || !token) return undefined;

      upstashClient = new UpstashRedis({
          url,
          token,
          // Better Auth stores a serialized string and expects the SAME string
          // back. Upstash's default JSON.parse would corrupt sessions.
          automaticDeserialization: false,
      });
      return upstashClient;
  };

  // Clean expired entries from memory cache
  const cleanExpiredMemoryCache = () => {
      const now = Date.now();
      for (const [key, entry] of memoryCache) {
          if (entry.expires && entry.expires < now) {
              memoryCache.delete(key);
          }
      }
  };

  export const cacheClient = {
      get: async (key: string): Promise<string | null> => {
          const client = getUpstashClient();
          if (client) {
              try {
                  return await client.get<string>(key);
              } catch {
                  // Fallback to memory on error
              }
          }

          cleanExpiredMemoryCache();
          const entry = memoryCache.get(key);
          if (entry && (!entry.expires || entry.expires > Date.now())) {
              return entry.value;
          }
          return null;
      },

      set: async (key: string, value: string, ttl: number | undefined): Promise<void> => {
          const client = getUpstashClient();
          const stringValue = typeof value === "string" ? value : JSON.stringify(value);

          if (client) {
              try {
                  if (ttl) {
                      await client.set(key, stringValue, { ex: ttl });
                  } else {
                      await client.set(key, stringValue);
                  }
                  return;
              } catch {
                  // Fallback to memory on error
              }
          }

          memoryCache.set(key, {
              value: stringValue,
              expires: ttl ? Date.now() + ttl * 1000 : undefined,
          });
      },

      delete: async (key: string): Promise<void> => {
          const client = getUpstashClient();
          if (client) {
              try {
                  await client.del(key);
                  return;
              } catch {
                  // Fallback to memory on error
              }
          }

          memoryCache.delete(key);
      },
  };
  ```

- [ ] Verifica che `ioredis` non sia più referenziato nel sorgente server:
  ```bash
  grep -rIn "ioredis" /Users/airowlgasga/coding/project/boilerplate-saas/server/
  ```
  Output atteso: **0 hit**.

- [ ] Esegui il typecheck:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && pnpm typecheck
  ```
  Output atteso: nessun nuovo errore relativo a `drivers.ts`. (`runtimeConfig.redisUrl` non è più referenziato da `drivers.ts`; resta definito in `runtimeConfig.ts` come campo di config inerte — non rompe il typecheck. Non rimuoverlo qui per non allargare lo scope.)

- [ ] Commit:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add server/utils/drivers.ts && git commit -m "feat: cacheClient on upstash redis http, drop ioredis (phase 3)"
  ```

---

## Task 13 — Rimuovere il middleware rate-limit con `setInterval`

**Files:**
- Delete: `server/middleware/3.rate-limit.ts`
- Verify: grep setInterval + typecheck

> Il rate-limit in-process con `setInterval` + Map è un timer per-istanza incompatibile col serverless e ridondante con il `rateLimiter` di `nuxt-security` (`nuxt.config.ts:266-269`, già attivo). Non è un job: si rimuove.

Steps:

- [ ] Conferma che `nuxt-security` rateLimiter è attivo (già verificato, `nuxt.config.ts:266-269`):
  ```bash
  grep -n "rateLimiter" /Users/airowlgasga/coding/project/boilerplate-saas/nuxt.config.ts
  ```
  Output atteso: la voce `rateLimiter: { tokensPerInterval: 100, interval: "minute" }` è presente.

- [ ] Elimina il middleware:
  ```bash
  rm /Users/airowlgasga/coding/project/boilerplate-saas/server/middleware/3.rate-limit.ts
  ```

- [ ] Verifica che `setInterval` non sia più presente nel sorgente server:
  ```bash
  grep -rIn "setInterval" /Users/airowlgasga/coding/project/boilerplate-saas/server/
  ```
  Output atteso: **0 hit**.

- [ ] Esegui il typecheck:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && pnpm typecheck
  ```
  Output atteso: nessun nuovo errore (nessun file referenziava il middleware per nome — i middleware Nitro sono auto-discovered).

- [ ] Commit:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add -A server/middleware && git commit -m "refactor: drop in-process setInterval rate-limit (use nuxt-security) (phase 3)"
  ```

---

## Task 13b — Esentare `/api/jobs` e `/api/cron` dai middleware `block-bots` e `site-mode`

**Files:**
- Modify: `server/middleware/4.block-bots.ts` (early-return path, ~riga 6)
- Modify: `server/middleware/0.site-mode.ts` (ramo `waitinglist` ~riga 36, ramo `maintenance` ~riga 69)
- Verify: grep + `pnpm typecheck`

> **Perché (correttezza produzione, non solo smoke):** i consumer job (chiamati da QStash) e gli endpoint cron (chiamati da Vercel Cron) si autenticano con **firma QStash** / **`CRON_SECRET`**, non con la sessione utente. Devono essere raggiungibili **a prescindere** da: (a) `site-mode` — `0.site-mode.ts` ritorna 503 per **tutte** le `/api/*` in `maintenance` e per tutte tranne `/api/waiting-list/` in `waitinglist` → un export QStash o un cron di cleanup si romperebbe quando il sito è in manutenzione; (b) `block-bots` — `4.block-bots.ts` filtra per User-Agent (curl/wget/python-requests → 403) ed esenta per path solo `/api/admin` e `/api/auth/` → fragile se l'UA di QStash/Vercel contenesse una stringa filtrata. La fix esenta entrambi per **path** (early-return), che è robusto. **Effetto collaterale utile:** sblocca lo smoke di Task 16 (curl su `/api/jobs` esce prima del filtro UA).

Steps:

- [ ] In `server/middleware/4.block-bots.ts`, estendi l'esenzione per path (anchor testuale). Da:
  ```ts
    if (path.startsWith("/api/admin") || path.startsWith("/api/auth/")) {
        return;
  ```
  a:
  ```ts
    if (
        path.startsWith("/api/admin") ||
        path.startsWith("/api/auth/") ||
        path.startsWith("/api/jobs") ||
        path.startsWith("/api/cron")
    ) {
        return;
  ```

- [ ] In `server/middleware/0.site-mode.ts`, ramo `waitinglist`, aggiungi l'esenzione accanto a quella di waiting-list. Da:
  ```ts
            // API consentite in waitinglist
            if (path.startsWith("/api/waiting-list/")) return;
  ```
  a:
  ```ts
            // API consentite in waitinglist
            if (path.startsWith("/api/waiting-list/")) return;
            // Background jobs (QStash) e cron (Vercel) passano a prescindere dal site mode
            if (path.startsWith("/api/jobs") || path.startsWith("/api/cron")) return;
  ```

- [ ] In `server/middleware/0.site-mode.ts`, ramo `maintenance`, aggiungi l'esenzione prima del 503. Da:
  ```ts
    if (siteMode === "maintenance") {
        if (path?.startsWith("/api/")) {
            throw createError({
                statusCode: 503,
                statusMessage: "Service Unavailable",
            });
        }
  ```
  a:
  ```ts
    if (siteMode === "maintenance") {
        if (path?.startsWith("/api/")) {
            // Background jobs (QStash) e cron (Vercel) passano anche in maintenance
            if (path.startsWith("/api/jobs") || path.startsWith("/api/cron")) return;
            throw createError({
                statusCode: 503,
                statusMessage: "Service Unavailable",
            });
        }
  ```

- [ ] Verifica le esenzioni e il typecheck:
  ```bash
  grep -nE "api/jobs|api/cron" /Users/airowlgasga/coding/project/boilerplate-saas/server/middleware/4.block-bots.ts /Users/airowlgasga/coding/project/boilerplate-saas/server/middleware/0.site-mode.ts
  cd /Users/airowlgasga/coding/project/boilerplate-saas && pnpm typecheck
  ```
  Output atteso: 3 hit `api/jobs`/`api/cron` (1 in block-bots, 2 in site-mode); typecheck verde.

- [ ] Commit:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add server/middleware/4.block-bots.ts server/middleware/0.site-mode.ts && git commit -m "fix: exempt /api/jobs and /api/cron from block-bots and site-mode (phase 3)"
  ```

---

## Task 14 — Configurare `nuxt.config.ts`: preset vercel + crons + functionRules + esenzioni security

**Files:**
- Modify: `nuxt.config.ts` — `routeRules` (dopo il blocco Creem, riga 115); blocco `nitro` (296-303)
- Verify: `pnpm typecheck`

> Tutta la config Nitro va annidata sotto `nitro:` (Nuxt nesting). Si ESTENDE il blocco `nitro: { routeRules: {...} }` esistente (296-303) aggiungendo `preset`, `vercel.config.crons`, `vercel.functionRules`. Le esenzioni security per `/api/jobs/**` e `/api/cron/**` vanno nel `routeRules` TOP-LEVEL (accanto al blocco Creem), NON in `nitro.routeRules`.

Steps:

- [ ] In `nuxt.config.ts`, subito dopo il blocco Creem nel `routeRules` top-level (chiusura a riga 115), aggiungi le esenzioni jobs/cron. Sostituisci:
  ```ts
          // Disable security for Creem webhook - has its own signature verification
          "/api/auth/creem/**": {
              security: {
                  corsHandler: false,
                  xssValidator: false,
                  rateLimiter: false,
              },
          },

      },
  ```
  con:
  ```ts
          // Disable security for Creem webhook - has its own signature verification
          "/api/auth/creem/**": {
              security: {
                  corsHandler: false,
                  xssValidator: false,
                  rateLimiter: false,
              },
          },

          // QStash job consumers — own HMAC signature verification.
          // xssValidator MUST be off: it mutates the POST body and would
          // invalidate the QStash signature (computed over the raw body).
          "/api/jobs/**": {
              security: {
                  corsHandler: false,
                  xssValidator: false,
                  rateLimiter: false,
              },
          },

          // Vercel Cron endpoints — authorized by CRON_SECRET (GET).
          "/api/cron/**": {
              security: {
                  rateLimiter: false,
              },
          },

      },
  ```

- [ ] In `nuxt.config.ts`, estendi il blocco `nitro` (attualmente 296-303). Sostituisci:
  ```ts
      nitro: {
          routeRules: {
              "/.env": { redirect: "/404" },
              "/.git": { redirect: "/404" },
              "/wp-*": { redirect: "/404" },
              "/config*": { redirect: "/404" },
          },
      },
  ```
  con:
  ```ts
      nitro: {
          preset: process.env.NUXT_NITRO_PRESET || "vercel",
          routeRules: {
              "/.env": { redirect: "/404" },
              "/.git": { redirect: "/404" },
              "/wp-*": { redirect: "/404" },
              "/config*": { redirect: "/404" },
          },
          // Vercel-specific Build Output API config. The authority for deploy
          // config is .vercel/output/config.json (merged from here) — NOT a
          // root vercel.json. Crons invoke /api/cron/* via HTTP GET.
          vercel: {
              config: {
                  crons: [
                      {
                          path: "/api/cron/cleanup-files",
                          // Hobby plan = max 1 run/day. Pro = minute precision.
                          schedule: "0 3 * * *",
                      },
                  ],
              },
              // Background jobs can be slow (export/variant). Raise limits.
              functionRules: {
                  "/api/jobs/**": {
                      maxDuration: 300,
                      memory: 1024,
                  },
              },
          },
      },
  ```

- [ ] Esegui il typecheck:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && pnpm typecheck
  ```
  Output atteso: nessun nuovo errore. (Se i tipi Nitro non riconoscessero `vercel.config.crons`/`functionRules`, è accettabile un cast — ma le versioni correnti di Nitro espongono `vercel` nel preset config; non castare a meno che il typecheck non lo richieda esplicitamente.)

- [ ] Commit:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add nuxt.config.ts && git commit -m "feat: vercel preset + crons + functionRules + jobs/cron security exemptions (phase 3)"
  ```

---

## Task 15 — Build (preset vercel) + verifica del cron nel Build Output

**Files:**
- Verify: `.vercel/output/config.json`

> Due gate distinti: (1) `pnpm build` produce la build Vercel; (2) ispezione di `.vercel/output/config.json` per confermare che il merge dei crons sia avvenuto. Quest'ultimo è la verifica runnable LOCALE che il meccanismo BOA funziona, senza deploy.

Steps:

- [ ] Assicurati che il preset sia `vercel` per il build:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && NUXT_NITRO_PRESET=vercel pnpm build 2>&1 | tail -40
  ```
  Output atteso: la build completa. **NOTA:** l'errore `sharp-wasm32` durante il Nitro build è pre-esistente e ignorabile (vedi Known Issues in CLAUDE.md). La build è considerata riuscita se non emette errori DIVERSI da `sharp-wasm32` e produce `.vercel/output/`.

- [ ] Verifica che esista la directory di output Vercel:
  ```bash
  ls -la /Users/airowlgasga/coding/project/boilerplate-saas/.vercel/output/config.json && echo "BOA config.json EXISTS"
  ```
  Output atteso: `BOA config.json EXISTS`.

- [ ] Verifica che i crons siano presenti nel config BOA e puntino alla rotta cron:
  ```bash
  grep -o '"crons":\[[^]]*\]' /Users/airowlgasga/coding/project/boilerplate-saas/.vercel/output/config.json; echo "---"; grep -c '/api/cron/cleanup-files' /Users/airowlgasga/coding/project/boilerplate-saas/.vercel/output/config.json
  ```
  Output atteso: il blocco `"crons":[...]` contiene `"path":"/api/cron/cleanup-files"` e `"schedule":"0 3 * * *"`; il secondo comando ritorna `>= 1`.
  - **Se il blocco `crons` è ASSENTE o non contiene il path:** il merge `nitro.vercel.config.crons` non è onorato dalla versione corrente di Nitro. RIPIEGO documentato: aggiungere un `vercel.json` di root con `{ "crons": [{ "path": "/api/cron/cleanup-files", "schedule": "0 3 * * *" }] }` e ricostruire, poi rieseguire questo grep. (Questo è il rischio dichiarato nello spec Sez. 2; il gate qui sopra lo cattura PRIMA del deploy.)

- [ ] Verifica che le functionRules per i job siano nel config BOA (maxDuration):
  ```bash
  grep -o 'cleanup-files\|/api/jobs' /Users/airowlgasga/coding/project/boilerplate-saas/.vercel/output/functions 2>/dev/null; ls /Users/airowlgasga/coding/project/boilerplate-saas/.vercel/output/functions/ 2>/dev/null | grep -i "jobs\|cron" || echo "(verificare la presenza delle function dir jobs/cron)"
  ```
  Output atteso: presenza delle directory function per `api/jobs/[job]` e `api/cron/cleanup-files` (la shape esatta dipende dalla versione Nitro; l'importante è che le rotte esistano come function).

- [ ] (Nessun commit: build artifact. `.vercel/output/` è in `.gitignore` o va ignorato.)

---

## Task 16 — Smoke test runnable: firma QStash invalida → 401

**Files:**
- Create: `scripts/smoke-qstash.sh`
- Verify: esecuzione contro `pnpm dev`

> Non si può forgiare una firma QStash valida in un curl (richiede l'HMAC con la signing key), e il path dev bypassa l'HTTP (in-process). La verifica LOCALE runnable è il caso negativo: POST `/api/jobs/data-export` con firma mancante/garbage → atteso **401**. NON esiste bypass dev della verifica firma (sarebbe una falla di sicurezza).
>
> ⚠️ **Dipende da Task 13b** (esenzione `/api/jobs` da `block-bots`/`site-mode`): senza, `4.block-bots.ts` blocca l'User-Agent `curl` con **403** (non 401) e lo smoke fallisce sempre. Per robustezza lo script usa anche un UA non filtrato (`-A`), ma Task 13b deve comunque essere landato per la correttezza in produzione.

Steps:

- [ ] Crea `scripts/smoke-qstash.sh`:
  ```bash
  #!/usr/bin/env bash
  # Smoke test FASE 3: il consumer QStash deve rifiutare richieste senza firma
  # valida. Avvia prima `pnpm dev` in un altro terminale.
  # Atteso: HTTP 401 per entrambi i casi (firma mancante e firma garbage).
  set -euo pipefail

  BASE_URL="${BASE_URL:-http://localhost:3000}"
  JOB_URL="${BASE_URL}/api/jobs/data-export"

  # UA non filtrato da 4.block-bots.ts (curl/wget sono bloccati con 403).
  UA="Upstash-QStash-Smoke"

  echo "== Caso 1: firma mancante =="
  code_missing=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${JOB_URL}" \
    -A "${UA}" \
    -H "Content-Type: application/json" \
    -d '{"exportId":"x","userId":"y"}')
  echo "HTTP ${code_missing} (atteso 401)"

  echo "== Caso 2: firma garbage =="
  code_garbage=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${JOB_URL}" \
    -A "${UA}" \
    -H "Content-Type: application/json" \
    -H "upstash-signature: not-a-valid-signature" \
    -d '{"exportId":"x","userId":"y"}')
  echo "HTTP ${code_garbage} (atteso 401)"

  if [ "${code_missing}" = "401" ] && [ "${code_garbage}" = "401" ]; then
    echo "SMOKE PASS: entrambe le richieste rifiutate con 401"
    exit 0
  else
    echo "SMOKE FAIL: atteso 401/401, ottenuto ${code_missing}/${code_garbage}"
    exit 1
  fi
  ```

- [ ] Rendi eseguibile lo script:
  ```bash
  chmod +x /Users/airowlgasga/coding/project/boilerplate-saas/scripts/smoke-qstash.sh
  ```

- [ ] Avvia il dev server in background e attendi che risponda, poi esegui lo smoke. (Lo smoke richiede `NUXT_QSTASH_CURRENT_SIGNING_KEY` impostata in `.env` perché senza signing key il consumer ritorna 500, non 401; impostane una qualsiasi non vuota per il test, es. `NUXT_QSTASH_CURRENT_SIGNING_KEY=sig_test`.) In un terminale:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && pnpm dev
  ```
  In un altro terminale, una volta che il server è su `http://localhost:3000`:
  ```bash
  /Users/airowlgasga/coding/project/boilerplate-saas/scripts/smoke-qstash.sh
  ```
  Output atteso: `SMOKE PASS: entrambe le richieste rifiutate con 401`, exit code 0.

- [ ] Commit:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add scripts/smoke-qstash.sh && git commit -m "test: qstash consumer rejects unsigned requests with 401 (phase 3)"
  ```

---

## Task 17 — Gate finale + commit di fase

**Files:**
- Verify: grep gates + typecheck + build

Steps:

- [ ] Gate "no TCP/worker persistente" — sorgente server. Esegui:
  ```bash
  grep -rIE "ioredis|setInterval" /Users/airowlgasga/coding/project/boilerplate-saas/server/ ; echo "exit:$?"
  ```
  Output atteso: **0 hit** (exit:1 da grep = nessun match). Questi due zeri sono di proprietà FASE 3.

- [ ] Gate combinato con FASE 2 (`new pg` è di proprietà FASE 2):
  ```bash
  grep -rIE "ioredis|setInterval|new pg" /Users/airowlgasga/coding/project/boilerplate-saas/server/ ; echo "exit:$?"
  ```
  Output atteso DOPO che ENTRAMBE le fasi sono landed: **0 hit**. Se compare `new pg`, FASE 2 non è ancora completata (vedi gate Prerequisiti) — non è un fallimento di FASE 3.

- [ ] Gate "i 3 job passano per la coda" — nessun fire-and-forget residuo:
  ```bash
  grep -rnE "\.catch\(.*console\.error.*(variant|[Ee]xport)" /Users/airowlgasga/coding/project/boilerplate-saas/server/services/ ; echo "exit:$?"
  ```
  Output atteso: 0 hit sui pattern fire-and-forget di variant/export (exit:1).

- [ ] Typecheck finale:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && pnpm typecheck
  ```
  Output atteso: nessun errore introdotto da FASE 3.

- [ ] Build finale (preset vercel):
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && NUXT_NITRO_PRESET=vercel pnpm build 2>&1 | tail -20
  ```
  Output atteso: build riuscita (ignora `sharp-wasm32`).

- [ ] Commit di chiusura fase (se restano modifiche non committate). `.vercel/` e `.output/` sono già in `.gitignore` (verificato: `.gitignore:2,28`), quindi `git add -A` non includerà gli artifact di build. Prima di committare, conferma lo staging:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git status --short
  ```
  Output atteso: nessun path sotto `.vercel/` o `.output/`. Poi:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add -A && git commit -m "feat: vercel serverless deploy + qstash background jobs" || echo "nothing to commit (già committato per task)"
  ```

---

## Checkpoint FASE 3

- [ ] `pnpm build` (preset `vercel`) riuscita (ignora `sharp-wasm32`) — Task 15
- [ ] `crons` presenti in `.vercel/output/config.json` con `path: /api/cron/cleanup-files` — Task 15
- [ ] I 2 job (3 call site) passano per `server/queue/` → `server/api/jobs/[job].post.ts`; firma QStash verificata sul **raw body**; consumer idempotenti — Task 4-10
- [ ] `cleanupOrphanFiles` disponibile via `/api/cron/cleanup-files` con `CRON_SECRET` — Task 11
- [ ] `cacheClient` su Upstash Redis HTTP (`automaticDeserialization: false`), `setInterval` rate-limit rimosso, `grep -rIE "ioredis|setInterval" server/` → 0 hit — Task 12-13, 17
- [ ] Esenzioni `nuxt-security` su `/api/jobs/**` (incl. `xssValidator:false`) e `/api/cron/**`; webhook Creem invariato/esente — Task 14
- [ ] Env QStash/Upstash/CRON_SECRET in `runtimeConfig.ts` + `.env.example` — Task 2-3
- [ ] Smoke: firma QStash invalida → 401 — Task 16
- [ ] Commit: `feat: vercel serverless deploy + qstash background jobs`

---

## Cosa esplicitamente NON copre questo piano

- Swap driver Neon HTTP (`db.ts`/`drivers.ts` metà pg) → **FASE 2** (prerequisito duro).
- Entità-esempio `projects` → **FASE 4**.
- Rebranding/pulizia naming in `.env.example` e `nuxt.config.ts` (chunk `grapesjs` morto a riga 313, site name/datafa.st) → **FASE 5**.
- Ripristino del lookup org nell'export GDPR (`allEvents`) → **1c** (qui si migra solo il *meccanismo* di esecuzione).
