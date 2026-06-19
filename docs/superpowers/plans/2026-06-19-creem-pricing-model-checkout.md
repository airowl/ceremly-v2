# Modello pricing Ceremly + checkout per-evento — Implementation Plan

>**For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development o superpowers:executing-plans — esegui task-by-task, ogni task con il suo gate di verifica (test FAIL→impl→test PASS→commit), commit a fine task, NON saltare i gate. Rispetta la tabella Ownership: nessun file condiviso va editato da due fasi.

**Goal:** Sostituire il modello pricing boilerplate (starter/premium/agency) con il modello reale Ceremly (Free / Celebrazione one-time per-evento / Atelier subscription) e costruire il checkout backend mancante, in particolare lo sblocco per-evento via pagamento one-time Creem.

**Architecture:** Il tier effettivo di un evento è risolto a runtime in tre livelli (org Atelier → illimitato; `events.tier='celebration'` → 250 ospiti; altrimenti Free → 30). Il nuovo modello tier Ceremly vive in funzioni nuove (`eventAccess.service.ts`) ed è separato dal sistema gate org/team B2B legacy (`PRICING_PLANS`/`getPlanLimits`/`getUserPlanInfo`), che resta intatto (Atelier mappato a 'agency' solo per i gate legacy). Lo sblocco one-time è l'unica eccezione consapevole alla regola "i callback webhook non mutano stato".

**Tech Stack:** Nuxt 4 (Nitro, preset vercel) · Vue 3 · TypeScript · Drizzle ORM su Neon HTTP serverless driver · Better Auth + organization plugin · Creem (`@creem_io/better-auth@0.0.13`) · Vitest (introdotto in Fase 0) · React Email + Resend · Vercel Cron.

---

## Global Constraints (verbatim)

- **Nuxt 4 / Nitro serverless su Vercel**: nessun processo persistente, nessun polling/`while(true)`. Background work → QStash HTTP queue (`server/api/jobs/`). Scheduled → Vercel Cron in `nuxt.config.ts` (`nitro.vercel.config.crons`), mai un `vercel.json` root.
- **DB**: Neon HTTP/serverless driver (`@neondatabase/serverless`) via `getDB()` (singleton, preferito). Mai il driver TCP classico.
- **Multi-tenant**: ogni query su risorse tenant DEVE filtrare per `organizationId`. È un requisito di sicurezza.
- **Route thin → service → repository**: le route `server/api/` validano input, chiamano un service, ritornano output (max 20-25 righe). La logica di business vive in `server/services/`; le query Drizzle in `server/repositories/` dietro funzioni domain-named.
- **Provider abstraction**: ogni SDK esterno dietro il suo modulo (`server/storage/`, `server/queue/`, billing/email). Mai chiamare un SDK provider altrove.
- **Body**: sempre `parseBody(event, schema)` — mai `readBody` + `safeParse`. **Query**: sempre `parseQueryParams(event, schema)`. **Schemas**: sempre da `shared/schemas/`.
- **Env**: `useRuntimeConfig()` nelle route — mai `process.env` (nei service usare `runtimeConfig` da `server/utils/runtimeConfig.ts`).
- **Auth**: `requireAuth(event)` come prima operazione nelle route protette. **RBAC**: `requireMember()` / `requireWrite()` / `requireOwner()` (org-scoped).
- **Audit**: `logAudit()` su ogni operazione di write.
- **Error**: try-catch che gestisce `23505` (unique constraint) + re-throw + 500 fallback.
- **i18n**: MAI il carattere `@` nei valori dei messaggi i18n — rompe l'intero file locale (chiavi grezze in SSR), verificabile solo con build. Usare forme senza apostrofo o riformulare.
- **`pnpm db:generate`**: INTERATTIVO (richiede TTY) quando crea/altera colonne — è un blocco manuale eseguito dall'utente in un terminale reale.

---

## Ownership dei file condivisi

Ogni file toccato da più fasi ha UN proprietario. Le altre fasi lo **consumano** (import) senza ri-editarlo.

| File | Proprietario (edita) | Note per le altre fasi |
|---|---|---|
| `vitest.config.ts` | **Fase 0** (crea, unico) | tutte usano `pnpm test` nudo |
| `test/setup.ts` | **Fase 0** (crea, unico) | dotenv di `.env` + polyfill `createError`; NON polyfilla `useRuntimeConfig` |
| `package.json` (script `test` + dep `vitest`) | **Fase 0** | nessun'altra fase aggiunge lo script |
| `server/utils/creem.ts` :: `getPlanFromProductId` | **Fase 1** | Fase 2/3 CONSUMANO `getPlanFromProductId(productId): CeremlyTier \| null` |
| `server/utils/creem.ts` :: webhook handlers (`handleCheckoutCompleted`/`handleRefundCreated`/`setupCreem`) | **Fase 3** | additivo rispetto a Fase 1 (zona diversa del file) |
| `server/services/planLimit.service.ts` | **Fase 1** | `PlanName` resta `'starter'\|'premium'\|'agency'`; Atelier→'agency'. Fase 2 NON ri-edita |
| `server/api/admin/stats/index.get.ts` | **Fase 1** | null-guard `?? 'unknown'` (una volta sola) |
| `app/composables/useSubscription.ts` | **Fase 1** (fix compilazione) → **Fase 5** (redesign) | Fase 1 rimuove i 6 slug; Fase 5 aggiunge `unlockEvent`/`currentTier`. Sequenziali, zone diverse |
| `server/utils/runtimeConfig.ts` | **Fase 1** | env Creem (private+public) |
| `.env` (gitignored, NON committato) | **Fase 1** (struttura dev) + **Fase 6** (valori reali) | committabile SOLO `.env.example` |
| `.env.example` (committato) | **Fase 1** | template; Fase 6 lo riallinea solo se serve |
| `.env.prod` / `.env.staging` (gitignored) | **Fase 6** | popolamento valori reali |
| `server/repositories/eventRepository.ts` | **additivo, non in conflitto** | Fase 2 aggiunge `countActiveEventsByOrg` (modifica filtro); Fase 3 aggiunge `unlockEvent`/`relockEventByOrder`; Fase 4 aggiunge `findStaleEventsToWarn/Delete`/`markEventCleanupWarned`/`findEventWarnTargetInfo`. Funzioni diverse, append in coda. L'unico EDIT in-place è `countActiveEventsByOrg` (Fase 2) |
| `server/utils/audit/types.ts` | Fase 3 (`event.unlocked`/`event.relocked`) + Fase 4 (`event.cleanup_warned`) | additivo, righe diverse nello stesso blocco `// Event (Ceremly …)` |
| `server/utils/creem.test.ts` | **Fase 3** (unico Create — test webhook DB-backed) | il test di `getPlanFromProductId` vive in `server/utils/creem.getPlanFromProductId.test.ts` (Fase 1) |
| `i18n/locales/{it-IT,en-US}.json` | **Fase 5** (tutte le chiavi nuove) | additivo per chiave; verifica `@` e JSON dopo ogni edit |

**Decisione di scope (ADD-only su pricing.ts):** lo spec §3.2 è ADD-only. La Fase 1 NON rimuove `PRICING_PLANS`/`PlanLimits`/`getPlanLimits`/`PRICING_PLANS_LIST` (sistema gate org/team B2B ancora vivo, cablato in `auth.ts`/`organization.service.ts`/`admin/users/[id]/limits`/`api/limits/*`/`seed/verify-*`). La bonifica del boilerplate B2B è **fuori scope** di questo lavoro. Il criterio §15 "nessun riferimento starter/premium/agency" si applica SOLO al nuovo codice pricing-tier e al frontend (Fase 5).

**Nota architetturale chiave (risoluzione del conflitto Fase 1/2):** `isOrgAtelier` (Fase 2) NON legge `getUserPlanInfo().plan` (che resta B2B: Atelier→'agency', mai 'atelier'). Deriva il tier dalla subscription dell'owner via `getPlanFromProductId(subscription.productId) === 'atelier'` — il discriminante Ceremly di Fase 1. È il mirror esatto di `isOrgFreePlan` (che controlla `subscription === null`). Così il sistema B2B legacy resta intatto e il nuovo modello tier vive separato. Tutti i consumatori a valle (`getEventLimits`, `event.service`, `checkout.service`, `eventCleanup.service`) sono automaticamente corretti perché il fix è localizzato in questa sola funzione.

---

## Fase 0 — Setup infrastruttura di test (Vitest)

Obiettivo: introdurre UNA volta sola l'infra di test condivisa da tutte le fasi: `vitest.config.ts`, `test/setup.ts`, lo script `pnpm test`. Verificato sul repo: nessun `vitest.config.*`, nessuno script `test`, `vitest` assente da `package.json`. Tutte le fasi successive assumono questa config e usano `pnpm test` nudo (niente `--env-file`).

> **Vincolo critico verificato (getDB + dotenv).** `getDB()` (`server/utils/db.ts`) legge `runtimeConfig.databaseUrl`. `runtimeConfig.ts` calcola la config all'import: se `globalThis.useRuntimeConfig` NON è una funzione, fa `config()` (dotenv) + `generateRuntimeConfig()` che legge `process.env.NUXT_DATABASE_URL`. Quindi `test/setup.ts` DEVE: (a) caricare `.env` via dotenv così `NUXT_DATABASE_URL` è in `process.env` prima che `runtimeConfig.ts` venga importato; (b) NON polyfillare `globalThis.useRuntimeConfig` (lo shadowing romperebbe `databaseUrl`, lasciando i test DB senza connessione); (c) mantenere SOLO il polyfill di `createError` da `h3` (i service test chiamano `createGuest`/`saveReminders` che lanciano via `createError` auto-import).

---

### Task 0.1 — Installare Vitest + script `test`

**Files:**
- Modify: `package.json` (devDependency `vitest` + script `test`/`test:watch`)

**Interfaces:**
- Produces: comando `pnpm test` (= `vitest run`) eseguibile; `vitest` in `devDependencies`.

- [ ] **Step 1: installa Vitest come devDependency.**
  ```bash
  pnpm add -D vitest@^2
  ```
  Atteso: `vitest` compare in `devDependencies`; `node_modules/.bin/vitest` esiste.

- [ ] **Step 2: aggiungi gli script.** In `package.json`, dentro `"scripts"`, dopo `"lint": "eslint .",`:
  ```json
      "test": "vitest run",
      "test:watch": "vitest",
  ```
  Verifica:
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && node -e "console.log(require('./package.json').scripts.test)"
  ```
  Atteso: `vitest run`.

---

### Task 0.2 — `vitest.config.ts` (unica config) + `test/setup.ts`

**Files:**
- Create: `vitest.config.ts`
- Create: `test/setup.ts`

**Interfaces:**
- Produces: config con `include` su `server/**`, `shared/**`, `test/**`; alias `~~`/`@@`→root, `~`/`@`→`app`; `setupFiles: ['test/setup.ts']`; `fileParallelism: false` (test DB-backed sul branch Neon dev condiviso). `test/setup.ts` carica `.env` via dotenv e polyfilla `createError`.
- Consumes: alias da `.nuxt/tsconfig.json` (verificati: `~~`/`@@`→root, `~`/`@`→app).

- [ ] **Step 1: crea `vitest.config.ts`.** Contenuto completo:
  ```ts
  import { defineConfig } from "vitest/config";
  import { fileURLToPath } from "node:url";

  const root = fileURLToPath(new URL(".", import.meta.url));
  const app = fileURLToPath(new URL("./app", import.meta.url));

  export default defineConfig({
      test: {
          environment: "node",
          include: ["server/**/*.test.ts", "shared/**/*.test.ts", "test/**/*.test.ts"],
          setupFiles: ["./test/setup.ts"],
          // I test DB-backed toccano il branch Neon dev (condiviso dev/staging):
          // niente parallelismo aggressivo per evitare contese sulle righe-fixture.
          fileParallelism: false,
          testTimeout: 20000,
      },
      resolve: {
          alias: {
              "~~": root,
              "@@": root,
              "~": app,
              "@": app,
          },
      },
  });
  ```

- [ ] **Step 2: crea `test/setup.ts`.** Carica `.env` via dotenv (così `getDB()` vede `NUXT_DATABASE_URL` senza `--env-file`) e polyfilla SOLO `createError`. NON polyfillare `useRuntimeConfig` (romperebbe il fallback dotenv di `runtimeConfig.ts` che popola `databaseUrl`). Contenuto completo:
  ```ts
  import { config } from "dotenv";
  import { createError } from "h3";

  // 1) Carica .env in process.env PRIMA che i moduli sotto test importino
  //    server/utils/runtimeConfig.ts. runtimeConfig.ts, fuori dal contesto Nuxt,
  //    fa config()+generateRuntimeConfig() leggendo process.env.NUXT_DATABASE_URL:
  //    così getDB() raggiunge il branch Neon dev senza --env-file.
  config();

  // 2) createError è un auto-import Nitro: undefined in Vitest puro. I service
  //    sotto test (createGuest/createEvent/saveReminders) lo chiamano per i 402/422.
  //    NB: NON polyfillare useRuntimeConfig — shadowerebbe runtimeConfigInstance e
  //    lascerebbe databaseUrl undefined, rompendo i test DB-backed.
  const g = globalThis as Record<string, unknown>;
  if (typeof g.createError !== "function") {
      g.createError = createError;
  }
  ```

- [ ] **Step 3: crea un test sentinella per verificare la toolchain.** Crea `test/setup.smoke.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";

  describe("toolchain", () => {
      it("espone createError come global con statusCode", () => {
          const ce = (globalThis as { createError: (o: { statusCode: number; statusMessage: string }) => { statusCode: number } }).createError;
          expect(ce({ statusCode: 402, statusMessage: "x" }).statusCode).toBe(402);
      });
  });
  ```

- [ ] **Step 4: esegui e verifica PASS.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm test
  ```
  Atteso: `Test Files 1 passed (1)`, `Tests 1 passed (1)`.

- [ ] **Step 5: rimuovi il test sentinella.**
  ```bash
  rm /Users/airowlgasga/coding/project/ceremly-v2/test/setup.smoke.test.ts
  ```

- [ ] **Step 6: commit.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && git add package.json pnpm-lock.yaml vitest.config.ts test/setup.ts && git commit -m "test: infra Vitest condivisa (config unica, setup dotenv, script test)"
  ```

---

## Fase 1 — Schema dati, costanti tier, env, mapping prodotto

Obiettivo: introdurre il modello-dati (i 4 campi `events`) e le costanti del pricing reale Ceremly (tier `free`/`celebration`/`atelier`), sostituire i 6 env Creem boilerplate con `CELEBRATION`+`ATELIER`, e cambiare `getPlanFromProductId` → `CeremlyTier | null`, mantenendo verde `pnpm typecheck`/`pnpm lint`. ADD-only su `pricing.ts` (vedi Decisione di scope). NON ridisegna enforcement/UI (fasi successive).

> **Blast radius (forzato dalla rimozione dei 6 env / dal cambio firma `getPlanFromProductId`):** `events.ts` (+migration), `pricing.ts` (ADD-only), `runtimeConfig.ts`, `creem.ts` (solo `getPlanFromProductId`), `planLimit.service.ts`, `admin/stats/index.get.ts`, `useSubscription.ts` (solo fix compilazione), `.env` (dev, no commit) + `.env.example` (committato). Restano INTOCCATI: `auth.ts`, `organization.service.ts`, `admin/users/[id]/limits.*`, `seed/verify-*`, `usePricing.ts`, `pricing.vue`, `dashboard/subscription`, gli handler webhook di `creem.ts`, `eventRepository.ts`, e i nuovi file delle fasi successive.

> **Strategia di test di fase.** Solo Task 1.5 ha logica testabile (`getPlanFromProductId`): TDD in un file dedicato `server/utils/creem.getPlanFromProductId.test.ts` (di proprietà Fase 1, distinto dal `creem.test.ts` dei webhook di proprietà Fase 3). Gli altri task sono schema/costanti/env: gate = `pnpm typecheck` + `pnpm lint` + grep di assenza residui + migration applicata.

---

### Task 1.1 — Aggiungere i 4 campi tier allo schema `events`

**Files:**
- Modify: `server/database/schema/events.ts` (dopo la colonna `distribution`, prima di `createdAt`)

**Interfaces:**
- Produces (Drizzle columns su `schema.events`): `tier: text("tier").notNull().default("free")` (`'free'|'celebration'`); `unlockedAt: timestamp("unlocked_at")` (nullable); `creemOrderId: text("creem_order_id")` (nullable); `cleanupWarnedAt: timestamp("cleanup_warned_at")` (nullable).
- Consumes: `text`, `timestamp` (già importati da `drizzle-orm/pg-core`).

- [ ] **Step 1: aggiungere le 4 colonne.** In `server/database/schema/events.ts`, subito dopo la colonna `distribution` e prima di `createdAt`:
  ```ts
          // Pricing per-evento (Fase 1). `tier` è SOLO lo stato one-time dell'evento
          // ('free' | 'celebration'); 'atelier' NON è un valore di tier (è una
          // proprietà dell'org/owner risolta a runtime). creemOrderId ricollega un
          // refund.created all'evento da re-lockare; cleanupWarnedAt traccia l'email
          // di avviso del cron di cleanup.
          tier: text("tier").notNull().default("free"),
          unlockedAt: timestamp("unlocked_at"),
          creemOrderId: text("creem_order_id"),
          cleanupWarnedAt: timestamp("cleanup_warned_at"),
  ```

- [ ] **Step 2: typecheck dello schema.**
  ```bash
  pnpm typecheck 2>&1 | grep -i "events.ts" || echo "OK: events.ts pulito"
  ```
  Atteso: nessun errore introdotto da `events.ts` (errori residui a valle appartengono ai task successivi).

- [ ] **Step 3: commit dello schema** (prima della migration: è la fonte da cui `db:generate` legge).
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && git add server/database/schema/events.ts && git commit -m "feat(events): add tier/unlockedAt/creemOrderId/cleanupWarnedAt columns"
  ```

---

### Task 1.2 — Generare e applicare la migration Drizzle (BLOCCO MANUALE — TTY)

**Files:**
- Create: `drizzle/migrations/<timestamp>_<name>.sql` + `drizzle/migrations/meta/` (generati da Drizzle Kit)

**Interfaces:**
- Consumes: `server/database/schema/events.ts` (Task 1.1)
- Produces: SQL con 4 `ALTER TABLE "events" ADD COLUMN ...`

> **BLOCCO MANUALE.** `pnpm db:generate` è INTERATTIVO (chiede conferma del nome — vedi CLAUDE.md "Known Issues"): NON gira in contesto non-TTY. **Questo Task lo esegue l'utente in un terminale reale.** L'agente si ferma qui e attende conferma prima di proseguire la Fase 1.

- [ ] **Step 1 (utente, TTY): generare la migration.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm db:generate
  ```
  Atteso: nuovo file in `drizzle/migrations/` con:
  ```sql
  ALTER TABLE "events" ADD COLUMN "tier" text DEFAULT 'free' NOT NULL;
  ALTER TABLE "events" ADD COLUMN "unlocked_at" timestamp;
  ALTER TABLE "events" ADD COLUMN "creem_order_id" text;
  ALTER TABLE "events" ADD COLUMN "cleanup_warned_at" timestamp;
  ```

- [ ] **Step 2: ispezionare il file generato** (nessun `DROP`/modifica inattesa di altre tabelle).
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && ls -t drizzle/migrations/*.sql | head -1 | xargs grep -nE "events|tier|unlocked_at|creem_order_id|cleanup_warned_at"
  ```
  Atteso: 4 righe `ADD COLUMN`, nessun `DROP`.

- [ ] **Step 3: applicare sul branch Neon dev** (dev+staging condividono il branch `ep-mute-fire`; memoria `ceremly-neon-db-branches`).
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm db:migrate
  ```
  Atteso: le 4 colonne esistono sulla tabella `events` del branch dev.

- [ ] **Step 4: commit della migration.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && git add drizzle/migrations && git commit -m "chore(db): migration for events tier columns"
  ```

---

### Task 1.3 — `shared/constants/pricing.ts` (ADD-only: tier Ceremly)

**Files:**
- Modify: `shared/constants/pricing.ts` (sostituire l'oggetto-literal `CEREMLY_FREE_LIMITS` esistente con l'alias; aggiungere in coda il modello tier). **Non rimuovere** `PRICING_PLANS`/`PlanLimits`/`getPlanLimits`/`PRICING_PLANS_LIST`/`PricingPlan`/`isUnlimited`/`exceedsLimit`/`calculateYearlySavings` (System B2B vivo).

**Interfaces:**
- Produces: `export type CeremlyTier = 'free' | 'celebration' | 'atelier'`; `export const CEREMLY_TIER_LIMITS: Record<CeremlyTier, { maxGuestsPerEvent: number; maxActiveEvents: number; maxReminders: number; unlimited: boolean }>`; `export const CELEBRATION_PRICE_CENTS = 3900`; `export const ATELIER_PRICE_CENTS = 2400`; `export const CEREMLY_FREE_LIMITS = CEREMLY_TIER_LIMITS.free` (alias retro-compat).
- Consumes (preservati): `CEREMLY_FREE_LIMITS.{maxGuestsPerEvent|maxActiveEvents|maxReminders}` letti da `guest.service.ts`/`event.service.ts`/`reminder.service.ts`.

- [ ] **Step 1: rimuovere il vecchio `CEREMLY_FREE_LIMITS` literal** (verrà reintrodotto come alias). Elimina il blocco:
  ```ts
  export const CEREMLY_FREE_LIMITS = {
      maxGuestsPerEvent: 30,
      maxActiveEvents: 1,
      maxReminders: 3,
  } as const;
  ```

- [ ] **Step 2: appendere il modello tier Ceremly** in coda a `shared/constants/pricing.ts`:
  ```ts
  // ============================================================================
  // Modello pricing reale Ceremly (Fase 1) — Free / Celebrazione / Atelier.
  // Affiancato al modello boilerplate starter/premium/agency (B2B legacy ancora
  // cablato nei gate org/team — rimozione FUORI SCOPE).
  // ============================================================================

  /**
   * I tre tier di Ceremly.
   * - 'free'/'celebration' sono stati PER-EVENTO (campo events.tier).
   * - 'atelier' NON è un valore di events.tier: è una proprietà dell'org/owner
   *   (subscription ricorrente attiva), risolta a runtime.
   */
  export type CeremlyTier = 'free' | 'celebration' | 'atelier';

  /**
   * Limiti per tier. `-1` = illimitato.
   *
   * SCOPE MISTO: `maxGuestsPerEvent`/`maxReminders` sono PER-EVENTO (dipendono dal
   * tier dell'evento). `maxActiveEvents` è PER-ORG e ha senso solo per i tier che
   * descrivono un'organizzazione: Free (1) e Atelier (∞). 'celebration' NON è un
   * tier org — è lo stato di un singolo evento — quindi il suo `maxActiveEvents`
   * (-1) è un PLACEHOLDER non usato dall'enforcement: il conteggio eventi guarda
   * se l'ORG è Free o Atelier (vedi countActiveEventsByOrg + isOrgAtelier).
   */
  export const CEREMLY_TIER_LIMITS: Record<
      CeremlyTier,
      { maxGuestsPerEvent: number; maxActiveEvents: number; maxReminders: number; unlimited: boolean }
  > = {
      free: { maxGuestsPerEvent: 30, maxActiveEvents: 1, maxReminders: 3, unlimited: false },
      celebration: { maxGuestsPerEvent: 250, maxActiveEvents: -1, maxReminders: 3, unlimited: false },
      atelier: { maxGuestsPerEvent: -1, maxActiveEvents: -1, maxReminders: -1, unlimited: true },
  };

  /** Prezzo Celebrazione (one-time, centesimi EUR). */
  export const CELEBRATION_PRICE_CENTS = 3900;
  /** Prezzo Atelier (recurring mensile, centesimi EUR). */
  export const ATELIER_PRICE_CENTS = 2400;

  /**
   * Alias retro-compat: i service esistenti (guest/event/reminder) leggono
   * CEREMLY_FREE_LIMITS.{maxGuestsPerEvent|maxActiveEvents|maxReminders}. La Fase 2
   * li sposta su getEventLimits() tier-aware; l'alias li tiene compilanti nel
   * frattempo.
   */
  export const CEREMLY_FREE_LIMITS = CEREMLY_TIER_LIMITS.free;
  ```

- [ ] **Step 3: verificare che i consumatori dell'alias compilino.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && grep -rn "CEREMLY_FREE_LIMITS\." server/services/ && pnpm typecheck 2>&1 | grep -iE "CEREMLY_FREE_LIMITS|pricing.ts" || echo "OK: nessun errore su CEREMLY_FREE_LIMITS/pricing.ts"
  ```
  Atteso: i `grep` mostrano gli accessi `.maxGuestsPerEvent`/`.maxActiveEvents`/`.maxReminders`; nessun errore di typecheck su quei file o su `pricing.ts`.

- [ ] **Step 4: commit.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && git add shared/constants/pricing.ts && git commit -m "feat(pricing): add CeremlyTier model and CEREMLY_TIER_LIMITS (add-only)"
  ```

---

### Task 1.4 — Sostituire i 6 env Creem con `CELEBRATION`+`ATELIER` in `runtimeConfig.ts`

**Files:**
- Modify: `server/utils/runtimeConfig.ts` (blocco private + blocco `public`)

**Interfaces:**
- Produces (private + public): `creemProductIdCelebration: process.env.NUXT_CREEM_PRODUCT_ID_CELEBRATION`, `creemProductIdAtelier: process.env.NUXT_CREEM_PRODUCT_ID_ATELIER`.
- Removes: i 6 `creemProductId{Starter|Premium|Agency}{Month|Year}` (private + public).

- [ ] **Step 1: sostituire il blocco private.** Rimpiazza le 6 righe `creemProductIdStarterMonth ... creemProductIdAgencyYear` con:
  ```ts
          creemProductIdCelebration: process.env.NUXT_CREEM_PRODUCT_ID_CELEBRATION,
          creemProductIdAtelier: process.env.NUXT_CREEM_PRODUCT_ID_ATELIER,
  ```

- [ ] **Step 2: sostituire il blocco public** con le stesse due chiavi (indentazione del blocco `public`):
  ```ts
              creemProductIdCelebration: process.env.NUXT_CREEM_PRODUCT_ID_CELEBRATION,
              creemProductIdAtelier: process.env.NUXT_CREEM_PRODUCT_ID_ATELIER,
  ```

- [ ] **Step 3: verificare i residui** (il typecheck si romperà SOLO in `creem.ts`/`planLimit.service`/`admin/stats`/`useSubscription.ts`, riparati nei Task 1.5-1.7).
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && grep -rnE "creemProductId(Starter|Premium|Agency)(Month|Year)" server app shared
  ```
  Atteso: match SOLO in `server/utils/creem.ts` e `app/composables/useSubscription.ts`; nessun match in `runtimeConfig.ts`.

- [ ] **Step 4: commit.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && git add server/utils/runtimeConfig.ts && git commit -m "feat(config): replace 6 Creem product ids with celebration+atelier"
  ```

---

### Task 1.5 — `getPlanFromProductId` → `CeremlyTier | null` (TDD, file dedicato)

**Files:**
- Modify: `server/utils/creem.ts` (SOLO `getPlanFromProductId`; NON toccare gli handler webhook/`setupCreem` — proprietà Fase 3)
- Create: `server/utils/creem.getPlanFromProductId.test.ts`

**Interfaces:**
- Produces: `export function getPlanFromProductId(productId: string): CeremlyTier | null` — ritorna `'atelier'` per il prodotto Atelier, `null` altrimenti.
- Consumes: `runtimeConfig.creemProductIdAtelier` (Task 1.4), `CeremlyTier` (Task 1.3).

- [ ] **Step 1: scrivi il test che fallisce.** Crea `server/utils/creem.getPlanFromProductId.test.ts`:
  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";

  vi.mock("~~/server/utils/runtimeConfig", () => ({
      runtimeConfig: { creemProductIdAtelier: "prod_atelier_x", creemProductIdCelebration: "prod_celeb_x" },
  }));

  describe("getPlanFromProductId", () => {
      beforeEach(() => vi.resetModules());

      it("mappa il prodotto Atelier -> 'atelier'", async () => {
          const { getPlanFromProductId } = await import("~~/server/utils/creem");
          expect(getPlanFromProductId("prod_atelier_x")).toBe("atelier");
      });

      it("ritorna null per un productId sconosciuto (incluso Celebrazione, che è one-time)", async () => {
          const { getPlanFromProductId } = await import("~~/server/utils/creem");
          expect(getPlanFromProductId("prod_celeb_x")).toBeNull();
          expect(getPlanFromProductId("prod_unknown")).toBeNull();
      });
  });
  ```

- [ ] **Step 2: esegui e verifica FAIL.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm test server/utils/creem.getPlanFromProductId.test.ts
  ```
  Atteso: FAIL — l'implementazione attuale ritorna `"starter"` (non `"atelier"`/`null`).

- [ ] **Step 3: riscrivere `getPlanFromProductId`.** Aggiungi in cima a `server/utils/creem.ts` (dopo l'import di `runtimeConfig`):
  ```ts
  import type { CeremlyTier } from "~~/shared/constants/pricing";
  ```
  Sostituisci l'intera funzione (la versione a 3 branch starter/premium/agency) con:
  ```ts
  /**
   * Mappa un product ID Creem al tier interno. Atelier è l'unico prodotto a
   * subscription ricorrente → unico mappato qui. Celebrazione è one-time
   * per-evento (sblocco gestito via metadata.eventId nel webhook, Fase 3) e NON
   * ha un tier-org. Ritorna null se il product ID è sconosciuto.
   */
  export function getPlanFromProductId(productId: string): CeremlyTier | null {
      if (productId && productId === runtimeConfig.creemProductIdAtelier) return "atelier";
      return null;
  }
  ```

- [ ] **Step 4: esegui e verifica PASS.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm test server/utils/creem.getPlanFromProductId.test.ts
  ```
  Atteso: `2 passed`.

- [ ] **Step 5: typecheck mirato su creem.ts** (gli handler webhook a valle usano `getPlanFromProductId` solo per `logAudit`, accettano il nuovo tipo).
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm typecheck 2>&1 | grep -i "creem.ts" || echo "OK: creem.ts pulito"
  ```
  Atteso: `OK: creem.ts pulito` (gli errori a valle in `planLimit.service.ts`/`admin/stats` sono attesi, riparati nel Task 1.6).

- [ ] **Step 6: commit.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && git add server/utils/creem.ts server/utils/creem.getPlanFromProductId.test.ts && git commit -m "feat(creem): getPlanFromProductId -> CeremlyTier|null (map Atelier)"
  ```

---

### Task 1.6 — Riparare i consumatori server (`planLimit.service` + `admin/stats`)

**Files:**
- Modify: `server/services/planLimit.service.ts` (narrowing in `getUserPlanInfo`)
- Modify: `server/api/admin/stats/index.get.ts` (loop `byPlan`)

**Interfaces:**
- Consumes: `getPlanFromProductId(productId): CeremlyTier | null` (Task 1.5)
- Produces: comportamento invariato — `PlanName` resta `'starter'|'premium'|'agency'`; Atelier mappato a "agency" (limiti illimitati) per non rompere `getPlanLimits(plan)` e i gate org/team. `admin/stats` usa fallback `?? 'unknown'`.

> **Perché Fase 1:** il cambio firma di `getPlanFromProductId` produce errori TS (TS2367: nessun overlap tra `CeremlyTier` e `"starter"|"premium"|"agency"`; index con chiave possibilmente `null`). Sono errori di compilazione, non redesign: si riparano qui. **NON retipizzare `plan` a `'free'|'atelier'`** — reintrodurrebbe il bug (`getPlanLimits('free')`/`('atelier')` fallback silenzioso a 'starter' per ogni org, rompendo i gate B2B).

- [ ] **Step 1: riparare il narrowing in `planLimit.service.ts`.** Sostituisci il blocco di risoluzione del piano (default `"starter"`, branch `=== "starter"|"premium"|"agency"`) con:
  ```ts
      // getPlanFromProductId ora ritorna CeremlyTier|null: l'unico prodotto a
      // subscription è Atelier → mappato al tier B2B legacy "agency" (limiti
      // illimitati) finché il modello org/team boilerplate non viene rimosso.
      let plan: PlanName = "starter";
      if (userSubscription && getPlanFromProductId(userSubscription.productId) === "atelier") {
          plan = "agency";
      }
  ```
  (`PlanName` resta `'starter'|'premium'|'agency'`; `limits: getPlanLimits(plan)` continua a matchare PRICING_PLANS.)

- [ ] **Step 2: riparare l'indexing in `admin/stats/index.get.ts`.** Il loop `byPlan` ora riceve `CeremlyTier | null`: usa fallback string. Sostituisci:
  ```ts
      const plan = getPlanFromProductId(sub.productId);
  ```
  con:
  ```ts
      const plan = getPlanFromProductId(sub.productId) ?? "unknown";
  ```
  (Il loop MRR sottostante usa `PRICING_PLANS`, preservato — resta invariato.)

- [ ] **Step 3: typecheck mirato.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm typecheck 2>&1 | grep -iE "planLimit.service.ts|admin/stats" || echo "OK: planLimit.service e admin/stats puliti"
  ```
  Atteso: `OK: planLimit.service e admin/stats puliti`.

- [ ] **Step 4: commit.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && git add server/services/planLimit.service.ts server/api/admin/stats/index.get.ts && git commit -m "fix(plan-limit): adapt getPlanFromProductId consumers (Atelier->agency, ?? unknown)"
  ```

---

### Task 1.7 — Riparare `useSubscription.ts` (rimuovere i 6 product id)

**Files:**
- Modify: `app/composables/useSubscription.ts` (`getPlanNameFromProductId` + `slugToProductId` in `createCheckoutSession`)

**Interfaces:**
- Consumes: `runtimeConfig.public.creemProductIdCelebration`/`creemProductIdAtelier` (Task 1.4 public)
- Produces: composable compilante — mappa Atelier; rimosso il checkout self-serve a 6 slug.

> **Confine di fase:** fix di SOLA compilazione (i campi `pub.creemProductId{Starter|Premium|Agency}{Month|Year}` non esistono più → errore TS). Il redesign della pagina/flusso è Fase 5; qui si toglie solo il riferimento ai simboli spariti.

- [ ] **Step 1: riscrivere `getPlanNameFromProductId`.** Sostituisci la funzione a 3 branch con:
  ```ts
      function getPlanNameFromProductId(productId: string): string {
          const pub = runtimeConfig.public;
          // Atelier è l'unico prodotto a subscription ricorrente; mappato al tier
          // B2B legacy "agency" per coerenza con il resto della UI piano corrente.
          if (productId === pub.creemProductIdAtelier) return "agency";
          return "starter";
      }
  ```

- [ ] **Step 2: riscrivere `slugToProductId`.** Sostituisci i 6 slug con:
  ```ts
          const slugToProductId: Record<string, string> = {
              atelier: pub.creemProductIdAtelier as string,
          };
  ```

- [ ] **Step 3: verificare assenza residui + typecheck.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && grep -rnE "creemProductId(Starter|Premium|Agency)(Month|Year)" app server shared; pnpm typecheck 2>&1 | grep -i "useSubscription.ts" || echo "OK: useSubscription.ts pulito, nessun residuo"
  ```
  Atteso: nessun match del `grep` (zero riferimenti in tutto il codebase) e `OK: useSubscription.ts pulito`.

- [ ] **Step 4: commit.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && git add app/composables/useSubscription.ts && git commit -m "fix(subscription): drop 6 legacy product-id slugs, keep atelier"
  ```

---

### Task 1.8 — Aggiornare gli env file (`.env` dev no-commit + `.env.example` committato)

**Files:**
- Modify: `.env` (gitignored — modifica locale per dev, **NON committata**)
- Modify: `.env.example` (committato — template)

**Interfaces:**
- Produces (env): `NUXT_CREEM_PRODUCT_ID_CELEBRATION`, `NUXT_CREEM_PRODUCT_ID_ATELIER`
- Removes (env): i 6 `NUXT_CREEM_PRODUCT_ID_{STARTER|PREMIUM|AGENCY}_{MONTH|YEAR}`

> **Git tracking verificato:** solo `.env.example` è tracciato; `.env`/`.env.prod`/`.env.staging` sono gitignored (`.env.*` con `!.env.example`). Questo Task tocca la STRUTTURA (chiavi) in `.env` (dev) e `.env.example` (template) e committa SOLO `.env.example`. I VALORI reali `prod_...` e i file `.env.prod`/`.env.staging` sono popolati in Fase 6.

- [ ] **Step 1: sostituire le 6 righe in `.env`** (dev, valori placeholder). Rimpiazza il blocco dei 6 prodotti con:
  ```
  NUXT_CREEM_PRODUCT_ID_CELEBRATION=prod_celebration_id
  NUXT_CREEM_PRODUCT_ID_ATELIER=prod_atelier_id
  ```

- [ ] **Step 2: sostituire le 6 righe + commento in `.env.example`.** Rimpiazza con:
  ```
  # Creem Product IDs (from Products page). Due prodotti:
  #  - Celebrazione: one-time, per-evento (3900 cent EUR)
  #  - Atelier: recurring monthly, sales-led (2400 cent EUR/mese)
  NUXT_CREEM_PRODUCT_ID_CELEBRATION=prod_celebration_id
  NUXT_CREEM_PRODUCT_ID_ATELIER=prod_atelier_id
  ```

- [ ] **Step 3: verificare assenza dei 6 vecchi env.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && grep -nE "NUXT_CREEM_PRODUCT_ID_(STARTER|PREMIUM|AGENCY)" .env .env.example 2>/dev/null && echo "RESIDUI TROVATI" || echo "OK: nessun residuo"
  ```
  Atteso: `OK: nessun residuo`.

- [ ] **Step 4: commit SOLO `.env.example`** (`.env` è gitignored — non aggiungerlo).
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && git add .env.example && git commit -m "chore(env): replace 6 Creem product ids with celebration+atelier (template)"
  ```
  > Nota: `.env.prod`/`.env.staging`/Vercel sono sincronizzati in Fase 6 (Task 6.3) con i valori reali.

---

### Task 1.9 — Verifica finale di fase

**Files:** nessuna modifica (gate).

- [ ] **Step 1: typecheck pulito sull'intero progetto.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm typecheck 2>&1 | tail -25
  ```
  Atteso: nessun errore. In particolare puliti `creem.ts`, `planLimit.service.ts`, `admin/stats`, `useSubscription.ts`, `pricing.ts`, `runtimeConfig.ts`, `events.ts`.

- [ ] **Step 2: lint pulito.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm lint 2>&1 | tail -15
  ```

- [ ] **Step 3: test della fase.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm test server/utils/creem.getPlanFromProductId.test.ts
  ```
  Atteso: `2 passed`.

- [ ] **Step 4: zero riferimenti residui ai product-id rimossi** (le occorrenze `starter|premium|agency` del System B2B vivo restano per Decisione di scope).
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && echo "--- env ---"; grep -nE "NUXT_CREEM_PRODUCT_ID_(STARTER|PREMIUM|AGENCY)" .env .env.example 2>/dev/null; echo "--- code ---"; grep -rnE "creemProductId(Starter|Premium|Agency)(Month|Year)" app server shared; echo "=== fine (nessun output sopra = OK) ==="
  ```
  Atteso: nessun match sopra `=== fine ===`.

- [ ] **Step 5: confermare la migration applicata sul branch dev** (Task 1.2).
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && ls -t drizzle/migrations/*.sql | head -1 && git status --short
  ```
  Atteso: migration presente e committata; working tree clean.

---

## Fase 2 — Risoluzione tier & enforcement limiti

Obiettivo: introdurre la risoluzione del tier effettivo per-evento (`eventAccess.service.ts`) e applicare i limiti tier-aware su ospiti, eventi e reminder, mantenendo i codici HTTP attuali (402 ospiti/eventi, 422 reminder). Tutto coperto da test Vitest (usano l'infra di Fase 0, `pnpm test` nudo).

> **CONSUME-ONLY dalla Fase 1.** Questa fase NON ri-edita `server/utils/creem.ts`, `server/services/planLimit.service.ts`, `server/api/admin/stats/index.get.ts`: la Fase 1 li ha già portati allo stato finale (`getPlanFromProductId → CeremlyTier|null`; `PlanName` resta B2B; Atelier→'agency'; `?? 'unknown'`). La Fase 2 li CONSUMA via import. Possiede SOLO: `eventAccess.service.ts` (nuovo), `guest.service.ts`, `event.service.ts`, `reminder.service.ts`, e l'EDIT in-place di `countActiveEventsByOrg` in `eventRepository.ts`.

> **Precondizioni (verificare, non ricreare):** Fase 0 (vitest) + Fase 1 (4 colonne `events` migrate sul branch dev; `CeremlyTier`/`CEREMLY_TIER_LIMITS` in `pricing.ts`; `getPlanFromProductId → CeremlyTier|null`; `runtimeConfig.creemProductIdAtelier`). Guard: `grep -q "CEREMLY_TIER_LIMITS" shared/constants/pricing.ts && pnpm typecheck >/dev/null 2>&1 && echo OK`. Se non stampa OK, le fasi a monte non sono complete.

---

### Task 2.1 — `eventAccess.service.ts`: `isOrgAtelier` + `getEventLimits` (TDD)

**Files:**
- Create: `server/services/eventAccess.service.ts`
- Create: `server/services/eventAccess.service.test.ts`

**Interfaces:**
- Consumes: `resolveOrgOwnerId`, `getUserPlanInfo` da `./planLimit.service` (Fase 1); `getPlanFromProductId` da `~~/server/utils/creem` (Fase 1); `CeremlyTier`, `CEREMLY_TIER_LIMITS` da `~~/shared/constants/pricing` (Fase 1).
- Produces:
  - `export async function isOrgAtelier(organizationId: string): Promise<boolean>` — risolve l'owner via `resolveOrgOwnerId`, legge `getUserPlanInfo(ownerId).subscription`, true se la subscription esiste E `getPlanFromProductId(subscription.productId) === 'atelier'`.
  - `export async function getEventLimits(event: { id: string; organizationId: string; tier: string }): Promise<{ tier: CeremlyTier; maxGuestsPerEvent: number; maxReminders: number }>` — 1) `isOrgAtelier` → atelier; 2) `event.tier === 'celebration'` → celebration; 3) free.

> **NOTA CRITICA (risoluzione conflitto Fase 1/2).** `isOrgAtelier` NON usa `getUserPlanInfo().plan` (che è B2B: Atelier→'agency', mai 'atelier'). Deriva il tier dalla subscription dell'owner via `getPlanFromProductId(subscription.productId)`. È il mirror di `isOrgFreePlan` (che controlla `subscription === null`). Questo tiene il sistema B2B legacy intatto e localizza il discriminante Ceremly qui.

- [ ] **Step 1: scrivi il test che fallisce.** Crea `server/services/eventAccess.service.test.ts`:
  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";

  const resolveOrgOwnerId = vi.fn();
  const getUserPlanInfo = vi.fn();
  const getPlanFromProductId = vi.fn();

  vi.mock("~~/server/services/planLimit.service", () => ({
      resolveOrgOwnerId: (...a: unknown[]) => resolveOrgOwnerId(...a),
      getUserPlanInfo: (...a: unknown[]) => getUserPlanInfo(...a),
  }));
  vi.mock("~~/server/utils/creem", () => ({
      getPlanFromProductId: (...a: unknown[]) => getPlanFromProductId(...a),
  }));

  describe("isOrgAtelier", () => {
      beforeEach(() => {
          vi.resetModules();
          [resolveOrgOwnerId, getUserPlanInfo, getPlanFromProductId].forEach((m) => m.mockReset());
      });

      it("true se la subscription dell'owner mappa a 'atelier'", async () => {
          resolveOrgOwnerId.mockResolvedValue("user_owner");
          getUserPlanInfo.mockResolvedValue({ subscription: { productId: "prod_atelier" } });
          getPlanFromProductId.mockReturnValue("atelier");
          const { isOrgAtelier } = await import("~~/server/services/eventAccess.service");
          expect(await isOrgAtelier("org_1")).toBe(true);
      });

      it("false se l'owner non ha subscription", async () => {
          resolveOrgOwnerId.mockResolvedValue("user_owner");
          getUserPlanInfo.mockResolvedValue({ subscription: null });
          const { isOrgAtelier } = await import("~~/server/services/eventAccess.service");
          expect(await isOrgAtelier("org_1")).toBe(false);
      });

      it("false se la subscription non mappa a 'atelier' (es. prodotto sconosciuto)", async () => {
          resolveOrgOwnerId.mockResolvedValue("user_owner");
          getUserPlanInfo.mockResolvedValue({ subscription: { productId: "prod_x" } });
          getPlanFromProductId.mockReturnValue(null);
          const { isOrgAtelier } = await import("~~/server/services/eventAccess.service");
          expect(await isOrgAtelier("org_1")).toBe(false);
      });

      it("false se l'org non ha owner risolvibile", async () => {
          resolveOrgOwnerId.mockResolvedValue(null);
          const { isOrgAtelier } = await import("~~/server/services/eventAccess.service");
          expect(await isOrgAtelier("org_1")).toBe(false);
      });
  });

  describe("getEventLimits", () => {
      beforeEach(() => {
          vi.resetModules();
          [resolveOrgOwnerId, getUserPlanInfo, getPlanFromProductId].forEach((m) => m.mockReset());
      });

      it("org atelier -> tier atelier, illimitato (-1)", async () => {
          resolveOrgOwnerId.mockResolvedValue("u");
          getUserPlanInfo.mockResolvedValue({ subscription: { productId: "prod_atelier" } });
          getPlanFromProductId.mockReturnValue("atelier");
          const { getEventLimits } = await import("~~/server/services/eventAccess.service");
          const l = await getEventLimits({ id: "e1", organizationId: "org_1", tier: "free" });
          expect(l).toEqual({ tier: "atelier", maxGuestsPerEvent: -1, maxReminders: -1 });
      });

      it("evento celebration su org free -> tier celebration (250 ospiti, 3 reminder)", async () => {
          resolveOrgOwnerId.mockResolvedValue("u");
          getUserPlanInfo.mockResolvedValue({ subscription: null });
          const { getEventLimits } = await import("~~/server/services/eventAccess.service");
          const l = await getEventLimits({ id: "e1", organizationId: "org_1", tier: "celebration" });
          expect(l).toEqual({ tier: "celebration", maxGuestsPerEvent: 250, maxReminders: 3 });
      });

      it("evento free su org free -> tier free (30 ospiti, 3 reminder)", async () => {
          resolveOrgOwnerId.mockResolvedValue("u");
          getUserPlanInfo.mockResolvedValue({ subscription: null });
          const { getEventLimits } = await import("~~/server/services/eventAccess.service");
          const l = await getEventLimits({ id: "e1", organizationId: "org_1", tier: "free" });
          expect(l).toEqual({ tier: "free", maxGuestsPerEvent: 30, maxReminders: 3 });
      });
  });
  ```

- [ ] **Step 2: esegui e verifica FAIL.**
  ```bash
  pnpm test server/services/eventAccess.service.test.ts
  ```
  Atteso: `Failed to load .../eventAccess.service` (il file non esiste).

- [ ] **Step 3: implementazione minima.** Crea `server/services/eventAccess.service.ts`:
  ```ts
  /**
   * Event Access Service — risoluzione del tier EFFETTIVO di un evento (design §4).
   *
   * Tre livelli, in ordine:
   *   1. org dell'owner su Atelier (subscription attiva) -> atelier (illimitato);
   *   2. altrimenti event.tier === 'celebration'          -> celebration (250);
   *   3. altrimenti                                        -> free (30).
   *
   * isOrgAtelier deriva il tier dalla SUBSCRIPTION dell'owner via
   * getPlanFromProductId (discriminante Ceremly), NON da getUserPlanInfo().plan
   * (che resta B2B: Atelier->'agency'). Mirror di isOrgFreePlan. Così il sistema
   * gate org/team legacy resta intatto.
   */
  import type { CeremlyTier } from "~~/shared/constants/pricing";
  import { CEREMLY_TIER_LIMITS } from "~~/shared/constants/pricing";
  import { resolveOrgOwnerId, getUserPlanInfo } from "./planLimit.service";
  import { getPlanFromProductId } from "~~/server/utils/creem";

  /**
   * True se l'ORG è su Atelier: l'owner ha una subscription Creem la cui productId
   * mappa a 'atelier'. Org senza owner/subscription -> NON Atelier (fail-safe
   * verso i limiti Free, mai verso illimitato).
   */
  export async function isOrgAtelier(organizationId: string): Promise<boolean> {
      const ownerId = await resolveOrgOwnerId(organizationId);
      if (!ownerId) return false;
      const { subscription } = await getUserPlanInfo(ownerId);
      if (!subscription?.productId) return false;
      return getPlanFromProductId(subscription.productId) === "atelier";
  }

  /** Limiti per-evento risolti dal tier effettivo. -1 = illimitato (atelier). */
  export async function getEventLimits(event: {
      id: string;
      organizationId: string;
      tier: string;
  }): Promise<{ tier: CeremlyTier; maxGuestsPerEvent: number; maxReminders: number }> {
      if (await isOrgAtelier(event.organizationId)) {
          const l = CEREMLY_TIER_LIMITS.atelier;
          return { tier: "atelier", maxGuestsPerEvent: l.maxGuestsPerEvent, maxReminders: l.maxReminders };
      }
      if (event.tier === "celebration") {
          const l = CEREMLY_TIER_LIMITS.celebration;
          return { tier: "celebration", maxGuestsPerEvent: l.maxGuestsPerEvent, maxReminders: l.maxReminders };
      }
      const l = CEREMLY_TIER_LIMITS.free;
      return { tier: "free", maxGuestsPerEvent: l.maxGuestsPerEvent, maxReminders: l.maxReminders };
  }
  ```

- [ ] **Step 4: esegui e verifica PASS.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm test server/services/eventAccess.service.test.ts
  ```
  Atteso: `7 passed`.

- [ ] **Step 5: commit.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && git add server/services/eventAccess.service.ts server/services/eventAccess.service.test.ts && git commit -m "feat(eventAccess): isOrgAtelier (via getPlanFromProductId) + getEventLimits"
  ```

---

### Task 2.2 — `countActiveEventsByOrg` filtra `tier='free'` (TDD DB-backed)

**Files:**
- Modify: `server/repositories/eventRepository.ts` (import `eq` se assente; `countActiveEventsByOrg` — EDIT in-place)
- Create: `server/repositories/eventRepository.count.test.ts`

**Interfaces:**
- Produces: `countActiveEventsByOrg(organizationId): Promise<number>` — conta `status != 'closed' AND tier = 'free'` (gli eventi sbloccati NON consumano lo slot Free).
- Consumes: `schema.events.tier` (Fase 1).

> **UNICO caso che richiede DB reale (Neon dev branch).** Il comportamento vive nel filtro SQL `tier='free'`: un mock circolare non testa nulla. Test repo che inserisce 1 evento free + 1 celebration + 1 closed sotto un `organizationId` random e asserisce `count === 1`. **Teardown obbligatorio in `afterEach`** (branch dev condiviso dev/staging): org random, cleanup completo.

- [ ] **Step 1: aggiungi il filtro `tier='free'`.** In `countActiveEventsByOrg`, aggiungi `eq(schema.events.tier, "free")` dentro l'`and(...)` esistente (accanto a `eq(organizationId)` e `ne(status, "closed")`), con commento:
  ```ts
  /**
   * Conta gli eventi "attivi" dell'org per il limite Free: status != 'closed'
   * AND tier = 'free'. Gli eventi sbloccati (tier='celebration') NON consumano lo
   * slot Free (design §2.2): dopo aver pagato un evento, l'utente Free può crearne
   * un altro di prova.
   */
  ```
  Risultato del `where`:
  ```ts
          .where(
              and(
                  eq(schema.events.organizationId, organizationId),
                  ne(schema.events.status, "closed"),
                  eq(schema.events.tier, "free"),
              ),
          );
  ```
  (Verifica che `eq` sia importato da `drizzle-orm` in cima al file; se manca, aggiungilo.)

- [ ] **Step 2: scrivi il test DB-backed.** Crea `server/repositories/eventRepository.count.test.ts`:
  ```ts
  import { describe, it, expect, afterEach } from "vitest";
  import { randomUUID } from "node:crypto";
  import { eq } from "drizzle-orm";
  import { getDB } from "~~/server/utils/db";
  import * as schema from "~~/server/database/schema";
  import { countActiveEventsByOrg } from "~~/server/repositories/eventRepository";

  const db = getDB();
  let orgId = "";

  async function makeOrg(): Promise<string> {
      const id = `org_test_${randomUUID()}`;
      await db.insert(schema.organization).values({ id, name: "test-count", slug: `test-count-${randomUUID()}`, createdAt: new Date() });
      return id;
  }

  function eventValues(orgId: string, status: string, tier: string) {
      return { organizationId: orgId, type: "compleanno", templateKey: "compleanno-default", title: "t", slug: `slug-${randomUUID()}`, status, tier };
  }

  afterEach(async () => {
      if (!orgId) return;
      await db.delete(schema.events).where(eq(schema.events.organizationId, orgId));
      await db.delete(schema.organization).where(eq(schema.organization.id, orgId));
      orgId = "";
  });

  describe("countActiveEventsByOrg", () => {
      it("conta solo eventi tier='free' non chiusi; celebration non consuma slot", async () => {
          orgId = await makeOrg();
          await db.insert(schema.events).values(eventValues(orgId, "draft", "free"));
          await db.insert(schema.events).values(eventValues(orgId, "draft", "celebration"));
          await db.insert(schema.events).values(eventValues(orgId, "closed", "free"));
          expect(await countActiveEventsByOrg(orgId)).toBe(1);
      });
  });
  ```
  > Se l'insert di `organization`/`events` fallisce per campi NOT NULL mancanti, leggi `server/database/schema/auth.ts` (`organization`) e `events.ts` e aggiungi i campi obbligatori a `makeOrg`/`eventValues`. È l'unica dipendenza dallo schema reale.

- [ ] **Step 3: esegui contro il branch Neon dev** (`pnpm test` nudo — `test/setup.ts` carica `.env`).
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm test server/repositories/eventRepository.count.test.ts
  ```
  Atteso: `1 passed`.

- [ ] **Step 4: verifica il cleanup (nessun residuo).**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && node --env-file=.env -e "const{neon}=require('@neondatabase/serverless');const sql=neon(process.env.NUXT_DATABASE_URL);sql\`select count(*)::int as c from organization where id like 'org_test_%'\`.then(r=>console.log('residui:',r[0].c))"
  ```
  Atteso: `residui: 0`.

- [ ] **Step 5: commit.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && git add server/repositories/eventRepository.ts server/repositories/eventRepository.count.test.ts && git commit -m "feat(events): countActiveEventsByOrg filters tier='free'"
  ```

---

### Task 2.3 — Enforcement ospiti tier-aware (`guest.service.ts`)

**Files:**
- Modify: `server/services/guest.service.ts` (import; `createGuest`; `importGuests`; costante `FREE_GUEST_LIMIT_REASON`)
- Create: `server/services/guest.service.test.ts`

**Interfaces:**
- Consumes: `getEventLimits` da `./eventAccess.service` (Task 2.1); `requireEventScoped` (ritorna `{ organizationId, eventRow }` con `eventRow.tier`); `countActiveGuests`, `findActiveGuestNames`, `findActiveGuestEmails` (invariate).
- Produces: `createGuest` lancia 402 quando `countActiveGuests >= getEventLimits(event).maxGuestsPerEvent` (saltato se `=== -1`); `importGuests.capacity` derivata da `getEventLimits` (`-1` → `Infinity`).

- [ ] **Step 1: scrivi il test che fallisce.** Crea `server/services/guest.service.test.ts`:
  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";

  const findEventByIdScoped = vi.fn();
  const countActiveGuests = vi.fn();
  const activeGuestEmailExists = vi.fn();
  const createGuestRow = vi.fn();
  const getEventLimits = vi.fn();

  vi.mock("~~/server/repositories/eventRepository", () => ({
      findEventByIdScoped: (...a: unknown[]) => findEventByIdScoped(...a),
  }));
  vi.mock("~~/server/repositories/guestRepository", () => ({
      countActiveGuests: (...a: unknown[]) => countActiveGuests(...a),
      activeGuestEmailExists: (...a: unknown[]) => activeGuestEmailExists(...a),
      createGuestRow: (...a: unknown[]) => createGuestRow(...a),
      createGuestsBulk: vi.fn(), findActiveGuestEmails: vi.fn(), findActiveGuestNames: vi.fn(),
      findActivitiesByGuestScoped: vi.fn(), findGuestByIdScoped: vi.fn(), findGuestsByEventWithResponse: vi.fn(),
      findResponseByGuestScoped: vi.fn(), softDeleteGuestScoped: vi.fn(), updateGuestScoped: vi.fn(),
  }));
  vi.mock("~~/server/services/eventAccess.service", () => ({
      getEventLimits: (...a: unknown[]) => getEventLimits(...a),
  }));
  vi.mock("~~/server/utils/audit", () => ({ logAudit: vi.fn() }));
  vi.mock("~~/server/utils/permissions", () => ({ assertOwnership: (row: unknown) => row }));
  vi.mock("~~/server/utils/guestToken", () => ({ generateGuestToken: () => "tok_test" }));

  const fakeEvent = { context: { organization: { id: "org_test" } } } as never;
  const input = { firstName: "Mario", lastName: "Rossi", email: null } as never;

  function expectStatus(p: Promise<unknown>, code: number) {
      return p.then(() => { throw new Error(`atteso throw ${code}, nessuno`); }, (e: { statusCode?: number }) => expect(e.statusCode).toBe(code));
  }

  describe("createGuest enforcement", () => {
      beforeEach(() => {
          vi.resetModules();
          [findEventByIdScoped, countActiveGuests, activeGuestEmailExists, createGuestRow, getEventLimits].forEach((m) => m.mockReset());
          findEventByIdScoped.mockResolvedValue({ id: "e1", organizationId: "org_test", tier: "free" });
          activeGuestEmailExists.mockResolvedValue(false);
          createGuestRow.mockResolvedValue({ id: "g_new" });
      });

      it("ospite #31 su evento free -> 402", async () => {
          getEventLimits.mockResolvedValue({ tier: "free", maxGuestsPerEvent: 30, maxReminders: 3 });
          countActiveGuests.mockResolvedValue(30);
          const { createGuest } = await import("~~/server/services/guest.service");
          await expectStatus(createGuest(fakeEvent, "e1", input), 402);
          expect(createGuestRow).not.toHaveBeenCalled();
      });

      it("ospite #31 su evento celebration -> ok (250)", async () => {
          getEventLimits.mockResolvedValue({ tier: "celebration", maxGuestsPerEvent: 250, maxReminders: 3 });
          countActiveGuests.mockResolvedValue(30);
          const { createGuest } = await import("~~/server/services/guest.service");
          const res = await createGuest(fakeEvent, "e1", input);
          expect(res.guest.id).toBe("g_new");
      });

      it("org atelier (-1) -> nessun limite ospiti", async () => {
          getEventLimits.mockResolvedValue({ tier: "atelier", maxGuestsPerEvent: -1, maxReminders: -1 });
          countActiveGuests.mockResolvedValue(99999);
          const { createGuest } = await import("~~/server/services/guest.service");
          const res = await createGuest(fakeEvent, "e1", input);
          expect(res.guest.id).toBe("g_new");
      });
  });
  ```
  > Adatta `res.guest.id` alla forma di ritorno reale di `createGuest` (verifica con `grep -n "return" server/services/guest.service.ts`). Se il test richiede ulteriori mock (es. `requireEventScoped`), allinea ai re-export reali del file.

- [ ] **Step 2: esegui e verifica FAIL.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm test server/services/guest.service.test.ts
  ```
  Atteso: "celebration" e "atelier" falliscono — l'impl attuale usa `isOrgFreePlan` + `CEREMLY_FREE_LIMITS.maxGuestsPerEvent` (30 fisso) e lancia 402 a 30.

- [ ] **Step 3: rimpiazza l'enforcement in `createGuest`.** Sostituisci l'import `import { CEREMLY_FREE_LIMITS } from "~~/shared/constants/pricing";` con `import { getEventLimits } from "./eventAccess.service";`. Poi sostituisci il blocco `if (await isOrgFreePlan(...)) { ... CEREMLY_FREE_LIMITS.maxGuestsPerEvent ... }` con:
  ```ts
      const { organizationId, eventRow } = await requireEventScoped(event, eventId);

      // Limite ospiti tier-aware (design §5): -1 = illimitato (atelier).
      // #2 TOCTOU: check-then-insert non atomico (rischio accettato, impatto basso
      // — limit-bypass, no leak; fix atomico non fattibile sul driver Neon HTTP).
      const limits = await getEventLimits(eventRow);
      if (limits.maxGuestsPerEvent !== -1) {
          const current = await countActiveGuests(organizationId, eventId);
          if (current >= limits.maxGuestsPerEvent) {
              throw createError({
                  statusCode: 402,
                  statusMessage: `Questo evento include fino a ${limits.maxGuestsPerEvent} ospiti. Sblocca con Celebrazione per aggiungerne altri.`,
              });
          }
      }
  ```
  (`requireEventScoped` ritorna `{ organizationId, eventRow }` — vedi le sue righe; destruttura `eventRow` che porta `tier`.)

- [ ] **Step 4: esegui e verifica PASS dei 3 test di `createGuest`.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm test server/services/guest.service.test.ts
  ```
  Atteso: i 3 test di `createGuest` passano.

- [ ] **Step 5: aggiungi i test di `importGuests` (capacity tier-aware).** Appendi a `server/services/guest.service.test.ts`:
  ```ts
  describe("importGuests capacity", () => {
      const findActiveGuestNames = vi.fn();
      const findActiveGuestEmails = vi.fn();
      const createGuestsBulk = vi.fn();

      beforeEach(() => {
          vi.resetModules();
          [findEventByIdScoped, countActiveGuests, getEventLimits, findActiveGuestNames, findActiveGuestEmails, createGuestsBulk]
              .forEach((m) => m.mockReset());
          findEventByIdScoped.mockResolvedValue({ id: "e1", organizationId: "org_test", tier: "free" });
          findActiveGuestNames.mockResolvedValue([]);
          findActiveGuestEmails.mockResolvedValue([]);
          createGuestsBulk.mockImplementation((_o, _e, rows: unknown[]) => Promise.resolve(rows));
      });

      it("evento free a 28 ospiti: importa max 2, skippa il resto", async () => {
          vi.doMock("~~/server/repositories/guestRepository", () => ({
              countActiveGuests: () => Promise.resolve(28),
              findActiveGuestNames: () => Promise.resolve([]),
              findActiveGuestEmails: () => Promise.resolve([]),
              createGuestsBulk: (_o: unknown, _e: unknown, rows: unknown[]) => Promise.resolve(rows),
              activeGuestEmailExists: vi.fn(), createGuestRow: vi.fn(), findActivitiesByGuestScoped: vi.fn(),
              findGuestByIdScoped: vi.fn(), findGuestsByEventWithResponse: vi.fn(),
              findResponseByGuestScoped: vi.fn(), softDeleteGuestScoped: vi.fn(), updateGuestScoped: vi.fn(),
          }));
          getEventLimits.mockResolvedValue({ tier: "free", maxGuestsPerEvent: 30, maxReminders: 3 });
          const { importGuests } = await import("~~/server/services/guest.service");
          const rows = Array.from({ length: 5 }, (_, i) => ({ firstName: `N${i}`, lastName: "X", email: null }));
          const res = await importGuests(fakeEvent, "e1", { rows } as never);
          expect(res.imported).toBe(2);
          expect(res.skipped.length).toBe(3);
      });

      it("evento celebration: capacity 250, importa tutte le righe", async () => {
          vi.doMock("~~/server/repositories/guestRepository", () => ({
              countActiveGuests: () => Promise.resolve(0),
              findActiveGuestNames: () => Promise.resolve([]),
              findActiveGuestEmails: () => Promise.resolve([]),
              createGuestsBulk: (_o: unknown, _e: unknown, rows: unknown[]) => Promise.resolve(rows),
              activeGuestEmailExists: vi.fn(), createGuestRow: vi.fn(), findActivitiesByGuestScoped: vi.fn(),
              findGuestByIdScoped: vi.fn(), findGuestsByEventWithResponse: vi.fn(),
              findResponseByGuestScoped: vi.fn(), softDeleteGuestScoped: vi.fn(), updateGuestScoped: vi.fn(),
          }));
          getEventLimits.mockResolvedValue({ tier: "celebration", maxGuestsPerEvent: 250, maxReminders: 3 });
          const { importGuests } = await import("~~/server/services/guest.service");
          const rows = Array.from({ length: 40 }, (_, i) => ({ firstName: `N${i}`, lastName: "X", email: null }));
          const res = await importGuests(fakeEvent, "e1", { rows } as never);
          expect(res.imported).toBe(40);
          expect(res.skipped.length).toBe(0);
      });
  });
  ```
  Esegui e verifica FAIL (il caso celebration fallisce: capacity ancora max 30). Adatta `res.imported`/`res.skipped` alla forma di ritorno reale di `importGuests`.

- [ ] **Step 6: rimpiazza l'enforcement in `importGuests`.** Sostituisci il blocco che usa `isOrgFreePlan` + `CEREMLY_FREE_LIMITS.maxGuestsPerEvent` con:
  ```ts
  const { organizationId, eventRow } = await requireEventScoped(event, eventId);

  const [limits, current, existingNames, existingEmails] = await Promise.all([
      getEventLimits(eventRow),
      countActiveGuests(organizationId, eventId),
      findActiveGuestNames(organizationId, eventId),
      findActiveGuestEmails(organizationId, eventId),
  ]);
  // -1 = illimitato (atelier) -> Infinity. Altrimenti spazio residuo nel limite.
  let capacity = limits.maxGuestsPerEvent === -1
      ? Number.POSITIVE_INFINITY
      : Math.max(0, limits.maxGuestsPerEvent - current);
  ```
  `isOrgFreePlan` non è più usato in `guest.service.ts`: rimuovi l'import `import { isOrgFreePlan } from "./planLimit.service";`.

- [ ] **Step 7: aggiorna il `reason` di skip.** Rinomina `FREE_GUEST_LIMIT_REASON` ("Limite piano Free (30 ospiti) raggiunto") in `GUEST_CAPACITY_REASON = "Limite ospiti dell'evento raggiunto"` e aggiorna l'unico uso.

- [ ] **Step 8: esegui PASS dell'intero file + typecheck + commit.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm test server/services/guest.service.test.ts && pnpm typecheck 2>&1 | grep -E "guest.service" || echo "OK guest.service"
  ```
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && git add server/services/guest.service.ts server/services/guest.service.test.ts && git commit -m "feat(guest): tier-aware guest limit via getEventLimits (-1 = unlimited)"
  ```

---

### Task 2.4 — Enforcement eventi: skip per Atelier, limite Free per-org (`event.service.ts`)

**Files:**
- Modify: `server/services/event.service.ts` (import; `createEvent`)
- Create: `server/services/event.service.test.ts`

**Interfaces:**
- Consumes: `isOrgAtelier` da `./eventAccess.service` (Task 2.1); `countActiveEventsByOrg` (ora filtra `tier='free'`); `CEREMLY_TIER_LIMITS` da `~~/shared/constants/pricing`.
- Produces: `createEvent` salta il limite se `isOrgAtelier(organizationId)`; altrimenti lancia 402 se `countActiveEventsByOrg >= CEREMLY_TIER_LIMITS.free.maxActiveEvents`.

- [ ] **Step 1: scrivi il test che fallisce.** Crea `server/services/event.service.test.ts`:
  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";

  const isOrgAtelier = vi.fn();
  const countActiveEventsByOrg = vi.fn();
  const createEventRow = vi.fn();

  vi.mock("~~/server/services/eventAccess.service", () => ({
      isOrgAtelier: (...a: unknown[]) => isOrgAtelier(...a),
  }));
  vi.mock("~~/server/repositories/eventRepository", () => ({
      countActiveEventsByOrg: (...a: unknown[]) => countActiveEventsByOrg(...a),
      createEventRow: (...a: unknown[]) => createEventRow(...a),
      findEventsByOrgWithCounts: vi.fn(), findEventByIdScoped: vi.fn(),
      updateEventScoped: vi.fn(), deleteEventScoped: vi.fn(),
  }));
  vi.mock("~~/server/utils/audit", () => ({ logAudit: vi.fn() }));

  const fakeEvent = { context: { organization: { id: "org_test" } } } as never;
  // Usa una coppia type/templateKey REALE per superare il 404 a monte (vedi nota sotto).
  const input = { type: "compleanno", templateKey: "compleanno-default", title: "Festa" } as never;

  function expectStatus(p: Promise<unknown>, code: number) {
      return p.then(() => { throw new Error(`atteso throw ${code}`); }, (e: { statusCode?: number }) => expect(e.statusCode).toBe(code));
  }

  describe("createEvent enforcement", () => {
      beforeEach(() => {
          vi.resetModules();
          [isOrgAtelier, countActiveEventsByOrg, createEventRow].forEach((m) => m.mockReset());
          createEventRow.mockResolvedValue({ id: "e_new", tier: "free" });
      });

      it("evento #2 su org free -> 402", async () => {
          isOrgAtelier.mockResolvedValue(false);
          countActiveEventsByOrg.mockResolvedValue(1); // già 1 free attivo -> il 2° supera
          const { createEvent } = await import("~~/server/services/event.service");
          await expectStatus(createEvent(fakeEvent, input), 402);
          expect(createEventRow).not.toHaveBeenCalled();
      });

      it("org atelier -> nessun limite eventi (countActiveEventsByOrg non chiamato)", async () => {
          isOrgAtelier.mockResolvedValue(true);
          countActiveEventsByOrg.mockResolvedValue(99);
          const { createEvent } = await import("~~/server/services/event.service");
          const res = await createEvent(fakeEvent, input);
          expect(res.event.id).toBe("e_new");
          expect(countActiveEventsByOrg).not.toHaveBeenCalled();
      });
  });
  ```
  > **Prima di eseguire**, verifica la coppia `type`/`templateKey` reale e la forma di ritorno: `grep -rn "getTemplate\|templateKey" server/services/event.service.ts shared/ | head` e `grep -n "return" server/services/event.service.ts | head`. Sostituisci `type`/`templateKey`/`res.event.id` con i valori esistenti (così il 404 a monte non scatta).

- [ ] **Step 2: esegui e verifica FAIL** (il caso "atelier" fallisce: l'impl usa `isOrgFreePlan` e chiama comunque `countActiveEventsByOrg`).

- [ ] **Step 3: rimpiazza l'enforcement in `createEvent`.** Aggiungi gli import:
  ```ts
  import { isOrgAtelier } from "./eventAccess.service";
  import { CEREMLY_TIER_LIMITS } from "~~/shared/constants/pricing";
  ```
  e rimuovi gli import non più usati di `CEREMLY_FREE_LIMITS`/`isOrgFreePlan` (verifica con `grep` che non restino altri usi). Sostituisci il blocco `if (await isOrgFreePlan(organizationId)) { ... CEREMLY_FREE_LIMITS.maxActiveEvents ... }` con:
  ```ts
      // Enforcement eventi attivi (design §5). Limite PER-ORG (Free=1, Atelier=∞):
      // - org Atelier -> nessun limite (skip);
      // - altrimenti conta gli eventi free non chiusi (gli sbloccati non consumano
      //   lo slot, già filtrati in countActiveEventsByOrg) vs il limite Free.
      //
      // #2 TOCTOU (rischio accettato): check-then-insert non atomico sul driver
      // Neon HTTP. Impatto BASSO: limit-bypass, nessun leak.
      if (!(await isOrgAtelier(organizationId))) {
          const activeCount = await countActiveEventsByOrg(organizationId);
          if (activeCount >= CEREMLY_TIER_LIMITS.free.maxActiveEvents) {
              throw createError({
                  statusCode: 402,
                  statusMessage: "Il piano Free include 1 evento alla volta (bozze incluse). Concludi l'evento in corso o passa a Celebrazione per crearne altri.",
              });
          }
      }
  ```

- [ ] **Step 4: esegui PASS + typecheck + commit.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm test server/services/event.service.test.ts && pnpm typecheck 2>&1 | grep -E "event.service" || echo "OK event.service"
  ```
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && git add server/services/event.service.ts server/services/event.service.test.ts && git commit -m "feat(event): skip event limit for Atelier; Free per-org limit"
  ```

---

### Task 2.5 — Reminder tier-aware (`reminder.service.ts`)

**Files:**
- Modify: `server/services/reminder.service.ts` (import; `MAX_REMINDERS`; `requireOwnedEvent`; `listReminders`; `saveReminders`)
- Create: `server/services/reminder.service.test.ts`

**Interfaces:**
- Consumes: `getEventLimits` da `./eventAccess.service`; `findEventByIdScoped` (già importato).
- Produces: `saveReminders` calcola il limite via `getEventLimits(eventRow).maxReminders`; `-1` (atelier) = nessun limite; altrimenti 422 se il totale supera il limite.

> **Vincolo schema:** `remindersSchema` accetta max 3 righe in input (design §3). Il limite tier-aware ≥3 non è mai più stringente del 422 esistente per Free/Celebration; per Atelier (-1) rimuove il cap. Il test verifica il branch `-1 = nessun limite` e che Free a 4 reminder lanci 422 (regressione).

- [ ] **Step 1: scrivi il test che fallisce.** Crea `server/services/reminder.service.test.ts`:
  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";

  const findEventByIdScoped = vi.fn();
  const getEventLimits = vi.fn();
  const findRemindersByEvent = vi.fn();
  const bulkUpsertReminders = vi.fn();

  vi.mock("~~/server/repositories/eventRepository", () => ({
      findEventByIdScoped: (...a: unknown[]) => findEventByIdScoped(...a),
  }));
  vi.mock("~~/server/services/eventAccess.service", () => ({
      getEventLimits: (...a: unknown[]) => getEventLimits(...a),
  }));
  vi.mock("~~/server/repositories/reminderRepository", () => ({
      findRemindersByEvent: (...a: unknown[]) => findRemindersByEvent(...a),
      bulkUpsertReminders: (...a: unknown[]) => bulkUpsertReminders(...a),
      findDueReminders: vi.fn(), findPendingGuestsForReminder: vi.fn(), markReminderSent: vi.fn(),
  }));
  vi.mock("~~/server/utils/audit", () => ({ logAudit: vi.fn() }));
  vi.mock("~~/server/utils/permissions", () => ({ assertOwnership: (r: unknown) => r }));
  vi.mock("~~/server/queue", () => ({ dispatch: vi.fn() }));

  const fakeEvent = { context: { organization: { id: "org_test" } } } as never;

  function expectStatus(p: Promise<unknown>, code: number) {
      return p.then(() => { throw new Error(`atteso throw ${code}`); }, (e: { statusCode?: number }) => expect(e.statusCode).toBe(code));
  }

  describe("saveReminders limit tier-aware", () => {
      beforeEach(() => {
          vi.resetModules();
          [findEventByIdScoped, getEventLimits, findRemindersByEvent, bulkUpsertReminders].forEach((m) => m.mockReset());
          findEventByIdScoped.mockResolvedValue({ id: "e1", organizationId: "org_test", tier: "free" });
          findRemindersByEvent.mockResolvedValue([]);
          bulkUpsertReminders.mockResolvedValue({ inserted: 0, updated: 0, deleted: 0 });
      });

      it("free: 4 reminder nuovi (limite 3) -> 422", async () => {
          getEventLimits.mockResolvedValue({ tier: "free", maxGuestsPerEvent: 30, maxReminders: 3 });
          const reminders = Array.from({ length: 4 }, (_, i) => ({ daysBefore: i + 1, enabled: true }));
          const { saveReminders } = await import("~~/server/services/reminder.service");
          await expectStatus(saveReminders(fakeEvent, "e1", { reminders } as never), 422);
      });

      it("atelier (-1): 4 reminder -> nessun limite, ok", async () => {
          getEventLimits.mockResolvedValue({ tier: "atelier", maxGuestsPerEvent: -1, maxReminders: -1 });
          const reminders = Array.from({ length: 4 }, (_, i) => ({ daysBefore: i + 1, enabled: true }));
          const { saveReminders } = await import("~~/server/services/reminder.service");
          const res = await saveReminders(fakeEvent, "e1", { reminders } as never);
          expect(res.reminders).toBeDefined();
      });
  });
  ```
  > Adatta i nomi dei mock (`reminderRepository`/`queue`) e `res.reminders` alle firme reali del file (verifica con `grep -n "import\|return" server/services/reminder.service.ts | head`).

- [ ] **Step 2: esegui e verifica FAIL** (il caso "atelier" fallisce con 422: `MAX_REMINDERS` è fisso a 3).

- [ ] **Step 3: rendi `saveReminders` tier-aware.** Sostituisci l'import `CEREMLY_FREE_LIMITS` con `import { getEventLimits } from "./eventAccess.service";`. Rimuovi la costante `MAX_REMINDERS = CEREMLY_FREE_LIMITS.maxReminders`. Modifica `requireOwnedEvent` per restituire `{ organizationId, eventRow }`:
  ```ts
  async function requireOwnedEvent(
      event: H3Event<EventHandlerRequest>,
      eventId: string,
  ): Promise<{ organizationId: string; eventRow: NonNullable<Awaited<ReturnType<typeof findEventByIdScoped>>> }> {
      const organizationId = getOrgId(event);
      const row = await findEventByIdScoped(organizationId, eventId);
      const eventRow = assertOwnership(row, organizationId);
      return { organizationId, eventRow };
  }
  ```
  Aggiorna `listReminders` (`const { organizationId } = await requireOwnedEvent(...)`). In `saveReminders`:
  ```ts
  const { organizationId, eventRow } = await requireOwnedEvent(event, eventId);
  const { maxReminders } = await getEventLimits(eventRow);
  ```
  e il cap:
  ```ts
  // -1 (atelier) = nessun limite reminder.
  if (maxReminders !== -1 && sentKept + updatedUnsent + inserts > maxReminders) {
      throw createError({
          statusCode: 422,
          statusMessage: `Puoi configurare al massimo ${maxReminders} reminder per evento.`,
      });
  }
  ```

- [ ] **Step 4: esegui PASS + typecheck + commit.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm test server/services/reminder.service.test.ts && pnpm typecheck 2>&1 | grep -E "reminder.service" || echo "OK reminder.service"
  ```
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && git add server/services/reminder.service.ts server/services/reminder.service.test.ts && git commit -m "feat(reminder): tier-aware MAX_REMINDERS via getEventLimits (-1 = unlimited)"
  ```

---

### Task 2.6 — Verifica di fase

**Files:** nessuna modifica (gate).

- [ ] **Step 1: intera suite di test della fase** (`pnpm test` nudo; il test DB-backed usa `.env` via setup).
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm test
  ```
  Atteso: tutti i file passano (`creem.getPlanFromProductId` 2, `eventAccess.service` 7, `guest.service` 5, `eventRepository.count` 1, `event.service` 2, `reminder.service` 2).

- [ ] **Step 2: typecheck + lint** (eventuali `unused import` di `CEREMLY_FREE_LIMITS`/`isOrgFreePlan` emergono qui — rimuovili).
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm typecheck && pnpm lint
  ```

- [ ] **Step 3: nessun residuo starter/premium/agency nei file della fase.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && grep -rn "starter\|premium\|agency" server/services/eventAccess.service.ts server/services/guest.service.ts server/services/event.service.ts server/services/reminder.service.ts || echo "NESSUN_RESIDUO"
  ```
  Atteso: `NESSUN_RESIDUO`.

- [ ] **Step 4: commit finale solo se restano fix non committati.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && git add -A && git commit -m "chore(phase2): clean lint/typecheck after tier enforcement" || echo "Niente da committare"
  ```

---

## Fase 3 — Checkout Celebrazione & webhook sblocco/refund

Obiettivo: costruire il pezzo BE nuovo che trasforma un evento Free in `celebration` via pagamento one-time Creem — repository idempotenti di sblocco/re-lock, service checkout server-side, route thin `unlock`, e i callback webhook (unica eccezione consapevole alla regola "i callback non mutano stato") — coperto da test Vitest contro il branch Neon dev. Usa l'infra di Fase 0 (`pnpm test` nudo). **NIENTE setup vitest qui** (è in Fase 0).

> **Precondizioni (verificare, non ricreare):** Fase 0 (vitest) + Fase 1 (4 colonne `events` migrate; `runtimeConfig.creemProductIdCelebration` private; `public.baseURL`) + Fase 2 (`isOrgAtelier` in `eventAccess.service`). Guard: `pnpm typecheck >/dev/null 2>&1 && grep -q "isOrgAtelier" server/services/eventAccess.service.ts && echo OK`. Le query "verifica PASS" falliscono con `column ... does not exist` se la migration non è applicata.

> **Tipi Creem verificati (riusati dal draft, NON reinventare):** `createCheckout` server-side da `@creem_io/better-auth/server` con firma `createCheckout(config: { apiKey; testMode? }, input: { productId; customer; metadata?; successUrl? }): Promise<{ url; redirect }>`; `FlatCheckoutCompleted` espone `order?: OrderEntity` (`order.id`, `order.type: 'recurring'|'onetime'`) e `metadata?: Record<string, string|number|null>`; `FlatRefundCreated`/`FlatDisputeCreated` espongono `order?: OrderEntity|string` e `checkout?: CheckoutEntity|string` (con `checkout.order?.id`).

---

### Task 3.1 — `eventRepository.unlockEvent` idempotente (TDD)

**Files:**
- Modify: `server/repositories/eventRepository.ts` (append in coda)
- Create: `server/repositories/eventRepository.unlock.test.ts`

**Interfaces:**
- Consumes: `getDB()`; `schema.events` (`tier`/`unlockedAt`/`creemOrderId` migrate); `and`/`eq` da `drizzle-orm`.
- Produces: `export async function unlockEvent(eventId: string, organizationId: string, creemOrderId: string): Promise<void>` — `SET tier='celebration', unlocked_at=now(), creem_order_id=:orderId WHERE id=:eventId AND organization_id=:orgId AND tier='free'` (idempotente via `tier='free'`).

- [ ] **Step 1: scrivi il test che fallisce.** Crea `server/repositories/eventRepository.unlock.test.ts` con `beforeAll(seedFreeEvent)`/`afterAll(cleanup)` su org+evento sintetici (`test-org-unlock-3-1`/`test-evt-unlock-3-1`), e 3 casi: (a) unlock di un evento free → `tier='celebration'`, `unlockedAt` instanceof Date, `creemOrderId='order_A'`; (b) idempotenza: secondo unlock con altro order NON sovrascrive (guard `tier='free'`); (c) scope org: unlock con org diversa NON sblocca.

- [ ] **Step 2: esegui e verifica FAIL.**
  ```bash
  pnpm test server/repositories/eventRepository.unlock.test.ts
  ```
  Atteso: FAIL — `does not provide an export named 'unlockEvent'`.

- [ ] **Step 3: implementazione minima.** Aggiungi in coda a `eventRepository.ts` (dopo l'ultima funzione), nel blocco `// Sblocco / re-lock one-time (Celebrazione) — SPEC §6.3/§6.4`:
  ```ts
  /**
   * Sblocca un evento Free → 'celebration' (pagamento one-time Creem completato).
   * Idempotente by-construction: il predicato `tier='free'` evita doppie scritture.
   * Org-scoped: l'org dev'essere quella dell'evento (dal metadata del checkout).
   */
  export async function unlockEvent(
      eventId: string,
      organizationId: string,
      creemOrderId: string,
  ): Promise<void> {
      const db = getDB();
      await db
          .update(schema.events)
          .set({ tier: "celebration", unlockedAt: new Date(), creemOrderId })
          .where(
              and(
                  eq(schema.events.id, eventId),
                  eq(schema.events.organizationId, organizationId),
                  eq(schema.events.tier, "free"),
              ),
          );
  }
  ```

- [ ] **Step 4: esegui PASS + typecheck.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm test server/repositories/eventRepository.unlock.test.ts && pnpm typecheck 2>&1 | grep -i "eventRepository" || echo "OK"
  ```
  Atteso: `3 passed`.

- [ ] **Step 5: commit.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && git add server/repositories/eventRepository.ts server/repositories/eventRepository.unlock.test.ts && git commit -m "feat(events): unlockEvent idempotente (Free->celebration, org-scoped)"
  ```

---

### Task 3.2 — `eventRepository.relockEventByOrder` (TDD)

**Files:**
- Modify: `server/repositories/eventRepository.ts` (subito dopo `unlockEvent`)
- Create: `server/repositories/eventRepository.relock.test.ts`

**Interfaces:**
- Consumes: `getDB()`; `schema.events`; `eq` da `drizzle-orm`.
- Produces: `export async function relockEventByOrder(creemOrderId: string): Promise<void>` — `SET tier='free', unlocked_at=NULL, creem_order_id=NULL WHERE creem_order_id=:orderId` (NON org-scoped: l'orderId è univoco e arriva dal webhook firmato Creem).

- [ ] **Step 1: scrivi il test che fallisce.** Crea `server/repositories/eventRepository.relock.test.ts` con seed di un evento già `celebration` legato a `ORDER_ID`, 2 casi: (a) relock → `tier='free'`, `unlockedAt=null`, `creemOrderId=null`; (b) no-op silenzioso per orderId sconosciuto.

- [ ] **Step 2: esegui e verifica FAIL** (`does not provide an export named 'relockEventByOrder'`).

- [ ] **Step 3: implementazione minima.** Aggiungi dopo `unlockEvent`:
  ```ts
  /**
   * Re-locka l'evento collegato a un order Creem rimborsato/contestato → 'free'.
   * Match per `creem_order_id` (univoco lato Creem). Senza, un evento rimborsato
   * resterebbe sbloccato gratis (SPEC §6.4). No-op se nessun match.
   */
  export async function relockEventByOrder(creemOrderId: string): Promise<void> {
      const db = getDB();
      await db
          .update(schema.events)
          .set({ tier: "free", unlockedAt: null, creemOrderId: null })
          .where(eq(schema.events.creemOrderId, creemOrderId));
  }
  ```

- [ ] **Step 4: esegui PASS + commit.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm test server/repositories/eventRepository.relock.test.ts
  ```
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && git add server/repositories/eventRepository.ts server/repositories/eventRepository.relock.test.ts && git commit -m "feat(events): relockEventByOrder (re-lock su refund/dispute Creem)"
  ```

---

### Task 3.3 — AUDIT_ACTIONS `event.unlocked` / `event.relocked`

**Files:**
- Modify: `server/utils/audit/types.ts` (blocco `AUDIT_ACTIONS`, sezione `// Event (Ceremly …)`)

**Interfaces:**
- Produces: `'event.unlocked'` e `'event.relocked'` come membri di `AUDIT_ACTIONS` → `AuditAction` (categoria derivata dal prefisso `event.`).

- [ ] **Step 1: aggiungi le due azioni** dopo `'event.deleted': 'event.deleted',`:
  ```ts
    'event.unlocked': 'event.unlocked',
    'event.relocked': 'event.relocked',
  ```

- [ ] **Step 2: typecheck + commit.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm typecheck && git add server/utils/audit/types.ts && git commit -m "feat(audit): aggiungi event.unlocked / event.relocked"
  ```

---

### Task 3.4 — Service `createCelebrationCheckout` (server-side)

**Files:**
- Create: `server/services/checkout.service.ts`

**Interfaces:**
- Consumes: `createCheckout` da `@creem_io/better-auth/server`; `runtimeConfig` (`creemApiKey`, `creemProductIdCelebration`, `public.appEnv`, `public.baseURL`); `findEventByIdScoped`; `assertOwnership`; `isOrgAtelier` da `./eventAccess.service`; `H3Event` da `~~/server/types/h3`.
- Produces: `export async function createCelebrationCheckout(event: H3Event<EventHandlerRequest>, eventId: string): Promise<{ url: string }>`. 409 se evento già `celebration` o org Atelier; 401 se org non risolta; 404/403 via `assertOwnership`.

- [ ] **Step 1: crea il service.** Contenuto completo (verifica la firma esatta di `createCheckout` server-side col typecheck dello Step 2):
  ```ts
  /**
   * Checkout Celebrazione (one-time per-evento) — SPEC §6.2.
   * Creato SERVER-SIDE così eventId/organizationId sono legati nel metadata e
   * l'ownership è verificata PRIMA di emettere il checkout. Lo sblocco avviene nel
   * webhook checkout.completed (server/utils/creem.ts), non qui.
   */
  import { createCheckout } from "@creem_io/better-auth/server";
  import type { H3Event, EventHandlerRequest } from "~~/server/types/h3";
  import { runtimeConfig } from "../utils/runtimeConfig";
  import { findEventByIdScoped } from "../repositories/eventRepository";
  import { assertOwnership } from "../utils/permissions";
  import { isOrgAtelier } from "./eventAccess.service";

  function getOrgId(event: H3Event<EventHandlerRequest>): string {
      const orgId = event.context.organization?.id;
      if (!orgId) {
          throw createError({ statusCode: 401, statusMessage: "Organizzazione attiva non risolta" });
      }
      return orgId;
  }

  export async function createCelebrationCheckout(
      event: H3Event<EventHandlerRequest>,
      eventId: string,
  ): Promise<{ url: string }> {
      const organizationId = getOrgId(event);

      const row = await findEventByIdScoped(organizationId, eventId);
      assertOwnership(row, organizationId);

      if (await isOrgAtelier(organizationId)) {
          throw createError({ statusCode: 409, statusMessage: "L'organizzazione Atelier ha già eventi illimitati" });
      }
      if (row.tier === "celebration") {
          throw createError({ statusCode: 409, statusMessage: "Evento già sbloccato" });
      }

      const productId = runtimeConfig.creemProductIdCelebration;
      if (!productId) {
          throw createError({ statusCode: 500, statusMessage: "Prodotto Celebrazione non configurato" });
      }

      const baseUrl = runtimeConfig.public.baseURL;
      const { url } = await createCheckout(
          { apiKey: runtimeConfig.creemApiKey!, testMode: runtimeConfig.public.appEnv !== "production" },
          {
              productId,
              customer: { email: event.context.user?.email },
              metadata: { eventId, organizationId },
              successUrl: `${baseUrl}/dashboard/events/${eventId}?unlocked=true`,
          },
      );
      return { url };
  }
  ```

- [ ] **Step 2: typecheck + lint + commit.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm typecheck && pnpm lint 2>&1 | grep -i "checkout.service" || echo "OK"
  ```
  > Se il typecheck segnala `customer` mancante o la firma di `createCheckout` diversa, leggi `node_modules/@creem_io/better-auth/dist/cjs/server*.d.ts` e adatta `customer`/`config` alla firma reale. Se segnala `creemProductIdCelebration` inesistente, la Fase 1 non è completa: fermati.
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && git add server/services/checkout.service.ts && git commit -m "feat(checkout): createCelebrationCheckout server-side (one-time per-evento)"
  ```

---

### Task 3.5 — Webhook: `handleCheckoutCompleted` (sblocco) + `handleRefundCreated` (re-lock) (TDD)

**Files:**
- Modify: `server/utils/creem.ts` (import + handler estratti + `setupCreem`)
- Create: `server/utils/creem.test.ts` (UNICO Create — test webhook DB-backed; il test di `getPlanFromProductId` è in Fase 1)

**Interfaces:**
- Consumes: `FlatCheckoutCompleted`/`FlatRefundCreated`/`FlatDisputeCreated` da `@creem_io/better-auth`; `unlockEvent`/`relockEventByOrder` (Task 3.1/3.2); `logAudit`; azioni `event.unlocked`/`event.relocked` (Task 3.3).
- Produces:
  - `export async function handleCheckoutCompleted(data: FlatCheckoutCompleted): Promise<void>` — mantiene l'audit `checkout.completed`; in più, se `data.order?.type === 'onetime'` E `data.metadata?.eventId`, chiama `unlockEvent(eventId, organizationId, order.id)` + audit `event.unlocked`.
  - `export async function handleRefundCreated(data: FlatRefundCreated | FlatDisputeCreated): Promise<void>` — estrae `creemOrderId` (oggetto-o-stringa), chiama `relockEventByOrder` + audit `event.relocked`. Riusato per `onDisputeCreated`.
  - Helper privato `extractCreemOrderId(data)`.
  - `setupCreem()`: `onCheckoutCompleted: handleCheckoutCompleted`, `onRefundCreated: handleRefundCreated`, `onDisputeCreated: handleRefundCreated`.

- [ ] **Step 1: scrivi il test che fallisce.** Crea `server/utils/creem.test.ts` (DB-backed, `beforeEach(seedFreeEvent)`/`afterAll(cleanup)` su `test-org-webhook-3-5`/`test-evt-webhook-3-5`). Casi `handleCheckoutCompleted`: (a) one-time + metadata.eventId → `tier='celebration'`, `creemOrderId=ORDER_ID`; (b) recurring → nessuna mutazione; (c) manca metadata.eventId → nessuna mutazione. Casi `handleRefundCreated` (seed evento celebration legato a ORDER_ID): (d) order come oggetto → relock; (e) order come stringa → relock. Payload Flat* via `as unknown as Flat...`.

- [ ] **Step 2: esegui e verifica FAIL** (`does not provide an export named 'handleCheckoutCompleted'`).

- [ ] **Step 3: implementazione.** Aggiorna gli import in cima a `creem.ts` (mantieni `import type { CeremlyTier }` di Fase 1 — è incluso qui sotto perché serve a `getPlanFromProductId`):
  ```ts
  import { creem } from "@creem_io/better-auth";
  import type {
      FlatCheckoutCompleted,
      FlatRefundCreated,
      FlatDisputeCreated,
  } from "@creem_io/better-auth";
  import type { CeremlyTier } from "~~/shared/constants/pricing";
  import { logAudit } from "./audit";
  import { runtimeConfig } from "./runtimeConfig";
  import { unlockEvent, relockEventByOrder } from "../repositories/eventRepository";
  ```
  Prima di `export const setupCreem`, aggiungi:
  ```ts
  /**
   * Webhook checkout.completed — sblocco one-time (SPEC §6.3).
   * PATTERN-DEPARTURE: i callback Creem sono SOLO-audit (persistSubscriptions fa il
   * resto). Per i one-time non c'è macchina del plugin che persista lo stato, quindi
   * lo sblocco DEVE avvenire qui. Idempotente via predicato tier='free' in unlockEvent.
   */
  export async function handleCheckoutCompleted(data: FlatCheckoutCompleted): Promise<void> {
      await logAudit(null, "checkout.completed", {
          targetType: "creemCustomerId",
          targetId: data?.customer?.id,
          details: { provider: "creem", productId: data?.product?.id, productName: data?.product?.name },
      });

      const eventId = data.metadata?.eventId;
      const organizationId = data.metadata?.organizationId;
      if (
          data.order?.type === "onetime"
          && typeof eventId === "string"
          && typeof organizationId === "string"
          && data.order.id
      ) {
          await unlockEvent(eventId, organizationId, data.order.id);
          await logAudit(null, "event.unlocked", {
              organizationId,
              targetType: "event",
              targetId: eventId,
              details: { provider: "creem", creemOrderId: data.order.id },
          });
      }
  }

  /** Estrae il creemOrderId da refund/dispute (order/checkout come oggetto o stringa). */
  function extractCreemOrderId(data: FlatRefundCreated | FlatDisputeCreated): string | undefined {
      if (typeof data.order === "string") return data.order;
      if (data.order?.id) return data.order.id;
      if (data.checkout && typeof data.checkout !== "string") return data.checkout.order?.id;
      return undefined;
  }

  /**
   * Webhook refund.created / dispute.created — re-lock (SPEC §6.4).
   * Senza questo un evento rimborsato resterebbe sbloccato gratis.
   */
  export async function handleRefundCreated(data: FlatRefundCreated | FlatDisputeCreated): Promise<void> {
      const creemOrderId = extractCreemOrderId(data);
      if (!creemOrderId) return;
      await relockEventByOrder(creemOrderId);
      await logAudit(null, "event.relocked", {
          targetType: "event",
          targetId: creemOrderId,
          details: { provider: "creem", event: data.webhookEventType, creemOrderId },
      });
  }
  ```
  Nel blocco `creem({ ... })` dentro `setupCreem`, sostituisci l'arrow inline `onCheckoutCompleted` con i riferimenti agli handler e aggiungi i due nuovi:
  ```ts
          onCheckoutCompleted: handleCheckoutCompleted,
          onRefundCreated: handleRefundCreated,
          onDisputeCreated: handleRefundCreated,
  ```

- [ ] **Step 4: esegui PASS + typecheck + lint.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm test server/utils/creem.test.ts && pnpm typecheck && pnpm lint 2>&1 | grep -i "creem.ts" || echo "OK"
  ```
  Atteso: `5 passed`. Se `metadata?.eventId` dà errore di tipo (`Record<string,string|number|null>`), il narrowing `typeof eventId === "string"` lo risolve (già presente).

- [ ] **Step 5: commit.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && git add server/utils/creem.ts server/utils/creem.test.ts && git commit -m "feat(creem): sblocco one-time su checkout.completed + re-lock su refund/dispute"
  ```

---

### Task 3.6 — Route thin `POST /api/events/[id]/unlock`

**Files:**
- Create: `server/api/events/[id]/unlock.post.ts`

**Interfaces:**
- Consumes: `requireAuth`/`requireWrite` (`~~/server/utils/permissions`); `createCelebrationCheckout` (Task 3.4); `getRouterParam`/`createError` (auto-import).
- Produces: `POST` → `{ url: string }`. Delega ogni guard al service; nessun body (id dal path).

- [ ] **Step 1: crea la route thin.**
  ```ts
  /**
   * POST /api/events/:id/unlock
   * Emette un checkout Creem one-time (Celebrazione) per sbloccare l'evento.
   * Route thin: auth + RBAC write, poi delega al service. Ritorna { url } per il
   * redirect client. Nessun body (id dal path).
   */
  import { requireWrite } from "~~/server/utils/permissions";
  import { createCelebrationCheckout } from "~~/server/services/checkout.service";

  export default defineEventHandler(async (event) => {
      await requireAuth(event);
      await requireWrite(event);
      const id = getRouterParam(event, "id");
      if (!id) {
          throw createError({ statusCode: 400, statusMessage: "Missing event id" });
      }
      try {
          return await createCelebrationCheckout(event, id);
      } catch (e) {
          const err = e as { statusCode?: number };
          if (err.statusCode) throw e;
          console.error("[events.[id].unlock.post] error:", e);
          throw createError({ statusCode: 500, statusMessage: "Failed to create checkout" });
      }
  });
  ```

- [ ] **Step 2: typecheck + lint + commit.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm typecheck && pnpm lint 2>&1 | grep -i "unlock.post" || echo "OK"
  ```
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && git add "server/api/events/[id]/unlock.post.ts" && git commit -m "feat(api): POST /api/events/[id]/unlock (checkout Celebrazione thin)"
  ```

---

### Task 3.7 — Verifica di fase

- [ ] **Step 1: intera suite + typecheck + lint.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm test && pnpm typecheck && pnpm lint
  ```
  Atteso: tutti i file passano (incluso `eventRepository.unlock` 3, `eventRepository.relock` 2, `creem.test` 5); nessun residuo-fixture (`afterAll` ripuliscono `test-org-*`/`test-evt-*`).

- [ ] **Step 2: nessun residuo starter/premium/agency introdotto.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && grep -rn "starter\|premium\|agency" server/services/checkout.service.ts "server/api/events/[id]/unlock.post.ts" 2>/dev/null && echo "RESIDUO" || echo "OK"
  ```
  Atteso: `OK`.

- [ ] **Step 3: working tree clean** (`git status --porcelain`); se restano modifiche, committa `chore(checkout): rifiniture Fase 3`.

---

## Fase 4 — Cron cleanup eventi conclusi+inattivi

Obiettivo: implementare il cron giornaliero `/api/cron/cleanup-stale-events` con predicato "concluso AND inattivo" (mai eventi futuri/attivi/Atelier), che avvisa via email gli eventi prossimi alla soglia (`cleanupWarnedAt`) e poi elimina quelli warned da ≥7gg, con cascade FK e audit. Usa l'infra di Fase 0. **NIENTE setup vitest qui.**

> **Precondizioni (verificare, non ricreare):** Fase 0 (vitest) + Fase 1 (4 colonne `events` migrate) + Fase 2 (`isOrgAtelier`). Guard: `grep -q "cleanupWarnedAt" server/database/schema/events.ts && grep -q "isOrgAtelier" server/services/eventAccess.service.ts && echo OK`.

---

### Task 4.1 — Audit action `event.cleanup_warned` (TDD)

**Files:**
- Modify: `server/utils/audit/types.ts` (sezione `// Event (Ceremly …)`, accanto a `event.unlocked`/`event.relocked` della Fase 3)
- Create: `server/utils/audit/types.test.ts`

**Interfaces:**
- Produces: `'event.cleanup_warned': 'event.cleanup_warned'` in `AUDIT_ACTIONS` → `AuditAction` (categoria `event`). La delete riusa `event.deleted` esistente.

- [ ] **Step 1: scrivi il test che fallisce.** Crea `server/utils/audit/types.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { AUDIT_ACTIONS, getCategoryFromAction } from "./types";

  describe("audit actions — cleanup", () => {
      it("espone event.cleanup_warned mappato alla categoria event", () => {
          expect(AUDIT_ACTIONS["event.cleanup_warned"]).toBe("event.cleanup_warned");
          expect(getCategoryFromAction("event.cleanup_warned")).toBe("event");
      });
      it("mantiene event.deleted disponibile per la delete del cleanup", () => {
          expect(AUDIT_ACTIONS["event.deleted"]).toBe("event.deleted");
      });
  });
  ```

- [ ] **Step 2: esegui e verifica FAIL** (`AUDIT_ACTIONS["event.cleanup_warned"]` undefined).

- [ ] **Step 3: implementazione minima.** Sotto `'event.relocked': 'event.relocked',` aggiungi:
  ```ts
    'event.cleanup_warned': 'event.cleanup_warned',
  ```

- [ ] **Step 4: esegui PASS + commit.**
  ```bash
  pnpm test server/utils/audit/types.test.ts
  ```
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && git add server/utils/audit/types.ts server/utils/audit/types.test.ts && git commit -m "feat(audit): add event.cleanup_warned action"
  ```

---

### Task 4.2 — Repository: `findStaleEventsToWarn` / `findStaleEventsToDelete`

**Files:**
- Modify: `server/repositories/eventRepository.ts` (import `or`, `isNotNull` da `drizzle-orm`; predicato + 2 query in coda)

**Interfaces:**
- Consumes: `schema.events` (`tier`/`updatedAt`/`cleanupWarnedAt`/`eventDate`/`rsvpDeadline`/`status`); `schema.guestActivities` (`eventId`/`createdAt`).
- Produces: `export async function findStaleEventsToWarn(now: Date): Promise<Array<{ id: string; organizationId: string }>>`; `export async function findStaleEventsToDelete(now: Date): Promise<Array<{ id: string; organizationId: string }>>`.

Predicato (spec §9.1):
- **Concluso** = `status='closed'` OR `eventDate<ref` OR (`rsvpDeadline IS NOT NULL AND rsvpDeadline<ref`).
- **Inattivo** = `updatedAt < (ref - Ngg)` AND nessuna `guest_activity` con `created_at >= (ref - Ngg)`.
- **Soglia N**: free=30gg; celebration=90gg dopo `eventDate`; tier ignoto → free (30).
- **Edge `eventDate IS NULL`**: eliminabile/avvisabile SOLO se `status='closed'` e inattivo 30gg.
- **Esclusione Atelier**: NON nel SQL (nel service via `isOrgAtelier`).
- `findStaleEventsToWarn`: predicato a `ref = now+7gg` AND `cleanupWarnedAt IS NULL`.
- `findStaleEventsToDelete`: predicato a `ref = now` AND `cleanupWarnedAt IS NOT NULL AND cleanupWarnedAt < (now-7gg)`.

- [ ] **Step 1: aggiorna gli import del repository.** Riga import `drizzle-orm`: aggiungi `isNotNull` e `or` (mantieni gli esistenti `and, desc, eq, isNull, lt, ne, sql`).

- [ ] **Step 2: implementa il predicato + le 2 query.** Aggiungi in coda a `eventRepository.ts` (blocco `// Cleanup eventi conclusi+inattivi (SPEC §9)`):
  ```ts
  const STALE_DAYS_FREE = 30;
  const STALE_DAYS_CELEBRATION = 90;

  /**
   * Predicato "concluso AND inattivo" valutato a `ref` (warn: now+7gg, delete: now).
   * Tier-aware sulle soglie; edge eventDate NULL → solo status='closed' + 30gg.
   * Esclusione Atelier NON qui (il service la applica via isOrgAtelier).
   */
  function stalePredicate(ref: Date) {
      const refMs = ref.getTime();
      const freeCutoff = new Date(refMs - STALE_DAYS_FREE * 24 * 60 * 60 * 1000);
      const celebrationCutoff = new Date(refMs - STALE_DAYS_CELEBRATION * 24 * 60 * 60 * 1000);

      const concluded = or(
          eq(schema.events.status, "closed"),
          lt(schema.events.eventDate, ref),
          and(isNotNull(schema.events.rsvpDeadline), lt(schema.events.rsvpDeadline, ref)),
      );

      const noRecentActivity = sql`not exists (
          select 1 from ${schema.guestActivities}
          where ${schema.guestActivities.eventId} = ${schema.events.id}
            and ${schema.guestActivities.createdAt} >= ${freeCutoff}
      )`;

      const celebrationStale = and(
          eq(schema.events.tier, "celebration"),
          isNotNull(schema.events.eventDate),
          lt(schema.events.eventDate, celebrationCutoff),
          lt(schema.events.updatedAt, freeCutoff),
          noRecentActivity,
      );

      const nullDateStale = and(
          isNull(schema.events.eventDate),
          eq(schema.events.status, "closed"),
          lt(schema.events.updatedAt, freeCutoff),
          noRecentActivity,
      );

      const freeStale = and(
          ne(schema.events.tier, "celebration"),
          isNotNull(schema.events.eventDate),
          lt(schema.events.updatedAt, freeCutoff),
          noRecentActivity,
      );

      return and(concluded, or(celebrationStale, nullDateStale, freeStale));
  }

  export async function findStaleEventsToWarn(
      now: Date,
  ): Promise<Array<{ id: string; organizationId: string }>> {
      const db = getDB();
      const ref = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      return db
          .select({ id: schema.events.id, organizationId: schema.events.organizationId })
          .from(schema.events)
          .where(and(stalePredicate(ref), isNull(schema.events.cleanupWarnedAt)));
  }

  export async function findStaleEventsToDelete(
      now: Date,
  ): Promise<Array<{ id: string; organizationId: string }>> {
      const db = getDB();
      const warnedBefore = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return db
          .select({ id: schema.events.id, organizationId: schema.events.organizationId })
          .from(schema.events)
          .where(
              and(
                  stalePredicate(now),
                  isNotNull(schema.events.cleanupWarnedAt),
                  lt(schema.events.cleanupWarnedAt, warnedBefore),
              ),
          );
  }
  ```

- [ ] **Step 3: typecheck** (il test deterministico è il Task 4.7).
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm typecheck 2>&1 | grep -i "eventRepository" || echo "OK"
  ```

- [ ] **Step 4: commit.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && git add server/repositories/eventRepository.ts && git commit -m "feat(events): stale-event cleanup predicate queries (warn/delete)"
  ```

---

### Task 4.3 — Helper repository: `markEventCleanupWarned` + `findEventWarnTargetInfo`

**Files:**
- Modify: `server/repositories/eventRepository.ts` (in coda al blocco cleanup)

**Interfaces:**
- Produces:
  - `export async function markEventCleanupWarned(organizationId: string, eventId: string, now: Date): Promise<void>` — org-scoped, setta `cleanupWarnedAt=now`.
  - `export async function findEventWarnTargetInfo(organizationId: string, eventId: string, ownerUserId: string): Promise<{ title: string; email: string; locale: string } | undefined>` — join `events`×`user` (owner) per titolo + email/locale.

- [ ] **Step 1: aggiungi gli helper** (coperti dai test del service, Task 4.5):
  ```ts
  /** Marca un evento come avvisato (cleanupWarnedAt=now) — org-scoped. */
  export async function markEventCleanupWarned(
      organizationId: string,
      eventId: string,
      now: Date,
  ): Promise<void> {
      const db = getDB();
      await db
          .update(schema.events)
          .set({ cleanupWarnedAt: now })
          .where(and(eq(schema.events.id, eventId), eq(schema.events.organizationId, organizationId)));
  }

  /** Titolo evento + email/locale dell'owner dell'org (per l'avviso cleanup). */
  export async function findEventWarnTargetInfo(
      organizationId: string,
      eventId: string,
      ownerUserId: string,
  ): Promise<{ title: string; email: string; locale: string } | undefined> {
      const db = getDB();
      const rows = await db
          .select({ title: schema.events.title, email: schema.user.email, locale: schema.user.locale })
          .from(schema.events)
          .innerJoin(schema.user, eq(schema.user.id, ownerUserId))
          .where(and(eq(schema.events.id, eventId), eq(schema.events.organizationId, organizationId)))
          .limit(1);
      const row = rows[0];
      if (!row) return undefined;
      return { title: row.title, email: row.email, locale: row.locale ?? "it" };
  }
  ```

- [ ] **Step 2: typecheck + commit.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm typecheck 2>&1 | grep -i "eventRepository" || echo "OK"
  ```
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && git add server/repositories/eventRepository.ts && git commit -m "feat(events): markEventCleanupWarned + findEventWarnTargetInfo"
  ```

---

### Task 4.4 — Email template `EventCleanupWarning` (TDD)

**Files:**
- Create: `server/emailTemplates/EventCleanupWarning.ts`
- Modify: `server/emailTemplates/index.ts` (import + re-export + `renderEventCleanupWarningEmail` + `emailSubjects.eventCleanupWarning`)
- Create: `server/emailTemplates/EventCleanupWarning.test.ts`

**Interfaces:**
- Consumes: `colors`/`fonts` da `./_softMeadow`; `appName()`/`appHost()` da `index.ts`.
- Produces: `EventCleanupWarning(props)`; `renderEventCleanupWarningEmail({ language?, eventTitle, dashboardUrl, daysLeft }): Promise<RenderedEmail>`; `emailSubjects.eventCleanupWarning(eventTitle): { it; en }`.

- [ ] **Step 1: scrivi il test che fallisce.** Crea `server/emailTemplates/EventCleanupWarning.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { renderEventCleanupWarningEmail, emailSubjects } from "./index";

  describe("EventCleanupWarning email", () => {
      it("renderizza HTML + text con titolo evento e link dashboard (it)", async () => {
          const { html, text } = await renderEventCleanupWarningEmail({
              language: "it",
              eventTitle: "Matrimonio Anna & Luca",
              dashboardUrl: "https://app.test/dashboard/events/evt_1",
              daysLeft: 7,
          });
          expect(html).toContain("Matrimonio Anna &amp; Luca");
          expect(html).toContain("https://app.test/dashboard/events/evt_1");
          expect(text).toContain("Matrimonio Anna & Luca");
      });
      it("renderizza copy inglese con language=en", async () => {
          const { html } = await renderEventCleanupWarningEmail({
              language: "en", eventTitle: "Party", dashboardUrl: "https://app.test/x", daysLeft: 5,
          });
          expect(html).toContain("Party");
      });
      it("espone un subject localizzato", () => {
          const s = emailSubjects.eventCleanupWarning("Festa");
          expect(s.it).toContain("Festa");
          expect(s.en).toContain("Festa");
      });
  });
  ```

- [ ] **Step 2: esegui e verifica FAIL** (`renderEventCleanupWarningEmail is not a function`).

- [ ] **Step 3: crea il componente.** Scrivi `server/emailTemplates/EventCleanupWarning.ts` (design "Soft Meadow", `React.createElement` — no JSX, i18n IT/EN, NESSUN `@` nei testi):
  ```ts
  // React Email — avviso cleanup evento concluso+inattivo (SPEC §9.2).
  // Inviato all'organizzatore ~7gg prima dell'eliminazione automatica.
  import * as React from 'react';
  import {
      Html, Head, Preview, Body, Container, Section, Text, Button,
  } from '@react-email/components';
  import { colors, fonts } from './_softMeadow';

  export interface EventCleanupWarningProps {
      language: 'it' | 'en';
      eventTitle: string;
      /** Link alla pagina evento in dashboard `{baseURL}/dashboard/events/{id}`. */
      dashboardUrl: string;
      /** Giorni rimanenti prima dell'eliminazione (di norma 7). */
      daysLeft: number;
      appName: string;
      appHost: string;
  }

  const copy = {
      it: {
          eyebrow: 'Avviso archiviazione',
          body: (days: number) =>
              `Questo evento è concluso e inattivo da tempo. Verrà eliminato automaticamente tra ${days} giorni, insieme a ospiti e risposte. Se vuoi conservarlo, aprilo dalla tua dashboard: basta una modifica per mantenerlo attivo.`,
          cta: 'Apri evento',
          note: 'Se non fai nulla, l’evento e i suoi dati saranno rimossi.',
      },
      en: {
          eyebrow: 'Archival notice',
          body: (days: number) =>
              `This event is closed and has been inactive for a while. It will be deleted automatically in ${days} days, along with its guests and responses. To keep it, just open it from your dashboard — any change keeps it active.`,
          cta: 'Open event',
          note: 'If you do nothing, the event and its data will be removed.',
      },
  };

  const styles = {
      body: { margin: 0, padding: 0, backgroundColor: colors.bone, fontFamily: fonts.sans },
      container: { maxWidth: '560px', margin: '0 auto', padding: '32px 16px' },
      card: { backgroundColor: colors.card, border: `1px solid ${colors.border}`, borderRadius: '18px', padding: '40px 36px' },
      eyebrow: { fontFamily: fonts.mono, fontSize: '11px', letterSpacing: '0.3em', textTransform: 'uppercase' as const, color: colors.accent, margin: '0 0 14px 0' },
      title: { fontFamily: fonts.serif, fontSize: '32px', lineHeight: '1.2', color: colors.wineDeep, fontWeight: 600, margin: '0 0 24px 0' },
      message: { fontSize: '15px', lineHeight: '1.7', color: colors.ink, margin: '0 0 28px 0' },
      ctaSection: { textAlign: 'center' as const, margin: '0 0 12px 0' },
      ctaButton: { display: 'inline-block', backgroundColor: colors.accent, color: '#3F3622', fontSize: '15px', fontWeight: 700, textDecoration: 'none', borderRadius: '999px', padding: '13px 30px' },
      ctaNote: { fontSize: '12px', color: colors.muted, textAlign: 'center' as const, margin: '0 0 20px 0' },
      footer: { fontFamily: fonts.mono, fontSize: '11px', letterSpacing: '0.06em', color: colors.muted, textAlign: 'center' as const, margin: '24px 0 0 0' },
  };

  const h = React.createElement;

  export function EventCleanupWarning({
      language, eventTitle, dashboardUrl, daysLeft, appName, appHost,
  }: EventCleanupWarningProps): React.ReactElement {
      const t = copy[language] ?? copy.it;
      const footerText = appHost ? `${appName} · ${appHost}` : appName;

      return h(Html, { lang: language },
          h(Head),
          h(Preview, null, `${t.eyebrow} — ${eventTitle}`),
          h(Body, { style: styles.body },
              h(Container, { style: styles.container },
                  h(Section, { style: styles.card },
                      h(Text, { style: styles.eyebrow }, t.eyebrow),
                      h(Text, { style: styles.title }, eventTitle),
                      h(Text, { style: styles.message }, t.body(daysLeft)),
                      h(Section, { style: styles.ctaSection },
                          h(Button, { href: dashboardUrl, style: styles.ctaButton }, t.cta)
                      ),
                      h(Text, { style: styles.ctaNote }, t.note)
                  ),
                  h(Text, { style: styles.footer }, footerText)
              )
          )
      );
  }

  export default EventCleanupWarning;
  ```
  > Verifica i nomi reali dei token in `./_softMeadow` (`grep -n "export" server/emailTemplates/_softMeadow.ts`): se `colors.bone`/`colors.card`/`colors.wineDeep`/`fonts.serif` ecc. differiscono, allinea ai nomi esistenti (il pattern è `GuestReminderEmail.ts`).

- [ ] **Step 4: registra il template in `index.ts`.** In `server/emailTemplates/index.ts`:
  - dopo `import { GuestReminderEmail } from './GuestReminderEmail';` aggiungi `import { EventCleanupWarning } from './EventCleanupWarning';`
  - dopo `export { GuestReminderEmail } from './GuestReminderEmail';` aggiungi `export { EventCleanupWarning } from './EventCleanupWarning';`
  - prima di `// Email subject lines by language` aggiungi il render helper:
    ```ts
    /** Render avviso cleanup evento (SPEC §9.2) — HTML + text, i18n IT/EN. */
    export async function renderEventCleanupWarningEmail(options: {
        language?: SupportedLanguage;
        eventTitle: string;
        dashboardUrl: string;
        daysLeft: number;
    }): Promise<RenderedEmail> {
        const element = React.createElement(EventCleanupWarning, {
            language: options.language || 'it',
            eventTitle: options.eventTitle,
            dashboardUrl: options.dashboardUrl,
            daysLeft: options.daysLeft,
            appName: appName(),
            appHost: appHost(),
        });
        return renderBoth(element);
    }
    ```
  - dentro l'oggetto `emailSubjects`, dopo l'entry `guestReminder`, aggiungi:
    ```ts
        eventCleanupWarning: (eventTitle: string) => ({
            it: `Stiamo per archiviare "${eventTitle}"`,
            en: `We're about to archive "${eventTitle}"`,
        }),
    ```

- [ ] **Step 5: esegui PASS + commit.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm test server/emailTemplates/EventCleanupWarning.test.ts
  ```
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && git add server/emailTemplates/EventCleanupWarning.ts server/emailTemplates/index.ts server/emailTemplates/EventCleanupWarning.test.ts && git commit -m "feat(email): EventCleanupWarning template (i18n it/en)"
  ```

---

### Task 4.5 — Service `eventCleanup.service.ts` (TDD)

**Files:**
- Create: `server/services/eventCleanup.service.ts`
- Create: `server/services/eventCleanup.service.test.ts`

**Interfaces:**
- Consumes: `findStaleEventsToWarn`/`findStaleEventsToDelete`/`markEventCleanupWarned`/`findEventWarnTargetInfo`/`deleteEventScoped` (eventRepository); `isOrgAtelier` (eventAccess); `resolveOrgOwnerId` (planLimit); `sendEmail` (utils/email); `renderEventCleanupWarningEmail`/`emailSubjects` (emailTemplates); `logAudit`; `runtimeConfig.public.baseURL`.
- Produces: `export async function processStaleEventsWarn(): Promise<{ warned: number; skipped: number }>`; `export async function processStaleEventsDelete(): Promise<{ deleted: number; skipped: number }>`. L'esclusione Atelier è applicata QUI via `isOrgAtelier`.

- [ ] **Step 1: scrivi i test che falliscono.** Crea `server/services/eventCleanup.service.test.ts`:
  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";

  const repo = {
      findStaleEventsToWarn: vi.fn(), findStaleEventsToDelete: vi.fn(),
      markEventCleanupWarned: vi.fn(), findEventWarnTargetInfo: vi.fn(), deleteEventScoped: vi.fn(),
  };
  const access = { isOrgAtelier: vi.fn() };
  const plan = { resolveOrgOwnerId: vi.fn() };
  const email = { sendEmail: vi.fn() };
  const audit = { logAudit: vi.fn() };
  const tpl = {
      renderEventCleanupWarningEmail: vi.fn(async () => ({ html: "<p>x</p>", text: "x" })),
      emailSubjects: { eventCleanupWarning: () => ({ it: "S", en: "S" }) },
  };

  vi.mock("../repositories/eventRepository", () => repo);
  vi.mock("./eventAccess.service", () => access);
  vi.mock("./planLimit.service", () => plan);
  vi.mock("../utils/email", () => email);
  vi.mock("../emailTemplates", () => tpl);
  vi.mock("../utils/audit", () => audit);
  vi.mock("../utils/runtimeConfig", () => ({ runtimeConfig: { public: { baseURL: "https://app.test" } } }));

  import { processStaleEventsWarn, processStaleEventsDelete } from "./eventCleanup.service";

  beforeEach(() => {
      vi.clearAllMocks();
      plan.resolveOrgOwnerId.mockResolvedValue("owner_1");
      repo.findEventWarnTargetInfo.mockResolvedValue({ title: "T", email: "o@test", locale: "it" });
      email.sendEmail.mockResolvedValue({ success: true });
  });

  describe("processStaleEventsWarn", () => {
      it("avvisa eventi non-atelier: email + mark + audit", async () => {
          repo.findStaleEventsToWarn.mockResolvedValue([{ id: "e1", organizationId: "o1" }]);
          access.isOrgAtelier.mockResolvedValue(false);
          const res = await processStaleEventsWarn();
          expect(res).toEqual({ warned: 1, skipped: 0 });
          expect(email.sendEmail).toHaveBeenCalledTimes(1);
          expect(repo.markEventCleanupWarned).toHaveBeenCalledWith("o1", "e1", expect.any(Date));
          expect(audit.logAudit).toHaveBeenCalledWith(null, "event.cleanup_warned", expect.objectContaining({ targetId: "e1", organizationId: "o1" }));
      });

      it("salta le org atelier (mai warn, mai mark)", async () => {
          repo.findStaleEventsToWarn.mockResolvedValue([{ id: "e1", organizationId: "o1" }]);
          access.isOrgAtelier.mockResolvedValue(true);
          const res = await processStaleEventsWarn();
          expect(res).toEqual({ warned: 0, skipped: 1 });
          expect(email.sendEmail).not.toHaveBeenCalled();
          expect(repo.markEventCleanupWarned).not.toHaveBeenCalled();
      });
  });

  describe("processStaleEventsDelete", () => {
      it("elimina eventi warned non-atelier + audit event.deleted", async () => {
          repo.findStaleEventsToDelete.mockResolvedValue([{ id: "e1", organizationId: "o1" }]);
          access.isOrgAtelier.mockResolvedValue(false);
          repo.deleteEventScoped.mockResolvedValue({ id: "e1" });
          const res = await processStaleEventsDelete();
          expect(res).toEqual({ deleted: 1, skipped: 0 });
          expect(repo.deleteEventScoped).toHaveBeenCalledWith("o1", "e1");
          expect(audit.logAudit).toHaveBeenCalledWith(null, "event.deleted", expect.objectContaining({ targetId: "e1", organizationId: "o1" }));
      });

      it("salta le org atelier (mai delete)", async () => {
          repo.findStaleEventsToDelete.mockResolvedValue([{ id: "e1", organizationId: "o1" }]);
          access.isOrgAtelier.mockResolvedValue(true);
          const res = await processStaleEventsDelete();
          expect(res).toEqual({ deleted: 0, skipped: 1 });
          expect(repo.deleteEventScoped).not.toHaveBeenCalled();
      });
  });
  ```

- [ ] **Step 2: esegui e verifica FAIL** (modulo inesistente).

- [ ] **Step 3: implementa il service.** Crea `server/services/eventCleanup.service.ts`:
  ```ts
  /**
   * Event Cleanup Service (SPEC §9) — contesto di sistema (Vercel Cron, no utente).
   * Due fasi idempotenti: warn (email all'owner + cleanupWarnedAt) e delete (cascade
   * FK). L'esclusione org Atelier è QUI via isOrgAtelier (non nel SQL: richiede la
   * subscription per-org). Nessun lavoro pesante: lavora su liste già filtrate.
   */
  import {
      findStaleEventsToWarn, findStaleEventsToDelete, markEventCleanupWarned,
      findEventWarnTargetInfo, deleteEventScoped,
  } from "../repositories/eventRepository";
  import { isOrgAtelier } from "./eventAccess.service";
  import { resolveOrgOwnerId } from "./planLimit.service";
  import { sendEmail } from "../utils/email";
  import { renderEventCleanupWarningEmail, emailSubjects } from "../emailTemplates";
  import { logAudit } from "../utils/audit";
  import { runtimeConfig } from "../utils/runtimeConfig";

  const WARN_DAYS_LEFT = 7;

  function dashboardEventUrl(eventId: string): string {
      const base = ((runtimeConfig.public.baseURL as string) || "").replace(/\/$/, "");
      return `${base}/dashboard/events/${eventId}`;
  }

  export async function processStaleEventsWarn(): Promise<{ warned: number; skipped: number }> {
      const now = new Date();
      const candidates = await findStaleEventsToWarn(now);
      let warned = 0, skipped = 0;
      for (const { id, organizationId } of candidates) {
          if (await isOrgAtelier(organizationId)) { skipped++; continue; }
          const ownerId = await resolveOrgOwnerId(organizationId);
          if (!ownerId) { skipped++; continue; }
          const info = await findEventWarnTargetInfo(organizationId, id, ownerId);
          if (!info) { skipped++; continue; }
          const language = info.locale === "en" ? "en" : "it";
          const { html, text } = await renderEventCleanupWarningEmail({
              language, eventTitle: info.title, dashboardUrl: dashboardEventUrl(id), daysLeft: WARN_DAYS_LEFT,
          });
          await sendEmail({
              type: "custom", to: info.email, userId: ownerId, language,
              subject: emailSubjects.eventCleanupWarning(info.title)[language], html, text,
          });
          await markEventCleanupWarned(organizationId, id, now);
          await logAudit(null, "event.cleanup_warned", {
              organizationId, targetType: "event", targetId: id, details: { daysLeft: WARN_DAYS_LEFT },
          });
          warned++;
      }
      return { warned, skipped };
  }

  export async function processStaleEventsDelete(): Promise<{ deleted: number; skipped: number }> {
      const now = new Date();
      const candidates = await findStaleEventsToDelete(now);
      let deleted = 0, skipped = 0;
      for (const { id, organizationId } of candidates) {
          if (await isOrgAtelier(organizationId)) { skipped++; continue; }
          const removed = await deleteEventScoped(organizationId, id);
          if (!removed) { skipped++; continue; }
          await logAudit(null, "event.deleted", {
              organizationId, targetType: "event", targetId: id, details: { reason: "auto_cleanup" },
          });
          deleted++;
      }
      return { deleted, skipped };
  }
  ```
  > Verifica la firma reale di `sendEmail` (`grep -n "export.*sendEmail\|type:" server/utils/email.ts`): se il tipo `'custom'` o i campi differiscono, adatta la chiamata alla firma esistente.

- [ ] **Step 4: esegui PASS + typecheck + commit.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm test server/services/eventCleanup.service.test.ts && pnpm typecheck 2>&1 | grep -i "eventCleanup" || echo "OK"
  ```
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && git add server/services/eventCleanup.service.ts server/services/eventCleanup.service.test.ts && git commit -m "feat(events): eventCleanup service (warn + delete, atelier-excluded)"
  ```

---

### Task 4.6 — Cron route `cleanup-stale-events.get.ts` (TDD) + registrazione in `nuxt.config.ts`

**Files:**
- Create: `server/api/cron/cleanup-stale-events.get.ts`
- Create: `server/api/cron/cleanup-stale-events.test.ts`
- Modify: `nuxt.config.ts` (`nitro.vercel.config.crons`)

**Interfaces:**
- Consumes: `processStaleEventsWarn`/`processStaleEventsDelete` (Task 4.5); `requireAdminApiKey`; `useRuntimeConfig().cronSecret`.
- Produces: `GET /api/cron/cleanup-stale-events` → `{ warn: {warned;skipped}, delete: {deleted;skipped} }`; auth 3-way (`x-vercel-cron` / `Bearer cronSecret` / `requireAdminApiKey`). Entry cron `{ path, schedule: "0 4 * * *" }`.

- [ ] **Step 1: scrivi il test che fallisce.** Crea `server/api/cron/cleanup-stale-events.test.ts` con stub delle auto-import (`defineEventHandler`/`getHeader`/`useRuntimeConfig`/`createError`) e mock del service + `requireAdminApiKey`. Casi: (a) `x-vercel-cron` presente → warn poi delete, no admin guard; (b) `Bearer cronSecret` → no admin guard; (c) nessuna auth cron → `requireAdminApiKey` chiamato una volta.

- [ ] **Step 2: esegui e verifica FAIL** (route inesistente).

- [ ] **Step 3: implementa la route** (pattern identico a `send-reminders.get.ts`):
  ```ts
  /**
   * Vercel Cron (04:00 UTC): cleanup eventi conclusi+inattivi (SPEC §9). Fase WARN
   * (email + cleanupWarnedAt) poi DELETE (warned ≥7gg → delete cascade). Org Atelier
   * escluse. Auth 3-way come send-reminders.
   */
  import { requireAdminApiKey } from "~~/server/utils/requireAdminApiKey";
  import { processStaleEventsWarn, processStaleEventsDelete } from "~~/server/services/eventCleanup.service";

  export default defineEventHandler(async (event) => {
      const config = useRuntimeConfig();
      const cronSecret = config.cronSecret as string | undefined;
      const authorization = getHeader(event, "authorization");
      const isVercelCron = Boolean(getHeader(event, "x-vercel-cron"))
          || (Boolean(cronSecret) && authorization === `Bearer ${cronSecret}`);
      if (!isVercelCron) {
          await requireAdminApiKey(event);
      }
      try {
          const warn = await processStaleEventsWarn();
          const del = await processStaleEventsDelete();
          return { warn, delete: del };
      } catch (e) {
          const err = e as { statusCode?: number };
          if (err.statusCode) throw e;
          console.error("[cron.cleanup-stale-events] error:", e);
          throw createError({ statusCode: 500, statusMessage: "Failed to cleanup stale events" });
      }
  });
  ```

- [ ] **Step 4: esegui PASS.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm test server/api/cron/cleanup-stale-events.test.ts
  ```
  Atteso: `3 passed`.

- [ ] **Step 5: registra il cron in `nuxt.config.ts`.** Dentro `crons: [ … ]`, dopo il blocco `send-reminders`, aggiungi:
  ```ts
                      {
                          // Cleanup eventi conclusi+inattivi (SPEC §9): warn+delete
                          // giornaliero 04:00 UTC (dopo send-reminders).
                          path: "/api/cron/cleanup-stale-events",
                          schedule: "0 4 * * *",
                      },
  ```

- [ ] **Step 6: typecheck + verifica registrazione + commit.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm typecheck && grep -q 'cleanup-stale-events' nuxt.config.ts && echo "CRON-REGISTERED"
  ```
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && git add server/api/cron/cleanup-stale-events.get.ts server/api/cron/cleanup-stale-events.test.ts nuxt.config.ts && git commit -m "feat(cron): cleanup-stale-events endpoint + register in vercel crons (04:00 UTC)"
  ```

---

### Task 4.7 — Test DETERMINISTICO DB-backed: l'evento futuro NON viene mai eliminato (spec §9.1)

**Files:**
- Create: `server/repositories/eventRepository.staleScenarios.test.ts`

**Interfaces:**
- Consumes: `findStaleEventsToDelete(now)` (Task 4.2) contro il branch Neon dev reale — NESSUN mock, NESSUN string-match su `JSON.stringify(where)`. Inserisce righe reali e asserisce inclusione/esclusione.

> **È lo scenario distruttivo più pericoloso dello spec.** La determinatezza vive nel SEED, non nell'asserzione: l'evento "da eliminare" deve avere `updatedAt` ESPLICITAMENTE nel passato (l'insert default `now()` fallirebbe silenziosamente il predicato "inattivo" e farebbe passare il test per la ragione sbagliata) E `cleanupWarnedAt` NON NULL `< now-7gg`. L'evento futuro deve essere ben oltre +7gg. Teardown in `afterEach` su org random (branch dev condiviso).

- [ ] **Step 1: scrivi il test DETERMINISTICO.** Crea `server/repositories/eventRepository.staleScenarios.test.ts`:
  ```ts
  import { describe, it, expect, afterEach } from "vitest";
  import { randomUUID } from "node:crypto";
  import { eq } from "drizzle-orm";
  import { getDB } from "~~/server/utils/db";
  import * as schema from "~~/server/database/schema";
  import { findStaleEventsToDelete } from "~~/server/repositories/eventRepository";

  const db = getDB();
  let orgId = "";
  const DAY = 24 * 60 * 60 * 1000;

  async function makeOrg(): Promise<string> {
      const id = `org_test_${randomUUID()}`;
      await db.insert(schema.organization).values({ id, name: "test-stale", slug: `test-stale-${randomUUID()}`, createdAt: new Date() });
      return id;
  }

  // Inserisce un evento con updatedAt/cleanupWarnedAt/eventDate ESPLICITI (no default now()).
  async function insertEvent(o: string, over: Record<string, unknown>): Promise<string> {
      const id = `evt_${randomUUID()}`;
      await db.insert(schema.events).values({
          id, organizationId: o, type: "compleanno", templateKey: "compleanno-default",
          title: "t", slug: `slug-${randomUUID()}`, status: "draft", tier: "free",
          ...over,
      });
      return id;
  }

  afterEach(async () => {
      if (!orgId) return;
      await db.delete(schema.events).where(eq(schema.events.organizationId, orgId));
      await db.delete(schema.organization).where(eq(schema.organization.id, orgId));
      orgId = "";
  });

  describe("findStaleEventsToDelete — scenari distruttivi (spec §9.1)", () => {
      it("ESCLUDE l'evento futuro/attivo; INCLUDE solo i conclusi+inattivi+warned", async () => {
          orgId = await makeOrg();
          const now = new Date();
          const past60 = new Date(now.getTime() - 60 * DAY);
          const warned10 = new Date(now.getTime() - 10 * DAY);

          // (A) DA ELIMINARE: concluso (eventDate passata) + inattivo (updatedAt -60gg)
          //     + warned 10gg fa. Tutti i campi temporali ESPLICITI.
          const toDelete = await insertEvent(orgId, {
              status: "closed",
              eventDate: past60,
              updatedAt: past60,
              cleanupWarnedAt: warned10,
          });

          // (B) FUTURO ATTIVO: eventDate +30gg. warned di proposito (cleanupWarnedAt
          //     valorizzato): così l'UNICA ragione di esclusione è 'concluso'=false —
          //     il cuore del test §9.1. NON nullare cleanupWarnedAt, lo escluderebbe
          //     per il warn-gate invece che per la non-conclusione (verde per la
          //     ragione sbagliata).
          await insertEvent(orgId, {
              status: "active",
              eventDate: new Date(now.getTime() + 30 * DAY),
              updatedAt: past60,
              cleanupWarnedAt: warned10,
          });

          // (C) CONCLUSO+INATTIVO ma NON ancora warned (cleanupWarnedAt NULL):
          //     non deve essere eliminato (manca il preavviso).
          await insertEvent(orgId, {
              status: "closed",
              eventDate: past60,
              updatedAt: past60,
              cleanupWarnedAt: null,
          });

          const rows = await findStaleEventsToDelete(now);
          const ids = rows.filter(r => r.organizationId === orgId).map(r => r.id);

          expect(ids).toContain(toDelete);          // (A) incluso
          expect(ids).toHaveLength(1);              // solo (A): (B) futuro e (C) non-warned esclusi
      });
  });
  ```
  > Se l'insert richiede campi NOT NULL aggiuntivi (es. `createdAt`), aggiungili a `insertEvent`/`makeOrg` leggendo lo schema reale. L'asserzione filtra per `organizationId === orgId` così altre righe del branch condiviso non interferiscono.

- [ ] **Step 2: esegui e verifica PASS** (contro il branch Neon dev reale).
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm test server/repositories/eventRepository.staleScenarios.test.ts
  ```
  Atteso: `1 passed`. Se fallisce perché l'insert non accetta `updatedAt` esplicito (colonna con `$onUpdate`), forza il valore con un `UPDATE` successivo all'insert sullo stesso id prima di chiamare `findStaleEventsToDelete`.

- [ ] **Step 3: verifica cleanup (nessun residuo) + commit.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && node --env-file=.env -e "const{neon}=require('@neondatabase/serverless');const sql=neon(process.env.NUXT_DATABASE_URL);sql\`select count(*)::int as c from organization where id like 'org_test_%'\`.then(r=>console.log('residui:',r[0].c))"
  ```
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && git add server/repositories/eventRepository.staleScenarios.test.ts && git commit -m "test(events): deterministic DB test — future event never deleted (spec §9.1)"
  ```

---

### Task 4.8 — Verifica di fase

- [ ] **Step 1: intera suite + typecheck + lint.**
  ```bash
  cd /Users/airowlgasga/coding/project/ceremly-v2 && pnpm test && pnpm typecheck && pnpm lint
  ```
  Atteso: tutti i test passano (incluso il deterministico del Task 4.7); cron registrato; `event.cleanup_warned` nella taxonomy; template registrato; service esclude Atelier.

- [ ] **Step 2: working tree clean** (`git status --porcelain`).

> **Definition of Done Fase 4:** un evento futuro/attivo non è mai candidato (predicato 'concluso' falso, verificato dal test deterministico DB-backed); un evento concluso+inattivo+warned-da-≥7gg viene eliminato con cascade FK; org Atelier escluse in entrambe le fasi.

---

## Fase 5 — UI: paywall per-evento + pagina subscription + pricing

Obiettivo: allineare il frontend al modello a 3 tier (Free/Celebrazione/Atelier), introdurre un componente paywall per-evento che intercetta il 402 e avvia il checkout Celebrazione, e rifare `/dashboard/subscription` da griglia 3-piani a stato-piano + eventi sbloccati. Il gate dei componenti Vue è `pnpm typecheck` + verifica manuale (no TDD su .vue).

> **Precondizioni:** Fase 1 (`pricing.ts` con `CeremlyTier`/`CEREMLY_TIER_LIMITS`/`CELEBRATION_PRICE_CENTS`/`ATELIER_PRICE_CENTS`; `useSubscription.ts` già ripulito dai 6 slug; `runtimeConfig.public.creemProductIdAtelier`) + Fase 3 (`POST /api/events/[id]/unlock` → `{ url }`).
> **i18n: MAI il carattere `@` nei valori** (rompe il file locale). Dopo ogni edit ai locale: verifica integrità JSON + assenza `@`.

---

### Task 5.1 — `useSubscription.ts`: modello Free/Atelier + `unlockEvent`

**Files:**
- Modify: `app/composables/useSubscription.ts`
- Modify: `app/layouts/ceremly.vue` (consumatore di `currentPlan`)
- Modify: `i18n/locales/{it-IT,en-US}.json` (chiave `ceremly.layout.planAtelier`)

**Interfaces:**
- Consumes: `POST /api/events/[id]/unlock` → `{ url }` (Fase 3); `runtimeConfig.public.creemProductIdAtelier`; il client Creem reale (`const { creem } = useAuth()` → `creem.createPortal()`/`creem.hasAccessGranted()` — verifica il naming esistente nel file, NON assumere `authClient.creem`).
- Produces: `useSubscription()` → `{ subscription, hasActiveSubscription, hasAccess, isAtelier: ComputedRef<boolean>, currentTier: ComputedRef<'free'|'atelier'>, isUpdating, unlockEvent(eventId): Promise<void>, openCustomerPortal(), refreshSubscription() }`.

- [ ] **Step 1: sostituisci `getPlanNameFromProductId` con `getTierFromProductId` Free/Atelier.**
  ```ts
      function getTierFromProductId(productId: string | undefined | null): "free" | "atelier" {
          if (!productId) return "free";
          const pub = runtimeConfig.public;
          if (productId === pub.creemProductIdAtelier) return "atelier";
          return "free";
      }
  ```

- [ ] **Step 2: sostituisci `currentPlan` con `currentTier` + `isAtelier`.**
  ```ts
      const currentTier = computed<"free" | "atelier">(() => {
          if (!hasAccess.value) return "free";
          return getTierFromProductId((subscription.value as { productId?: string } | null)?.productId);
      });
      const isAtelier = computed<boolean>(() => currentTier.value === "atelier");
  ```

- [ ] **Step 3: rimuovi `createCheckoutSession`, aggiungi `unlockEvent`.**
  ```ts
      async function unlockEvent(eventId: string): Promise<void> {
          if (import.meta.server) throw new Error("unlockEvent is not available on server");
          const { url } = await $fetch<{ url: string }>(`/api/events/${eventId}/unlock`, { method: "POST" });
          window.location.href = url;
      }
  ```

- [ ] **Step 4: aggiorna il `return`** esponendo `currentTier`, `isAtelier`, `unlockEvent` (rimuovi `currentPlan`/`createCheckoutSession`).

- [ ] **Step 5: aggiorna `app/layouts/ceremly.vue`.** Cambia la destrutturazione `currentPlan` → `isAtelier`; sostituisci il computed `planLabel`:
  ```ts
  const { hasActiveSubscription, isAtelier, refreshSubscription } = useSubscription();
  ```
  ```ts
  const planLabel = computed(() => {
      if (!hasActiveSubscription.value || !isAtelier.value) return t("ceremly.layout.planFree");
      return t("ceremly.layout.planAtelier");
  });
  ```

- [ ] **Step 6: aggiungi `ceremly.layout.planAtelier`** in entrambi i locale, accanto a `planFree`: `"planAtelier": "Atelier"`. Verifica `planFree` esistente prima.

- [ ] **Step 7: typecheck mirato.**
  ```bash
  pnpm typecheck 2>&1 | grep -E "useSubscription|ceremly.vue|currentPlan|getPlanNameFromProductId|createCheckoutSession" || echo "NESSUN ERRORE su useSubscription/layout"
  ```
  Atteso: `NESSUN ERRORE`. Errori "currentPlan does not exist" altrove = consumatori migrati nel Task 5.3.

- [ ] **Step 8: verifica JSON + commit.**
  ```bash
  node -e "require('./i18n/locales/it-IT.json'); require('./i18n/locales/en-US.json'); console.log('JSON OK')"
  git add app/composables/useSubscription.ts app/layouts/ceremly.vue i18n/locales/it-IT.json i18n/locales/en-US.json && git commit -m "refactor(subscription): useSubscription a modello Free/Atelier + unlockEvent"
  ```

---

### Task 5.2 — `usePricing.ts` 3-tier + rimozione `landing/Pricing.vue` boilerplate

**Files:**
- Modify: `app/composables/usePricing.ts` (intero file)
- Delete: `app/components/landing/Pricing.vue` (boilerplate non referenziato; consuma il vecchio `usePricing` con `pricing.monthly/yearly`)

**Interfaces:**
- Consumes: `CEREMLY_TIER_LIMITS`, `CELEBRATION_PRICE_CENTS`, `ATELIER_PRICE_CENTS`, `CeremlyTier` (Fase 1)
- Produces: `usePricing()` → `{ tiers, getTier(id) }`; helper `isUnlimited`, `formatLimit`.

- [ ] **Step 1: conferma le esportazioni Fase 1.**
  ```bash
  grep -nE "export (const|type) (CeremlyTier|CEREMLY_TIER_LIMITS|CELEBRATION_PRICE_CENTS|ATELIER_PRICE_CENTS)" shared/constants/pricing.ts
  ```
  Atteso: 4 righe. Se mancano, Fase 1 incompleta: fermati.

- [ ] **Step 2: riscrivi `app/composables/usePricing.ts`** (intero file):
  ```ts
  /**
   * usePricing — modello Ceremly a 3 tier (Free / Celebrazione / Atelier).
   * Le label/feature vivono in i18n (ceremly.home.pricing.*); i numeri di limite
   * arrivano da CEREMLY_TIER_LIMITS. Niente toggle mensile/annuale.
   */
  import {
      CEREMLY_TIER_LIMITS,
      CELEBRATION_PRICE_CENTS,
      ATELIER_PRICE_CENTS,
      type CeremlyTier,
  } from "~~/shared/constants/pricing";

  export interface CeremlyTierView {
      id: CeremlyTier;
      /** Prezzo in centesimi EUR; 0 per Free. */
      priceCents: number;
      /** 'free' | 'once' (Celebrazione) | 'month' (Atelier). */
      billing: "free" | "once" | "month";
      maxGuestsPerEvent: number;
      maxActiveEvents: number;
      maxReminders: number;
      unlimited: boolean;
  }

  const TIERS: CeremlyTierView[] = [
      { id: "free", priceCents: 0, billing: "free", ...CEREMLY_TIER_LIMITS.free },
      { id: "celebration", priceCents: CELEBRATION_PRICE_CENTS, billing: "once", ...CEREMLY_TIER_LIMITS.celebration },
      { id: "atelier", priceCents: ATELIER_PRICE_CENTS, billing: "month", ...CEREMLY_TIER_LIMITS.atelier },
  ];

  export const usePricing = () => {
      const tiers = shallowRef<CeremlyTierView[]>(TIERS);
      const getTier = (id: CeremlyTier): CeremlyTierView | undefined => TIERS.find(t => t.id === id);
      return { tiers, getTier };
  };

  /** True se un limite è illimitato (-1). */
  export const isUnlimited = (value: number): boolean => value === -1;

  /** Formatta un limite per display (-1 → testo "illimitati"). */
  export const formatLimit = (value: number, unlimitedText = "Illimitati"): string =>
      isUnlimited(value) ? unlimitedText : value.toString();
  ```

- [ ] **Step 3: verifica che `pricing.vue` non consumi `usePricing`** (usa `CerSitePricing` + tabella i18n):
  ```bash
  grep -n "usePricing\|PRICING_PLANS\|billingPeriod\|monthly\|yearly" app/pages/pricing.vue || echo "pricing.vue OK"
  ```

- [ ] **Step 4: elimina `landing/Pricing.vue`** dopo aver confermato che non è referenziato:
  ```bash
  grep -rn "LandingPricing\|landing/Pricing" app/ | grep -v "Pricing.vue:" || echo "non referenziato"
  git rm app/components/landing/Pricing.vue
  ```

- [ ] **Step 5: typecheck + commit.**
  ```bash
  pnpm typecheck 2>&1 | grep -E "usePricing|pricing.vue|PricingPlan|pricing.monthly|pricing.yearly" || echo "NESSUN ERRORE su pricing"
  git add app/composables/usePricing.ts && git commit -m "refactor(pricing): usePricing 3-tier + rimuove landing/Pricing boilerplate"
  ```

---

### Task 5.3 — Rifare `dashboard/subscription/index.vue` (stato piano + eventi sbloccati + portal)

**Files:**
- Modify: `app/pages/dashboard/subscription/index.vue` (script + template)
- Modify: `shared/types/ceremly.ts` (aggiungi `tier`/`unlockedAt` a `CeremlyEvent` se assenti)
- Modify: `i18n/locales/{it-IT,en-US}.json` (chiavi `subscription.tier.*`, `subscription.unlockedEvents.*`, `subscription.manageAtelier`, `subscription.discoverAtelier`)

**Interfaces:**
- Consumes: `useSubscription()` → `{ isAtelier, hasActiveSubscription, subscription, openCustomerPortal, refreshSubscription }` (Task 5.1); `useEvents().listEvents()` → `EventWithCounts[]` (filtro `tier === 'celebration'`).
- Produces: pagina stato-piano (Free/Atelier) + lista eventi sbloccati + gestione Atelier via portal.

- [ ] **Step 1: verifica/aggiungi `tier` su `EventWithCounts`/`CeremlyEvent`.**
  ```bash
  grep -rn "tier" shared/types/ceremly.ts app/composables/useEvents.ts | head
  ```
  Se assente, aggiungi a `CeremlyEvent`: `tier: "free" | "celebration";` e `unlockedAt: string | null;` (timestamp serializzati ISO da `$fetch`).

- [ ] **Step 2: riscrivi lo `<script setup>`** di `dashboard/subscription/index.vue`:
  ```ts
  <script setup lang="ts">
  import type { EventWithCounts } from "~/composables/useEvents";

  const { t, locale } = useI18n();
  const { subscription, isAtelier, hasActiveSubscription, openCustomerPortal, refreshSubscription } = useSubscription();
  const { listEvents } = useEvents();
  const { fetchSession } = useAuth();
  const localePath = useLocalePath();
  const toast = useToast();

  // Eventi sbloccati (Celebrazione)
  const events = ref<EventWithCounts[]>([]);
  const eventsLoading = ref(true);
  const unlockedEvents = computed(() => events.value.filter(e => e.tier === "celebration"));

  async function loadEvents() {
      eventsLoading.value = true;
      try { events.value = await listEvents(); }
      catch { events.value = []; }
      finally { eventsLoading.value = false; }
  }

  // Tier corrente
  const currentTierLabel = computed(() => isAtelier.value ? t("subscription.tier.atelier") : t("subscription.tier.free"));
  const currentTierDesc = computed(() => isAtelier.value ? t("subscription.tier.atelierDesc") : t("subscription.tier.freeDesc"));

  // Data rinnovo (solo Atelier)
  const renewalDate = computed(() => {
      const sub = subscription.value as { periodEnd?: string | Date | null } | null;
      if (!sub?.periodEnd) return null;
      return new Date(sub.periodEnd).toLocaleDateString(locale.value === "it" ? "it-IT" : "en-US", { day: "numeric", month: "long", year: "numeric" });
  });

  function formatUnlockedDate(iso: string | null): string {
      if (!iso) return "";
      return new Date(iso).toLocaleDateString(locale.value === "it" ? "it-IT" : "en-US", { day: "numeric", month: "long", year: "numeric" });
  }

  // Gestione Atelier via portal
  const isPortalLoading = ref(false);
  async function handleOpenPortal() {
      isPortalLoading.value = true;
      try { await openCustomerPortal(); }
      catch { toast.add({ title: t("subscription.toast.error"), description: t("subscription.toast.errorOccurred"), color: "error" }); }
      finally { isPortalLoading.value = false; }
  }

  // Sync
  const isSyncing = ref(false);
  async function handleSync() {
      isSyncing.value = true;
      try {
          await refreshSubscription();
          await fetchSession();
          await loadEvents();
          toast.add({ title: t("subscription.synced"), color: "success" });
      } catch { toast.add({ title: t("subscription.syncError"), color: "error" }); }
      finally { isSyncing.value = false; }
  }

  onMounted(async () => { await Promise.all([refreshSubscription(), loadEvents()]); });
  </script>
  ```
  > Adatta `subscription.toast.*`/`subscription.synced`/`subscription.syncError` alle chiavi i18n già esistenti (verifica con `node -e "console.log(Object.keys(require('./i18n/locales/it-IT.json').subscription))"`).

- [ ] **Step 3: riscrivi il `<template>`** di `dashboard/subscription/index.vue`:
  ```html
  <template>
      <UDashboardPanel id="subscription-page">
          <template #header>
              <UDashboardNavbar :title="$t('subscription.title')">
                  <template #leading><UDashboardSidebarCollapse /></template>
                  <template #right>
                      <UTooltip :text="$t('subscription.sync')">
                          <UButton :loading="isSyncing" color="neutral" variant="ghost" icon="i-lucide-refresh-cw" size="sm" square @click="handleSync" />
                      </UTooltip>
                  </template>
              </UDashboardNavbar>
          </template>

          <template #body>
              <div class="max-w-3xl mx-auto py-8 px-4 sm:px-6 space-y-10">
                  <!-- Card: piano corrente -->
                  <div class="rounded-xl border border-default bg-default p-6 sm:p-8 shadow-sm">
                      <div class="flex flex-wrap items-center justify-between gap-6">
                          <div class="flex items-center gap-5">
                              <div class="h-16 w-16 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                                  <UIcon name="i-lucide-badge-check" class="w-8 h-8 text-primary" />
                              </div>
                              <div class="space-y-1.5">
                                  <UBadge :color="isAtelier ? 'primary' : 'neutral'" variant="subtle" size="xs" class="uppercase tracking-wider font-bold">
                                      {{ isAtelier ? $t('subscription.status.active') : $t('subscription.tier.freeBadge') }}
                                  </UBadge>
                                  <h2 class="text-xl font-bold">{{ $t('subscription.currentPlanLabel') }}: {{ currentTierLabel }}</h2>
                                  <p class="text-sm text-muted">
                                      {{ currentTierDesc }}
                                      <span v-if="isAtelier && renewalDate"> — {{ $t('subscription.renewalDate') }}: {{ renewalDate }}</span>
                                  </p>
                              </div>
                          </div>
                          <div class="flex items-center gap-3">
                              <UButton v-if="isAtelier && hasActiveSubscription" :loading="isPortalLoading" color="neutral" variant="soft" size="sm" leading-icon="i-lucide-external-link" @click="handleOpenPortal">
                                  {{ $t('subscription.manageAtelier') }}
                              </UButton>
                              <UButton v-else :to="localePath('/pricing')" color="primary" size="sm" leading-icon="i-lucide-sparkles">
                                  {{ $t('subscription.discoverAtelier') }}
                              </UButton>
                          </div>
                      </div>
                  </div>

                  <!-- Eventi sbloccati (Celebrazione) -->
                  <div class="space-y-4">
                      <h3 class="text-lg font-bold">{{ $t('subscription.unlockedEvents.title') }}</h3>
                      <p class="text-sm text-muted">{{ $t('subscription.unlockedEvents.subtitle') }}</p>
                      <div v-if="eventsLoading" class="text-sm text-muted">{{ $t('common.loading') }}</div>
                      <div v-else-if="unlockedEvents.length === 0" class="rounded-xl border border-dashed border-default p-8 text-center">
                          <UIcon name="i-lucide-ticket" class="w-8 h-8 text-muted mx-auto mb-3" />
                          <p class="text-sm text-muted">{{ $t('subscription.unlockedEvents.empty') }}</p>
                      </div>
                      <ul v-else class="divide-y divide-default rounded-xl border border-default bg-default overflow-hidden">
                          <li v-for="ev in unlockedEvents" :key="ev.id" class="flex items-center justify-between gap-4 p-4">
                              <div class="min-w-0">
                                  <NuxtLink :to="localePath(`/dashboard/events/${ev.id}`)" class="font-semibold truncate hover:text-primary">{{ ev.title }}</NuxtLink>
                                  <p class="text-xs text-muted mt-0.5">{{ $t('subscription.unlockedEvents.unlockedOn') }}: {{ formatUnlockedDate(ev.unlockedAt) }}</p>
                              </div>
                              <UBadge color="success" variant="subtle" size="xs" class="shrink-0">{{ $t('subscription.unlockedEvents.badge') }}</UBadge>
                          </li>
                      </ul>
                  </div>

                  <!-- Gestione fatturazione Atelier -->
                  <div v-if="isAtelier && hasActiveSubscription" class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <UPageCard :title="$t('subscription.paymentMethods.title')" variant="subtle">
                          <UButton :loading="isPortalLoading" color="neutral" variant="outline" size="sm" leading-icon="i-lucide-external-link" @click="handleOpenPortal">{{ $t('subscription.paymentMethods.cta') }}</UButton>
                      </UPageCard>
                      <UPageCard :title="$t('subscription.billingHistory.title')" variant="subtle">
                          <UButton :loading="isPortalLoading" color="neutral" variant="outline" size="sm" leading-icon="i-lucide-external-link" @click="handleOpenPortal">{{ $t('subscription.billingHistory.cta') }}</UButton>
                      </UPageCard>
                  </div>
              </div>
          </template>
      </UDashboardPanel>
  </template>
  ```
  > `ev.tier`/`ev.unlockedAt` richiedono i campi su `EventWithCounts` (Step 1). Se `subscription.paymentMethods`/`billingHistory`/`status.active` non esistono già, riusa chiavi esistenti o aggiungile (Step 4).

- [ ] **Step 4: aggiungi le chiavi i18n** `subscription.tier.{free,freeDesc,freeBadge,atelier,atelierDesc}`, `subscription.manageAtelier`, `subscription.discoverAtelier`, `subscription.unlockedEvents.{title,subtitle,empty,unlockedOn,badge}` in IT/EN. NESSUN `@`; usa "comparira"/"piu" senza apostrofo dove serve.

- [ ] **Step 5: verifica JSON + assenza `@`.**
  ```bash
  node -e "const it=require('./i18n/locales/it-IT.json'); const s=JSON.stringify(it.subscription); if(s.includes('@')){console.error('@ TROVATO');process.exit(1)} require('./i18n/locales/en-US.json'); console.log('JSON OK, no @')"
  ```

- [ ] **Step 6: typecheck mirato + verifica manuale.**
  ```bash
  pnpm typecheck 2>&1 | grep -E "subscription/index.vue|EventWithCounts|currentPlan|createCheckoutSession" || echo "NESSUN ERRORE"
  ```
  Manuale (`pnpm dev`): `/dashboard/subscription` da utente Free → card "Free", CTA "Scopri Atelier", box "Nessun evento sbloccato". Nessun toggle/griglia 3-piani.

- [ ] **Step 7: commit.**
  ```bash
  git add app/pages/dashboard/subscription/index.vue shared/types/ceremly.ts i18n/locales/it-IT.json i18n/locales/en-US.json && git commit -m "feat(subscription): pagina stato piano Free/Atelier + eventi sbloccati"
  ```

---

### Task 5.4 — Componente paywall `CerCelebrationPaywall.vue`

**Files:**
- Create: `app/components/ceremly/CerCelebrationPaywall.vue`
- Modify: `i18n/locales/{it-IT,en-US}.json` (chiavi `ceremly.paywall.*`)

**Interfaces:**
- Consumes: `useSubscription().unlockEvent(eventId)` (Task 5.1); `CELEBRATION_PRICE_CENTS` (display).
- Produces: modal con `v-model:open`, prop `eventId`, prop opzionale `reason`, emit `close`.

- [ ] **Step 1: crea `app/components/ceremly/CerCelebrationPaywall.vue`** (modal stile ceremly, prezzo da `CELEBRATION_PRICE_CENTS`, feature da i18n, CTA → `unlockEvent`). Contenuto completo:
  ```html
  <script setup lang="ts">
  // Paywall per-evento: intercetta il 402 (limite Free) e propone lo sblocco
  // Celebrazione (€39 una tantum). Lo sblocco crea il checkout Creem server-side
  // e fa redirect — vedi useSubscription().unlockEvent.
  import CerIcon from "~/components/ceremly/CerIcon.vue";
  import { CELEBRATION_PRICE_CENTS } from "~~/shared/constants/pricing";

  const props = defineProps<{
      /** Apertura controllata dal genitore (v-model:open). */
      open: boolean;
      /** Evento da sbloccare. */
      eventId: string;
      /** Messaggio dal 402. */
      reason?: string;
  }>();

  const emit = defineEmits<{ "update:open": [value: boolean]; close: [] }>();

  const { t } = useI18n();
  const toast = useToast();
  const { unlockEvent } = useSubscription();

  const loading = ref(false);
  const priceLabel = computed(() => `€${(CELEBRATION_PRICE_CENTS / 100).toFixed(0)}`);
  const features = computed<string[]>(() => [
      t("ceremly.paywall.feat1"), t("ceremly.paywall.feat2"),
      t("ceremly.paywall.feat3"), t("ceremly.paywall.feat4"),
  ]);

  function onClose() { emit("update:open", false); emit("close"); }

  async function onUnlock() {
      loading.value = true;
      try {
          // unlockEvent fa redirect al checkout Creem: in caso di successo la
          // pagina cambia e questo codice non prosegue.
          await unlockEvent(props.eventId);
      } catch {
          loading.value = false;
          toast.add({ title: t("ceremly.paywall.errorTitle"), description: t("ceremly.paywall.errorDesc"), color: "error" });
      }
  }
  </script>

  <template>
      <UModal :open="open" @update:open="(v: boolean) => !v && onClose()">
          <template #content>
              <div class="cer-paywall">
                  <div class="cer-paywall-head">
                      <span class="cer-paywall-icon"><CerIcon name="sparkle" :s="22" /></span>
                      <button type="button" class="cer-paywall-x" :aria-label="t('common.close')" @click="onClose"><CerIcon name="x" :s="18" /></button>
                  </div>
                  <h2 class="cer-paywall-title serif">{{ t("ceremly.paywall.title") }}</h2>
                  <p v-if="reason" class="cer-paywall-reason">{{ reason }}</p>
                  <p class="cer-paywall-sub">{{ t("ceremly.paywall.subtitle") }}</p>
                  <div class="cer-paywall-price">
                      <span class="cer-paywall-amount serif">{{ priceLabel }}</span>
                      <span class="cer-paywall-once">{{ t("ceremly.paywall.once") }}</span>
                  </div>
                  <ul class="cer-paywall-feats">
                      <li v-for="f in features" :key="f"><span class="cer-paywall-check"><CerIcon name="check" :s="15" /></span>{{ f }}</li>
                  </ul>
                  <button type="button" class="cer-btn dark cer-paywall-cta" :disabled="loading" @click="onUnlock">
                      {{ loading ? t("ceremly.paywall.loading") : t("ceremly.paywall.cta", { price: priceLabel }) }}
                      <CerIcon v-if="!loading" name="chevR" :s="14" />
                  </button>
                  <button type="button" class="cer-paywall-later" @click="onClose">{{ t("ceremly.paywall.later") }}</button>
              </div>
          </template>
      </UModal>
  </template>

  <style scoped>
  .cer-paywall { padding: 28px; text-align: center; }
  .cer-paywall-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .cer-paywall-icon { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 12px; background: var(--orange); color: var(--ink); border: 2px solid var(--ink); }
  .cer-paywall-x { background: none; border: none; cursor: pointer; color: var(--ink-500); padding: 4px; }
  .cer-paywall-title { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; margin: 8px 0 6px; }
  .cer-paywall-reason { font-size: 13px; color: var(--ink-700); background: var(--bone-50); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; margin: 0 0 12px; }
  .cer-paywall-sub { font-size: 14px; color: var(--ink-700); line-height: 1.55; margin: 0 0 18px; }
  .cer-paywall-price { display: flex; align-items: baseline; justify-content: center; gap: 8px; margin-bottom: 18px; }
  .cer-paywall-amount { font-size: 52px; font-weight: 800; line-height: 1; letter-spacing: -0.03em; }
  .cer-paywall-once { font-size: 13px; color: var(--ink-500); }
  .cer-paywall-feats { list-style: none; padding: 0; margin: 0 0 22px; display: flex; flex-direction: column; gap: 10px; text-align: left; }
  .cer-paywall-feats li { display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--ink-700); }
  .cer-paywall-check { color: var(--purple); flex-shrink: 0; }
  .cer-paywall-cta { width: 100%; justify-content: center; padding: 14px 16px; }
  .cer-paywall-later { background: none; border: none; cursor: pointer; color: var(--ink-500); font-size: 13px; margin-top: 12px; text-decoration: underline; }
  </style>
  ```
  > Verifica i nomi reali degli icon di `CerIcon` (`sparkle`/`x`/`check`/`chevR`) e delle CSS var (`--orange`/`--ink`/`--purple`/`--bone-50`/`--line`) nel codebase; allinea se differiscono.

- [ ] **Step 2: aggiungi `ceremly.paywall.*`** (title, subtitle, once, feat1-4, cta con `{price}`, loading, later, errorTitle, errorDesc) in IT/EN. NESSUN `@`; "piu" senza apostrofo.

- [ ] **Step 3: verifica JSON + assenza `@`.**
  ```bash
  node -e "const it=require('./i18n/locales/it-IT.json'); const en=require('./i18n/locales/en-US.json'); const a=JSON.stringify(it.ceremly.paywall)+JSON.stringify(en.ceremly.paywall); if(a.includes('@')){console.error('@ TROVATO');process.exit(1)} console.log('JSON OK, no @')"
  ```

- [ ] **Step 4: typecheck + commit.**
  ```bash
  pnpm typecheck 2>&1 | grep -E "CerCelebrationPaywall|CELEBRATION_PRICE_CENTS|unlockEvent" || echo "NESSUN ERRORE"
  git add app/components/ceremly/CerCelebrationPaywall.vue i18n/locales/it-IT.json i18n/locales/en-US.json && git commit -m "feat(paywall): componente CerCelebrationPaywall per sblocco evento"
  ```

---

### Task 5.5 — Aggancio paywall al 402 su `guests.vue`

**Files:**
- Modify: `app/pages/dashboard/events/[id]/guests.vue` (error handler `addGuest`/`submitImport` + template)

**Interfaces:**
- Consumes: `CerCelebrationPaywall` (Task 5.4); `eventId` (già `computed` nella pagina).
- Produces: sul 402 in aggiunta/import ospiti, chiude la modale corrente e apre il paywall con il messaggio del 402 come `reason`.

- [ ] **Step 1: importa il paywall + stato** (`paywallOpen`, `paywallReason`, `openPaywall(reason)`).
- [ ] **Step 2: aggancia il 402 in `addGuest`** (chiudi `addOpen`, `openPaywall(err.data?.statusMessage || ...)`); else → `addError`.
- [ ] **Step 3: aggancia il 402 in `submitImport`** (stesso pattern; chiudi `importOpen`); else → `importSubmitError`.
- [ ] **Step 4: aggiungi il componente al template** `<CerCelebrationPaywall v-model:open="paywallOpen" :event-id="eventId" :reason="paywallReason" />`.
- [ ] **Step 5: typecheck + verifica manuale + commit.**
  ```bash
  pnpm typecheck 2>&1 | grep -E "guests.vue|CerCelebrationPaywall|paywallOpen" || echo "NESSUN ERRORE"
  ```
  Manuale: evento Free con 30 ospiti, aggiungi → si apre il paywall col messaggio 402.
  ```bash
  git add "app/pages/dashboard/events/[id]/guests.vue" && git commit -m "feat(guests): apre paywall Celebrazione sul 402 limite Free"
  ```

---

### Task 5.6 — Reminder: limite client tier-aware + messaggio Atelier (deliverable unico, NO paywall)

**Files:**
- Modify: `app/pages/dashboard/events/[id]/reminders.vue`
- Modify: `i18n/locales/{it-IT,en-US}.json` (chiave `ceremly.event.reminders.limitAtelier`)

> **Deliverable determinato dall'ispezione del code-path reale (NON "se SÌ/se NO").** Verificato in `reminders.vue`: `MAX_REMINDERS = 3` è **hardcoded client-side** (riga 158); `addReminder` (riga 191) ritorna se già a 3; il pulsante "aggiungi" è nascosto a 3 (riga 507) e mostra il messaggio `maxRemindersReached` (riga 515). Il client **non invia mai** una richiesta che generi 402/422 — il blocco è preventivo lato UI. Il reminder **NON è sbloccabile con Celebrazione** (limite 3 anche per Celebrazione; solo Atelier è illimitato). Quindi: **NESSUN paywall**. Il deliverable è (a) rendere il cap client tier-aware via `useSubscription().isAtelier` (Atelier → nessun cap), (b) il messaggio a soglia raggiunta indirizza ad Atelier.

**Interfaces:**
- Consumes: `useSubscription().isAtelier: ComputedRef<boolean>` (Task 5.1).
- Produces: `addReminder` consente >3 se `isAtelier`; il messaggio a 3 reminder (non-Atelier) indirizza ad Atelier.

- [ ] **Step 1: importa `isAtelier` dallo store subscription.** Nello `<script setup>` di `reminders.vue`, accanto agli altri composable:
  ```ts
  const { isAtelier } = useSubscription();
  ```

- [ ] **Step 2: rendi il cap tier-aware.** Sostituisci la costante `const MAX_REMINDERS = 3;` con un computed:
  ```ts
  // -1 = illimitato (Atelier). Free/Celebrazione restano a 3 (anche celebration:
  // i reminder non sono sbloccabili one-time, solo Atelier li rende illimitati).
  const maxReminders = computed(() => (isAtelier.value ? Infinity : 3));
  ```
  Aggiorna `addReminder` (riga ~191):
  ```ts
  function addReminder() {
      if (reminders.value.length >= maxReminders.value) return;
  ```
  e nel template sostituisci entrambi gli usi di `MAX_REMINDERS` con `maxReminders` (il `v-if` del pulsante: `reminders.length < maxReminders`; il `v-else-if` del messaggio: `reminders.length >= maxReminders`).

- [ ] **Step 3: differenzia il messaggio a soglia.** Nel `v-else-if` del messaggio "maxRemindersReached", mostra un testo che indirizza ad Atelier quando NON è Atelier (l'utente Atelier non vede mai il messaggio perché `maxReminders=Infinity`). Sostituisci il contenuto con `ceremly.event.reminders.limitAtelier` (l'utente è per definizione non-Atelier qui).

- [ ] **Step 4: aggiungi la chiave i18n** in IT/EN, dentro `ceremly.event.reminders`:
  - IT: `"limitAtelier": "Il piano attuale include fino a 3 promemoria. Passa ad Atelier per promemoria illimitati."`
  - EN: `"limitAtelier": "Your current plan includes up to 3 reminders. Switch to Atelier for unlimited reminders."`
  NESSUN `@`.

- [ ] **Step 5: verifica JSON + assenza `@` + typecheck.**
  ```bash
  node -e "require('./i18n/locales/it-IT.json'); require('./i18n/locales/en-US.json'); console.log('JSON OK')"
  pnpm typecheck 2>&1 | grep -E "reminders.vue" || echo "NESSUN ERRORE su reminders.vue"
  ```

- [ ] **Step 6: commit.**
  ```bash
  git add "app/pages/dashboard/events/[id]/reminders.vue" i18n/locales/it-IT.json i18n/locales/en-US.json && git commit -m "feat(reminders): cap client tier-aware (Atelier illimitato) + messaggio Atelier"
  ```

---

### Task 5.7 — Coerenza i18n `CerSitePricing.vue` + CTA Celebrazione

**Files:**
- Modify (solo se si differenzia il CTA): `app/components/ceremly/CerSitePricing.vue` (`tierTo`)

**Interfaces:**
- Consumes: `ceremly.home.pricing.{free|celebration|atelier}.*` (già presenti).
- Produces: CTA coerente con lo spec §10 (landing → signup → evento → paywall; NESSUN checkout dalla landing).

- [ ] **Step 1: verifica che le chiavi i18n consumate da `CerSitePricing` esistano** in entrambi i locale (`name`/`sub`/`desc`/`cta` per i 3 tier):
  ```bash
  node -e "const it=require('./i18n/locales/it-IT.json'), en=require('./i18n/locales/en-US.json'); for(const tier of ['free','celebration','atelier']){ for(const [n,loc] of [['it',it],['en',en]]){ const o=loc.ceremly.home.pricing[tier]||{}; const miss=['name','sub','desc','cta'].filter(k=>!(k in o)); if(miss.length) console.log(n,tier,'MANCANTI:',miss.join(',')); } } console.log('check completato')"
  ```
  Atteso: `check completato` senza righe `MANCANTI`.

- [ ] **Step 2: conferma il comportamento del CTA** (`tierTo`): non-attivo → `#lista-attesa`; Atelier ghost → `/contact`; Free/Celebrazione → `/signup`. È coerente con lo spec (la landing non apre checkout; il paywall scatta dentro l'evento). **DELIVERABLE: lasciare il comportamento attuale** (entrambi a `/signup`) — è la lettura corretta dello spec §10. Nessuna modifica al file.

- [ ] **Step 3: nessun commit** se non si modifica il file (è una verifica). Se le chiavi mancavano e le hai aggiunte, committa solo i locale con `chore(pricing): completa chiavi i18n CerSitePricing`.

---

### Task 5.8 — Bonifica residui starter/premium/agency nel frontend + gate di fase

**Files:**
- Modify (eventuale): `i18n/locales/{it-IT,en-US}.json` (rimozione chiavi `plan.{starter,premium,agency}.*` e `subscription.changePlan.*` se orfane)

**Interfaces:**
- Produces: frontend privo di riferimenti al vecchio modello a 3 piani ricorrenti.

- [ ] **Step 1: trova i riferimenti residui nel frontend.**
  ```bash
  grep -rniE "starter|premium|agency|RECOMMENDED_PLAN|billingPeriod|slugToProductId|createCheckoutSession" app/ | grep -vE "\.nuxt|node_modules" | head -40
  ```
  Annota ogni hit; i componenti `app/components/landing/*` boilerplate non referenziati da route possono essere eliminati (verifica con `grep -rn "<NomeComponente" app/pages app/components`).

- [ ] **Step 2: trova le chiavi i18n orfane** `plan.{starter|premium|agency}.*` e `subscription.changePlan.*`; se non referenziate in `app/` dopo i Task 5.2/5.3, rimuovi gli oggetti `plan` e `subscription.changePlan` da entrambi i locale. Mantieni `subscription.{status,actions,paymentMethods,billingHistory,tier,unlockedEvents,toast,sync*,renewalDate,currentPlanLabel}`.

- [ ] **Step 3: verifica integrità JSON.**
  ```bash
  node -e "require('./i18n/locales/it-IT.json'); require('./i18n/locales/en-US.json'); console.log('JSON OK')"
  ```

- [ ] **Step 4: gate typecheck + lint completi.**
  ```bash
  pnpm typecheck && pnpm lint
  ```

- [ ] **Step 5: verifica grep pulita (criterio §15).**
  ```bash
  grep -rniE "starter|premium|agency" app/ | grep -vE "\.nuxt|node_modules|requirements\.md" || echo "FRONTEND PULITO"
  ```
  Atteso: `FRONTEND PULITO` (eccetto eventuali doc storici non-runtime).

- [ ] **Step 6: verifica manuale finale (smoke).** `pnpm dev`: (a) `/pricing` mostra Free/Celebrazione/Atelier senza toggle; (b) `/dashboard/subscription` stato Free + box eventi sbloccati; (c) superare 30 ospiti su evento Free apre il paywall.

- [ ] **Step 7: commit finale di fase.**
  ```bash
  git add i18n/locales/it-IT.json i18n/locales/en-US.json && git commit -m "chore(pricing): rimuove chiavi i18n orfane + gate Fase 5 verde" || echo "Niente da committare"
  ```

---

## Fase 6 — Creazione prodotti Creem & popolamento env (operativo/esterno)

Obiettivo: creare i due prodotti reali su Creem (Celebrazione one-time €39, Atelier recurring €24/mese), scrivere i loro `prod_...` id negli env (dev + prod + staging + Vercel) rimuovendo i 6 vecchi, e verificare end-to-end il flusso secondo i criteri §15. Questa fase è OPERATIVA/ESTERNA: dipende da una dashboard/API Creem reale e da un ambiente webhook-raggiungibile. Onestà sui limiti: il metodo primario è l'API REST documentata; CLI e carta-test sono marcati "DA VERIFICARE al momento dell'esecuzione".

> **PREREQUISITI:**
> 1. API key test Creem (`creem_test_...`) da `https://creem.io/dashboard/api-keys` (Test mode). Senza, nessun Task è eseguibile.
> 2. Tutte le fasi di codice (0-5) complete e mergiate. La struttura env (`runtimeConfig.ts` rinominato, `.env.example` aggiornato) è già fatta in Fase 1; qui si scrivono i **valori** reali.
> 3. **File env reali (verificati nel repo):** `.env` (dev), `.env.staging` (staging), `.env.prod` (prod). NON esiste `.env.production`. Git tracking: solo `.env.example` è committato; `.env`/`.env.prod`/`.env.staging` sono gitignored. I valori `NUXT_*` su Vercel sono **Sensitive**: `vercel env pull` li scarica vuoti → source of truth = file locali.
> 4. **Webhook in locale:** il webhook Creem test NON raggiunge `localhost`. Per le verifiche e2e usare **staging deployato su Vercel** (`.env.staging`) o un tunnel pubblico (`cloudflared tunnel --url http://localhost:3000` / `ngrok http 3000`).

---

### Task 6.1 — Creare il prodotto **Celebrazione** (one-time €39) in test mode

**Files:** nessuno (chiamata API esterna; il `prod_...` id si annota per Task 6.3).

**Interfaces:**
- Consumes: API key test `creem_test_...`.
- Produces: `prod_<...>` id Celebrazione (campo `id` top-level della risposta).

Valori (spec §8.1): `name='Celebrazione'`, `price=3900`, `currency='EUR'`, `billing_type='one-time'`, `tax_category='saas'`, `tax_mode='inclusive'` (consumer B2C, €39 già comprensivo).

- [ ] **Step 1: esporta la API key test nella shell** (sostituisci con la chiave reale; vive solo per i comandi `! ` della stessa sessione).
  ```bash
  ! export CREEM_TEST_KEY='creem_test_xxxxxxxxxxxxxxxx'
  ! echo "${CREEM_TEST_KEY:0:11}"   # atteso: creem_test_
  ```

- [ ] **Step 2 (METODO PRIMARIO — API REST documentata): crea il prodotto via `curl`.**
  ```bash
  ! curl -sS -X POST https://test-api.creem.io/v1/products \
      -H "x-api-key: ${CREEM_TEST_KEY}" \
      -H "Content-Type: application/json" \
      -d '{
        "name": "Celebrazione",
        "description": "Sblocca un singolo evento: fino a 250 invitati, tutti i modelli con brand colors, inviti WhatsApp/email personalizzati, menu/allergie/plus-one, promemoria automatici, export catering. Una tantum, per evento.",
        "price": 3900,
        "currency": "EUR",
        "billing_type": "one-time",
        "tax_category": "saas",
        "tax_mode": "inclusive"
      }' | jq .
  ```
  Atteso: JSON con `"id": "prod_..."`, `"price": 3900`, `"billing_type": "one-time"`. L'header `Content-Type: application/json` è obbligatorio.

- [ ] **Step 3 (VARIANTE CLI — DA VERIFICARE, NON garantita): se il CLI `creem` esiste ed è autenticato.** L'esistenza del CLI e i nomi-flag NON sono verificabili da qui — confermali con `! creem products create --help` PRIMA di affidartici. Se il CLI non c'è, usa il metodo primario (Step 2).
  ```bash
  ! creem products create --name "Celebrazione" --price 3900 --currency EUR \
      --billing-type one-time --tax-category saas --tax-mode inclusive
  ```

- [ ] **Step 4: annota il `prod_` id.** Dall'output, copia il campo top-level `id` (inizia con `prod_`) come **CELEBRATION_PROD_ID** (serve in Task 6.3). NON ricreare il prodotto se lo Step 2 è già riuscito.

- [ ] **Step 5 (troubleshooting 4xx): NON indovinare gli enum.** Su errore su `billing_type`/`tax_category`/`tax_mode`, consulta `https://docs.creem.io` per la spelling esatta degli enum di `POST /v1/products`, correggi e ripeti. Verifica di essere in test mode (chiave `creem_test_`, host `test-api.creem.io`).

---

### Task 6.2 — Creare il prodotto **Atelier** (recurring €24/mese) in test mode

**Files:** nessuno (chiamata API esterna; `prod_...` id per Task 6.3).

**Interfaces:**
- Consumes: API key test `creem_test_...`.
- Produces: `prod_<...>` id Atelier.

Valori (spec §8.1): `name='Atelier'`, `price=2400`, `currency='EUR'`, `billing_type='recurring'`, `billing_period='every-month'`, `tax_category='saas'`, `tax_mode='inclusive'`.

> **Decisione `tax_mode` (era "da valutare" nello spec §8.1):** `inclusive`, per coerenza con Celebrazione e con la landing (€24/mese come prezzo finale, senza "+ IVA"). Decisione tracciata, non rinviata.

- [ ] **Step 1: verifica che la chiave test sia in shell.** `! echo "${CREEM_TEST_KEY:0:11}"` → `creem_test_`. Se vuoto, ri-esporta (Task 6.1 Step 1).

- [ ] **Step 2 (METODO PRIMARIO — API REST): crea il prodotto via `curl`.**
  ```bash
  ! curl -sS -X POST https://test-api.creem.io/v1/products \
      -H "x-api-key: ${CREEM_TEST_KEY}" \
      -H "Content-Type: application/json" \
      -d '{
        "name": "Atelier",
        "description": "Abbonamento per planner: invitati ed eventi illimitati, workspace white-label con logo, domini personalizzati, API e integrazioni catering, account team, promemoria illimitati e supporto prioritario.",
        "price": 2400,
        "currency": "EUR",
        "billing_type": "recurring",
        "billing_period": "every-month",
        "tax_category": "saas",
        "tax_mode": "inclusive"
      }' | jq .
  ```
  Atteso: JSON con `"id": "prod_..."`, `"price": 2400`, `"billing_type": "recurring"`, `"billing_period": "every-month"`.
  > Nota: gli enum del prodotto usano i trattini (`one-time`, `every-month`); è DIVERSO dal valore `order.type === 'onetime'` (senza trattino) controllato nel webhook di `server/utils/creem.ts` — NON uniformarli.

- [ ] **Step 3 (VARIANTE CLI — DA VERIFICARE, NON garantita):** confermare i flag con `! creem products create --help` prima dell'uso; se assente, usare lo Step 2.
  ```bash
  ! creem products create --name "Atelier" --price 2400 --currency EUR \
      --billing-type recurring --billing-period every-month --tax-category saas --tax-mode inclusive
  ```

- [ ] **Step 4: annota il `prod_` id** come **ATELIER_PROD_ID**. Non ricreare se già esiste.

- [ ] **Step 5 (troubleshooting):** come Task 6.1 Step 5 (in particolare l'enum `billing_period`).

---

### Task 6.3 — Scrivere i due `prod_` id negli env e rimuovere i 6 vecchi

**Files:**
- Modify: `.env` (dev — gitignored, no commit)
- Modify: `.env.prod` (source of truth prod — gitignored, no commit)
- Modify: `.env.staging` (se l'e2e usa staging — gitignored, no commit)
- Modify (manuale, dashboard Vercel): env `Sensitive` del progetto

**Interfaces:**
- Consumes: **CELEBRATION_PROD_ID** (6.1), **ATELIER_PROD_ID** (6.2).
- Produces: `NUXT_CREEM_PRODUCT_ID_CELEBRATION`/`NUXT_CREEM_PRODUCT_ID_ATELIER` popolati ovunque; i 6 vecchi rimossi. (`runtimeConfig.ts` NON si tocca — già fatto in Fase 1.)

- [ ] **Step 1: aggiorna `.env` (dev)** con i valori reali (editor, non `echo >>`). Sostituisci i placeholder `prod_celebration_id`/`prod_atelier_id` (Fase 1) con **CELEBRATION_PROD_ID**/**ATELIER_PROD_ID**.

- [ ] **Step 2: verifica `.env`** (nessun vecchio, presenti i nuovi).
  ```bash
  ! grep -nE 'STARTER|PREMIUM|AGENCY' /Users/airowlgasga/coding/project/ceremly-v2/.env || echo "OK nessun vecchio"
  ! grep -nE 'CELEBRATION|ATELIER' /Users/airowlgasga/coding/project/ceremly-v2/.env
  ```

- [ ] **Step 3: aggiorna `.env.prod`** (source of truth prod). Rimuovi le 6 vecchie, aggiungi le 2 nuove (id test finché non si creano i prodotti **live mode** — vedi nota go-live in 6.7).
  ```bash
  ! grep -nE 'CELEBRATION|ATELIER|STARTER|PREMIUM|AGENCY' /Users/airowlgasga/coding/project/ceremly-v2/.env.prod
  ```
  Atteso: solo le 2 righe `CELEBRATION`/`ATELIER`.

- [ ] **Step 4: aggiorna `.env.staging`** (se l'e2e usa staging) con le 2 chiavi (valori test) e rimuovi le 6 vecchie.

- [ ] **Step 5: sincronizza Vercel (manuale, Sensitive).** Dalla dashboard (`Project → Settings → Environment Variables`) o via CLI da stdin per ogni ambiente (`production`, e `preview` se staging):
  ```bash
  ! printf '%s' 'CELEBRATION_PROD_ID' | vercel env add NUXT_CREEM_PRODUCT_ID_CELEBRATION production
  ! printf '%s' 'ATELIER_PROD_ID'     | vercel env add NUXT_CREEM_PRODUCT_ID_ATELIER production
  ! for k in STARTER_MONTH STARTER_YEAR PREMIUM_MONTH PREMIUM_YEAR AGENCY_MONTH AGENCY_YEAR; do vercel env rm "NUXT_CREEM_PRODUCT_ID_$k" production -y; done
  ! vercel env ls production | grep -E 'CREEM_PRODUCT_ID'
  ```
  Atteso: solo `CELEBRATION`/`ATELIER` (valori nascosti perché Sensitive).

- [ ] **Step 6: re-deploy** dell'ambiente di verifica (gli env Sensitive si applicano al prossimo deploy).
  ```bash
  ! vercel deploy   # o re-deploy dell'ultimo dalla dashboard
  ```

---

### Task 6.4 — Verifica e2e: paywall ospiti → checkout → webhook → sblocco (§15)

> Ambiente: **staging Vercel** (`.env.staging`) o `localhost` via tunnel. Il webhook Creem test deve raggiungere `<BASE_URL>/api/auth/creem/webhook`.

**Files:** nessuno (verifica funzionale).

- [ ] **Step 1: configura il webhook test su Creem.** Dashboard Creem (test) → Webhooks → endpoint `https://<BASE_URL>/api/auth/creem/webhook`; copia il `whsec_...` in `NUXT_CREEM_WEBHOOK_SECRET` dell'ambiente di verifica (poi re-deploy). Invia un test event e verifica `2xx`.

- [ ] **Step 2: crea un evento Free e portalo al limite ospiti.** Aggiungi ospiti fino a superare 30. Atteso: al 31° l'API risponde 402 e l'UI mostra il paywall Celebrazione.

- [ ] **Step 3: avvia il checkout dal paywall.** Click sblocco → `POST /api/events/<id>/unlock` → risposta `{ "url": "https://..." }` (dominio Creem test) e redirect del browser.

- [ ] **Step 4: paga con la carta di test Creem.** **DA VERIFICARE nella doc/dashboard Creem al momento dell'esecuzione** il numero della carta test del provider (il classico `4242 4242 4242 4242` è una carta Stripe-style — NON assumerlo per Creem; conferma in `https://docs.creem.io` o nel checkout test). Atteso: redirect al `successUrl` `<BASE_URL>/dashboard/events/<id>?unlocked=true`.

- [ ] **Step 5: verifica webhook + sblocco DB.** Dashboard Creem → `checkout.completed` consegnato `2xx`. Poi:
  ```sql
  SELECT id, tier, unlocked_at, creem_order_id FROM events WHERE id = '<id>';
  ```
  Atteso: `tier='celebration'`, `unlocked_at` NON null, `creem_order_id` valorizzato.

- [ ] **Step 6: verifica il limite salito a 250.** Aggiungi ospiti oltre i 30: accettati fino a 250 senza 402.

---

### Task 6.5 — Verifica e2e: refund test → re-lock (§15)

> Stesso ambiente (webhook raggiungibile).

**Files:** nessuno.

- [ ] **Step 1: rimborsa l'ordine test.** Dashboard Creem (test) → Orders → Refund completo dell'ordine del Task 6.4. Creem invia `refund.created`.

- [ ] **Step 2: verifica consegna `refund.created` (`2xx`).** Se l'evento non è abilitato sull'endpoint, abilitalo e riemetti il refund.

- [ ] **Step 3: verifica il re-lock in DB.**
  ```sql
  SELECT id, tier, unlocked_at, creem_order_id FROM events WHERE id = '<id>';
  ```
  Atteso: `tier='free'`, `unlocked_at=NULL`, `creem_order_id=NULL`.

- [ ] **Step 4: verifica il re-lock lato enforcement.** Aggiungi un ospite oltre i 30 → di nuovo 402 + paywall.

---

### Task 6.6 — Verifica e2e: subscription Atelier → illimitato per l'org (§15)

> Atelier è sales-led (nessun checkout self-serve): genera manualmente un payment link per il prodotto Atelier. Stesso ambiente.

**Files:** nessuno.

- [ ] **Step 1: genera un checkout Atelier per l'owner dell'org** (payment link dalla dashboard Creem test). Loggati come owner e paga con la carta test (vedi caveat carta in Task 6.4 Step 4). Atteso: subscription Atelier attiva.

- [ ] **Step 2: verifica che `persistSubscriptions` abbia scritto la subscription.**
  ```sql
  SELECT reference_id, product_id, status FROM creem_subscription WHERE product_id = '<ATELIER_PROD_ID>';
  ```
  Atteso: una riga `status` attivo, `reference_id` = userId dell'owner (NON l'organizationId). Se manca, verifica la consegna `2xx` del webhook `subscription.*`.

- [ ] **Step 3: verifica i limiti illimitati su un evento dell'org** (anche `tier='free'`): oltre 250 ospiti, più di un evento attivo, oltre 3 reminder → nessun 402/422. `getEventLimits` risolve `atelier` perché `isOrgAtelier(organizationId)===true` ha priorità sul `tier` del singolo evento.

- [ ] **Step 4: verifica l'esclusione dall'auto-cleanup** (collegamento Fase 4): conferma che gli eventi di un'org Atelier sono esclusi (verifica funzionale piena nei test della Fase 4; qui basta confermare `isOrgAtelier=true`).

---

### Task 6.7 — Sanity finale: nessun residuo, build pulita

**Files:** nessuno (read-only) salvo eventuale `.env.example`.

- [ ] **Step 1: nessun riferimento starter/premium/agency nel codice + env versionabili.**
  ```bash
  ! grep -rniE 'starter|premium|agency' \
      /Users/airowlgasga/coding/project/ceremly-v2/server \
      /Users/airowlgasga/coding/project/ceremly-v2/shared \
      /Users/airowlgasga/coding/project/ceremly-v2/app \
      /Users/airowlgasga/coding/project/ceremly-v2/.env.example \
      --include='*.ts' --include='*.vue' --include='.env*' 2>/dev/null | grep -viE "PRICING_PLANS|getPlanLimits|PlanLimits|canCreateOrganization|canAddTeamMember|organization.service|admin/users|seed/verify|usePricing|userStore" || echo "OK: nessun residuo nel nuovo codice"
  ```
  > Le occorrenze del System B2B legacy (`PRICING_PLANS`, gate org/team) restano per Decisione di scope (bonifica fuori scope). Il criterio §15 si applica al nuovo codice pricing-tier + frontend.

- [ ] **Step 2: typecheck e lint puliti (§15).**
  ```bash
  ! pnpm typecheck && pnpm lint
  ```
  Atteso: 0 errori (l'errore pre-esistente `sharp-wasm32` durante il build Nitro è noto e non blocca typecheck/lint).

- [ ] **Step 3: checklist §15.** (1) 2 prodotti Creem test con id negli env ✓ (6.1-6.3); (2) Free 30→402→paywall→checkout→webhook→`celebration`/250 ospiti ✓ (6.4); (3) refund→`free` ✓ (6.5); (4) Atelier→illimitato ✓ (6.6); (5) cleanup cron: evento concluso+inattivo+warned eliminato, evento futuro mai eliminato ✓ (Fase 4, test deterministico Task 4.7); (6) typecheck/lint puliti, nessun residuo nel nuovo codice ✓.

- [ ] **Step 4: go-live (nota).** Prima del lancio in produzione reale: ricreare i 2 prodotti in **live mode** dalla dashboard Creem e sostituire i `prod_` id test con quelli live in `.env.prod` + Vercel `production`. Gli env (`.env`/`.env.prod`/`.env.staging`) sono gitignored: non committarli. Se è stato toccato un file tracciato (es. `.env.example` non già allineato), committa solo quello:
  ```bash
  ! git add .env.example && git commit -m "chore(creem): align .env.example to celebration/atelier product ids" || echo "Niente da committare"
  ```

---

## Riepilogo fasi

- **Fase 0** — Setup infra di test (vitest config unica, setup dotenv, script `test`).
- **Fase 1** — Schema (`events` +4 colonne), costanti tier (ADD-only), env Creem, `getPlanFromProductId → CeremlyTier|null` (proprietaria dei 3 file condivisi).
- **Fase 2** — Risoluzione tier (`eventAccess.service`: `isOrgAtelier` via `getPlanFromProductId`) & enforcement ospiti/eventi/reminder (consume-only dalla Fase 1).
- **Fase 3** — Checkout Celebrazione server-side, webhook sblocco/re-lock, route `unlock`.
- **Fase 4** — Cron cleanup conclusi+inattivi + test DETERMINISTICO DB-backed (evento futuro mai eliminato).
- **Fase 5** — UI: paywall per-evento, pagina subscription, pricing 3-tier (Task reminder con deliverable unico, no paywall).
- **Fase 6** — Prodotti Creem (API REST primaria; CLI/carta-test "da verificare") + env operativo + verifiche e2e §15.
