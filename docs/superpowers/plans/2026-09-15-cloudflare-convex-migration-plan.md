# Cloudflare + Convex Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrare Ceremly da Vercel, Neon, Drizzle, QStash e Redis applicativo a Cloudflare Workers e Convex, preservando identità, credenziali, tenant isolation, billing Creem e oggetti R2 con un cutover blue-green verificabile.

**Architecture:** Nuxt resta l'unico frontend e gira su Cloudflare Workers; espone solo UI, asset, policy edge e il proxy trasparente `/api/auth/*`. Convex diventa l'unico backend applicativo per dati, autorizzazione, billing state, scheduler, cron e action esterne. La migrazione procede per gate: nessun dato reale entra in Convex prima dei dieci spike, nessuna scrittura di produzione passa a Convex prima del rehearsal, e nessun componente legacy viene rimosso prima della chiusura del periodo di osservazione.

**Tech Stack:** Nuxt 4.2.x, Vue 3.5.x, Cloudflare Workers, Wrangler `4.131.2`, Convex `1.45.0`, `convex-test@0.0.58`, `convex-vue@0.1.5`, Better Auth `1.6.15`, `@convex-dev/better-auth@0.12.5`, `@creem_io/convex@0.4.1`, `creem@1.9.0`, Cloudflare R2/Images binding, Resend, Vitest e Playwright.

**Spec:** `docs/superpowers/specs/2026-09-11-cloudflare-convex-migration-design.md`

## Stato verificato — 2026-09-18

Questo piano e gli artefatti sotto indicati sono presenti solo su `main` (non su `dev`).

- **Task 1:** implementato; il contratto versioni è presente e passa nella suite locale `pnpm test:migration`.
- **Task 2 / G01:** completato e `PASS`: build e preview Nuxt/Cloudflare sono state provate localmente; `wrangler.jsonc` resta una configurazione staging con binding D1 placeholder, non un deploy Cloudflare confermato.
- **Task 3 / G02:** completato e `PASS` (2026-09-18) contro il dev deployment di staging `airowl/ceremly-staging` → `wary-spaniel-466` (eu-west-1). Tutti i casi dello Step 4 sono verificati live: query pubblica SSR con `suspense()`, opt-out CSR, mutation tipizzata, realtime dopo una write, query autenticata (provider `customJwt` solo-gate), anonimo, refresh forzato singolo e sopravvivenza a un failure transiente della sessione. Evidenza: `docs/migration/evidence/G02-convex-vue.md`.
- **Task 4 / G03–G05:** completato (2026-09-18) su staging. Better Auth vive nel componente Convex `betterAuth`, il proxy same-origin `/api/auth/*` è implementato dietro `NUXT_AUTH_BACKEND` (default `legacy`, così la produzione Vercel non si sposta) e l'import idempotente delle credenziali è verificato live: `G03=PASS`, `G05=PASS`, `G04=NOT_RUN` (riga OAuth Google bloccata). Evidenza: `docs/migration/evidence/G03-G05-auth.md`.
- **Task 5 / G06:** completato (2026-09-21) su staging. Organizzazioni, membership e inviti sono tabelle applicative Convex con RBAC risolto server-side; 36 casi `convex-test` ermetici (isolamento cross-tenant, escalation, furto/scadenza/replay dell'invito, accept concorrenti, audit su ogni write) più un sign-up live che ha materializzato `appUsers` + organizzazione personale + membership owner dal trigger `user.create`. Evidenza: `docs/migration/evidence/G06-org-rbac.md`.
- **Task 6 / G07:** completato (2026-09-21) su staging, Creem **test mode**. Il billing è org-scoped — l'entity è sempre l'organizzazione attiva risolta server-side, nessun `entityId` dal client, metadata riservati non falsificabili. 22 casi `convex-test` ermetici (RBAC prima del provider, ledger one-row-per-event, replay no-op, refund che ri-locka e conserva l'order id, completion tardiva rifiutata) più 7 casi live (checkout test-mode reale, completion firmata che sblocca una volta sola, redelivery che non scrive, refund, portal, firma errata → `403`). Evidenza: `docs/migration/evidence/G07-creem.md`.
- **Task 7 / G08:** completato (2026-09-21). File e varianti immagine sono dominio Convex dietro un bridge firmato HMAC; il bucket, le chiavi R2 e il layout `{basePath}/thumb.webp` / `web.webp` restano invariati. 32 casi ermetici (ordine autorizzazione→validazione→provider, magic bytes prima di `ready`, dedup tenant-scoped, macchina a stati con due varianti max, cinque tentativi e `failed` terminale, contratto di firma tra Convex e Worker) più una run live del Worker costruito su `wrangler dev`: presign firmato → URL R2 reale, richieste non firmate/stale/tampered/replay rifiutate, e un PNG da 51 kB trasformato in `thumb.webp` (4,7 kB) e `web.webp` (19,2 kB). Evidenza: `docs/migration/evidence/G08-media.md`.
- **Task 8 / G09:** completato (2026-09-21). Matrice eseguibile in `docs/migration/protection-matrix.md` (colonna *dichiarata* vs *osservata*), limiter Convex come unica porta d'ingresso per il budget con check e incremento nella stessa mutation, chiavi salvate solo come digest. 36 casi di gate più prove live su Worker e staging. Il gate ha trovato tre difetti reali (Assets layer di Workers senza header di sicurezza né cache immutabile → `public/_headers`; `/api/auth/*` come proxy trasparente; regole brute-force legacy perse nella config Convex di Better Auth → `storage: "database"`). Evidenza: `docs/migration/evidence/G09-protections.md`.
- **Task 9 / G10:** parzialmente completato (2026-09-21) — modello e misure fatti, gate **`NOT_RUN`** perché gli alert di budget non sono configurabili da questo repository. `docs/migration/cost-model.md` contiene la formula, le assunzioni con provenienza, i prezzi datati e il confronto a 20/50/100/1.000 planner; `scripts/migration/load-model.ts` è puro e coperto da 17 casi, `scripts/migration/load-runner.ts` misura la fan-out reattiva sul deployment di staging (esattamente una ri-esecuzione per subscriber effettivo a 1/5/20 client, zero per una scrittura che non cambia il risultato).
- **Task 10–18:** non avviati. Runtime, dati applicativi di dominio e billing restano su Neon/Drizzle; la configurazione locale usa `NUXT_NITRO_PRESET=node-server`.

Il checkpoint hard dello Step 5 del Task 9 ha dato **8**, non 10: `G04` (OAuth Google) e `G10` (alert di budget) sono `NOT_RUN` per due accessi esterni che questo ambiente non ha, e per la regola del piano l'esecuzione si è **fermata** lì — il Task 10 non è stato iniziato. Entrambi i gate sono documentati nel ledger con la stessa disciplina (non eseguiti, non falliti, requisiti invariati) e si chiudono con un Google client di staging e un accesso alla dashboard; le quattro soglie di alert sono tabulate in `docs/migration/cost-model.md`.

## Global Constraints

- Deploy target: Cloudflare Workers con preset Nitro `cloudflare`; Vercel resta disponibile solo come ambiente legacy blue-green fino alla fine dell'osservazione.
- Convex è l'unico backend target per dati applicativi, autorizzazione, job, cron e billing state.
- Non introdurre doppie scritture Neon/Convex in produzione.
- R2 mantiene bucket, oggetti e chiavi esistenti; si migrano solo metadata e riferimenti.
- Better Auth resta l'identity provider tramite `@convex-dev/better-auth@0.12.5`; non usare il plugin Organization.
- Bloccare `better-auth@1.6.15`: il peer range del componente `0.12.5` è `>=1.6.11 <1.7.0`.
- Bloccare `@creem_io/convex@0.4.1`, `convex-vue@0.1.5`, `convex@1.45.0`, `convex-test@0.0.58`, `creem@1.9.0` e `wrangler@4.131.2` senza caret o tilde.
- Organizzazioni, membership, inviti, ruolo globale `superAdmin` e organizzazione attiva sono dominio applicativo Convex.
- Ogni funzione tenant-scoped risolve identità e membership server-side; il browser non è mai authority per `organizationId`, ruolo, piano o billing entity.
- Le funzioni pubbliche Convex sono minimali; side effect, import e manutenzione usano funzioni `internal*`.
- Ogni write applicativa e amministrativa produce un record di audit.
- Sessioni e verification token legacy non vengono importati; password, account Google e segreti/codici 2FA devono essere preservati o il gate blocca il cutover.
- I payload schedulati contengono solo ID; ogni job è idempotente.
- Le action esterne non contano su retry impliciti: stato, backoff, massimo tentativi e stato terminale sono persistiti.
- Nessun segreto Creem, Resend, R2 o Convex viene esposto al browser.
- Delta import + riconciliazione deve completare entro 15 minuti; maintenance completa entro 30 minuti.
- Push remoto sempre manuale.

## Sequenza e gate

```text
Baseline
  -> Gate G01-G10 (staging, tutti PASS)
  -> Backend Convex completo
  -> Frontend su Convex
  -> Rehearsal dati ed E2E
  -> GO/NO-GO firmato
  -> Cutover read-only
  -> Osservazione
  -> Rimozione legacy
```

La fase successiva non parte se il gate precedente non è `PASS`. Un gate fallito resta `FAIL` con evidenza e blocca la migrazione; non si cambia requisito per farlo passare.

## File map target

| Area | File creati/modificati | Responsabilità |
| --- | --- | --- |
| Gate | `docs/migration/gates.md`, `docs/migration/protection-matrix.md`, `docs/migration/cost-model.md` | Stato, evidenze e go/no-go |
| Cloudflare | `wrangler.jsonc`, `nuxt.config.ts`, `package.json`, `.env.example`, `server/types/cloudflare.d.ts` | Build Worker, binding, secret split e preview |
| Convex base | `convex/convex.config.ts`, `convex/schema.ts`, `convex/auth.config.ts`, `convex/http.ts`, `convex/test.setup.ts` | Componenti, schema, HTTP router e harness |
| Auth | `convex/auth.ts`, `convex/lib/identity.ts`, `app/lib/auth-client.ts`, `server/api/auth/[...all].ts` | Better Auth, token Convex e proxy same-origin |
| Tenant/RBAC | `convex/organizations.ts`, `convex/lib/authorization.ts`, `convex/lib/audit.ts` | Organizzazione attiva, membership, ruoli e audit |
| Dominio | `convex/events.ts`, `convex/guests.ts`, `convex/rsvp.ts`, `convex/reminders.ts`, `convex/projects.ts`, `convex/profile.ts`, `convex/publicForms.ts`, `convex/dataExports.ts`, `convex/siteSettings.ts` | Query/mutation Ceremly org-scoped e flussi ausiliari |
| Billing | `convex/billing.ts`, `convex/billing.test.ts` | Creem org-scoped, checkout, portal e webhook |
| File | `convex/files.ts`, `convex/media.ts`, `convex/media.test.ts` | Metadata R2, URL firmati e pipeline varianti |
| Email/job | `convex/email.ts`, `convex/emailTemplates/**`, `convex/jobs.ts`, `convex/crons.ts`, `convex/jobs.test.ts` | Resend, template, retry, cron e DLQ |
| Operazioni | `convex/admin.ts`, `app/pages/admin/**`, `app/layouts/admin.vue` | Gestionale interno e retry manuali |
| Migrazione | `scripts/migration/*.ts`, `test/migration/*.test.ts`, `docs/migration/rehearsal.md`, `docs/migration/cutover.md`, `docs/migration/rollback.md` | Export cifrato, import, reconcile e runbook |
| Client | `app/plugins/convex.ts`, `app/composables/useConvexResource.ts` e composable dominio esistenti | Query/mutation/realtime senza CRUD Nuxt |

## Interfacce condivise

Questi nomi sono vincolanti per evitare drift tra task:

```ts
export type GlobalRole = "user" | "superAdmin";
export type OrganizationRole = "owner" | "admin" | "member";
export type JobStatus = "pending" | "running" | "retrying" | "succeeded" | "dead";
export type MigrationGateStatus = "NOT_RUN" | "PASS" | "FAIL";

export interface AuthzContext {
  authUserId: string;
  appUserId: Id<"appUsers">;
  organizationId: Id<"organizations">;
  role: OrganizationRole;
}

export interface MigrationBatch<T> {
  version: "2026-09-15";
  table: string;
  watermark: string;
  batchIndex: number;
  records: T[];
  sha256: string;
}

export interface ReconciliationResult {
  table: string;
  sourceCount: number;
  targetCount: number;
  sourceChecksum: string;
  targetChecksum: string;
  mismatches: string[];
}
```

---

### Task 1: Baseline, version lock e gate ledger

**Files:**
- Create: `docs/migration/gates.md`
- Create: `test/migration/version-contract.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: versioni approvate nella spec e peer range npm verificati il 2026-09-15.
- Produces: script `test:migration`, `typecheck:convex`, `dev:convex`; tabella gate `G01`-`G10` con stato iniziale `NOT_RUN`.

- [x] **Step 1: Scrivere il test del contratto versioni**

```ts
import { describe, expect, it } from "vitest";
import pkg from "../../package.json";

describe("Cloudflare + Convex version contract", () => {
  it("pins every pre-1.0 or runtime-sensitive dependency", () => {
    expect(pkg.dependencies).toMatchObject({
      convex: "1.45.0",
      "convex-vue": "0.1.5",
      "better-auth": "1.6.15",
      "@convex-dev/better-auth": "0.12.5",
      "@creem_io/convex": "0.4.1",
      creem: "1.9.0",
    });
    expect(pkg.devDependencies).toMatchObject({
      "convex-test": "0.0.58",
      wrangler: "4.131.2",
    });
  });
});
```

- [ ] **Step 2: Eseguire il test e osservare il fallimento**

Run: `pnpm vitest run test/migration/version-contract.test.ts`

Expected: FAIL perché le dipendenze Convex non esistono e Better Auth/Wrangler non sono pin esatti.

- [x] **Step 3: Installare le versioni esatte e aggiungere gli script**

Run:

```bash
pnpm add -E convex@1.45.0 convex-vue@0.1.5 better-auth@1.6.15 @convex-dev/better-auth@0.12.5 @creem_io/convex@0.4.1 creem@1.9.0
pnpm add -DE convex-test@0.0.58 wrangler@4.131.2
```

Aggiungere queste tre chiavi a `scripts` senza sostituire gli script esistenti:

```json
{
  "scripts": {
    "dev:convex": "convex dev",
    "typecheck:convex": "convex codegen && tsc --noEmit -p convex/tsconfig.json",
    "test:migration": "vitest run test/migration convex/**/*.test.ts"
  }
}
```

- [x] **Step 4: Creare il ledger dei gate**

`docs/migration/gates.md` deve contenere una riga per `G01`-`G10`, rispettivamente: Cloudflare/Nuxt, Vue binding, password, Google, 2FA, org/RBAC, Creem, media, protezioni, costi. Colonne obbligatorie: `Gate`, `Status`, `Command`, `Evidence`, `Approved by`, `Approved at`; lo stato iniziale è `NOT_RUN`, gli ultimi due campi sono `—`.

- [ ] **Step 5: Verificare installazione e baseline**

Run: `pnpm install --frozen-lockfile && pnpm vitest run test/migration/version-contract.test.ts && pnpm typecheck`

Expected: tutti PASS.

- [x] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml test/migration/version-contract.test.ts docs/migration/gates.md
git commit -m "chore(migration): pin Cloudflare and Convex stack"
```

### Task 2: Spike G01 — Nuxt su Cloudflare Workers

**Files:**
- Create: `wrangler.jsonc`
- Create: `server/types/cloudflare.d.ts`
- Create: `test/migration/cloudflare-config.test.ts`
- Modify: `nuxt.config.ts`
- Modify: `.env.example`
- Modify: `.gitignore`
- Modify: `package.json`

**Interfaces:**
- Consumes: `NUXT_NITRO_PRESET` esistente.
- Produces: `pnpm build:cloudflare`, `pnpm preview:cloudflare`, Worker entry `.output/server/index.mjs`, binding `CEREMLY_R2` e `IMAGES`.

- [x] **Step 1: Scrivere il test della configurazione Worker**

```ts
import { expect, it } from "vitest";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));

it("deploys Nuxt output with required Cloudflare bindings", () => {
  expect(config.main).toBe(".output/server/index.mjs");
  expect(config.compatibility_flags).toContain("nodejs_compat");
  expect(config.assets.directory).toBe(".output/public");
  expect(config.r2_buckets[0].binding).toBe("CEREMLY_R2");
  expect(config.images.binding).toBe("IMAGES");
  expect(config.observability.enabled).toBe(true);
});
```

- [x] **Step 2: Eseguire il test rosso**

Run: `pnpm vitest run test/migration/cloudflare-config.test.ts`

Expected: FAIL perché `wrangler.jsonc` non esiste.

- [x] **Step 3: Aggiungere configurazione e script Cloudflare**

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

Script esatti:

```json
{
  "build:cloudflare": "NUXT_NITRO_PRESET=cloudflare nuxt build",
  "preview:cloudflare": "pnpm build:cloudflare && wrangler dev",
  "deploy:cloudflare:staging": "pnpm build:cloudflare && wrangler deploy --env staging"
}
```

- [x] **Step 4: Rendere il preset esplicito senza rompere il blue-green**

Mantenere `process.env.NUXT_NITRO_PRESET || "vercel"` durante spike e rehearsal. Il comando Cloudflare imposta `cloudflare`; il default passa a `cloudflare` solo nel Task 17, dopo il go/no-go.

Aggiungere `.wrangler/` a `.gitignore`: gli output di dry-run sono evidenze locali rigenerabili e non devono entrare nei commit.

- [x] **Step 5: Verificare build, SSR e sicurezza in locale Worker**

Run: `pnpm build:cloudflare && pnpm wrangler deploy --dry-run --outdir .wrangler/dry-run`

Expected: build riuscita, entry Worker presente, nessun import runtime di Neon/Sharp nei chunk raggiungibili dalle route target. Avviare `pnpm preview:cloudflare` e verificare `/`, `/blogs`, `/maintenance`, CSP, HSTS, `nosniff`, fake server header e bot trap.

- [x] **Step 6: Registrare G01**

Salvare log build e checklist in `docs/migration/evidence/G01-cloudflare.md`; impostare `G01=PASS` solo se SSR, `@nuxt/content`, cookie e header corrispondono a produzione.

- [x] **Step 7: Commit**

```bash
git add wrangler.jsonc server/types/cloudflare.d.ts test/migration/cloudflare-config.test.ts nuxt.config.ts .env.example .gitignore package.json docs/migration
git commit -m "feat(migration): prove Nuxt Cloudflare deployment"
```

### Task 3: Spike G02 — Convex base e binding Vue autenticabile

**Files:**
- Create: `convex/convex.config.ts`
- Create: `convex/schema.ts`
- Create: `convex/health.ts`
- Create: `convex/test.setup.ts`
- Create: `convex/tsconfig.json`
- Create: `app/plugins/convex.ts`
- Create: `app/composables/useConvexResource.ts`
- Create: `test/migration/convex-vue-spike.test.ts`
- Modify: `nuxt.config.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `NUXT_PUBLIC_CONVEX_URL`, `NUXT_PUBLIC_CONVEX_SITE_URL`.
- Produces: `api.health.ping`, typed `useConvexResource(query, args)` e un `ConvexClient` a cui viene collegato `setAuth(fetchToken)`.

- [x] **Step 1: Creare schema minimo e health query**

```ts
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  migrationHealth: defineTable({
    key: v.string(),
    value: v.string(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
});
```

```ts
// convex/health.ts
import { query } from "./_generated/server";
export const ping = query({ args: {}, handler: async () => ({ ok: true as const }) });
```

- [x] **Step 2: Scrivere il test del binding**

Il test monta un'app Vue, installa `convexVue`, ottiene il client tramite `app.runWithContext(() => useConvexClient())`, sostituisce `setAuth` con uno spy e verifica che il fetch token sia registrato una sola volta e che una query venga disiscritta all'unmount.

Run: `pnpm vitest run test/migration/convex-vue-spike.test.ts`

Expected: FAIL finché `app/plugins/convex.ts` non esporta `installConvex(app, url, fetchToken)`.

- [x] **Step 3: Implementare l'integrazione `convex-vue`**

```ts
export type FetchConvexToken = (args: { forceRefreshToken: boolean }) => Promise<string | null>;

export function installConvex(app: App, url: string, fetchToken: FetchConvexToken) {
  app.use(convexVue, { url, server: true });
  const client = app.runWithContext(() => useConvexClient());
  client.setAuth(fetchToken);
  return client;
}
```

- [x] **Step 4: Verificare i quattro casi del gate**

Testare su staging: query pubblica SSR con `suspense()`, query autenticata CSR, mutation tipizzata, realtime dopo una write. Ripetere con refresh token forzato e rete offline/online; una failure transiente non deve trasformarsi in logout definitivo.

- [ ] **Step 5: Applicare il fallback se uno dei casi fallisce**

Se `convex-vue@0.1.5` fallisce, rimuovere la dipendenza e implementare gli stessi export in `app/composables/useConvexResource.ts` usando esclusivamente `ConvexClient.onUpdate`, `ConvexClient.mutation` e `ConvexHttpClient.query`. Il contratto pubblico resta `{ data, error, isPending, suspense }` per query e `{ mutate, error, isPending }` per mutation; nessun endpoint CRUD Nuxt viene aggiunto.

- [x] **Step 6: Registrare G02 e commit** — il ledger registra `G02=PASS` (2026-09-18) con evidenza su staging; `Approved by` resta `—` perché la firma umana appartiene al GO/NO-GO del Task 17–18.

```bash
git add convex app/plugins/convex.ts app/composables/useConvexResource.ts test/migration/convex-vue-spike.test.ts nuxt.config.ts .env.example docs/migration
git commit -m "feat(migration): prove typed Convex Vue data layer"
```

### Task 4: Spike G03-G05 — Better Auth, proxy e import credenziali

> **Stato 2026-09-18: completato.** `G03=PASS` e `G05=PASS` su staging (`airowl/ceremly-staging` → `wary-spaniel-466`); `G04=NOT_RUN` (riga OAuth Google non eseguibile in questo ambiente: serve il consenso Google reale e un redirect URI di staging). Evidenza: `docs/migration/evidence/G03-G05-auth.md`.
>
> **Deviazioni misurate dal testo sotto** (dettagli e motivazioni nell'evidenza):
> - il plugin `admin` e `user.additionalFields` **non** sono attivi: la tabella `user` del componente `@convex-dev/better-auth@0.12.5` ha schema fisso e valida `data` con `v.object(...)`. `globalRole`, `locale` e i campi profilo passano quindi alle tabelle applicative (`appUsers` nel Task 5, profilo nel Task 10/12); l'import li elenca in `deferredProfileFields` invece di scartarli in silenzio.
> - il gateway G02 usa `applicationID: "gate"`: il plugin Convex rifiuta due provider con `applicationID: "convex"`.
> - l'import normalizza gli indirizzi email in minuscolo (Better Auth cerca sempre `email.toLowerCase()`) e riporta `normalizedEmails`.
> - `BETTER_AUTH_SECRET` non può ruotare al cutover: il plugin two-factor cifra segreto TOTP e backup code con quel secret (`symmetricEncrypt`), e le copie importate restano decifrabili solo con lo stesso valore.
> - il proxy è dietro il flag `NUXT_AUTH_BACKEND` (default `legacy`) per non spostare la produzione Vercel prima del cutover.

**Files:**
- Create: `convex/auth.config.ts`
- Create: `convex/auth.ts`
- Create: `convex/http.ts`
- Create: `app/lib/auth-client.ts`
- Create: `convex/migrations/authImport.ts`
- Create: `scripts/migration/export-auth.ts`
- Create: `test/migration/auth-proxy.test.ts`
- Create: `test/migration/auth-import.test.ts`
- Modify: `server/api/auth/[...all].ts`
- Modify: `app/composables/useAuth.ts`
- Modify: `convex/convex.config.ts`

**Interfaces:**
- Consumes: Better Auth Neon `user`, `account`, `two_factor`; `NUXT_PUBLIC_CONVEX_SITE_URL`.
- Produces: `createAuth(ctx)`, `authComponent`, `authComponent.clientApi().getAuthUser`, proxy byte-for-byte, `assertMigrationKey(value): void`, `importAuthRecordsIdempotently(adapter, batch): Promise<{ imported: number; skipped: number }>` e `internal.migrations.authImport.importBatch`.

- [x] **Step 1: Registrare il componente Better Auth** — fatto con le deviazioni sopra (niente `admin()`, niente `additionalFields`).

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import betterAuth from "@convex-dev/better-auth/convex.config";
import creem from "@creem_io/convex/convex.config";

const app = defineApp();
app.use(betterAuth);
app.use(creem);
export default app;
```

`convex/auth.ts` usa `createClient(components.betterAuth)`, `betterAuth` da `better-auth/minimal`, plugin `convex` e `twoFactor`; configura email/password, Google, account linking, campi `locale`, `tosAcceptedAt`, `phone`, `bio`, `timezone`, ruolo admin e callback email via action Resend. Non usare `crossDomain`: il client parla allo stesso origin Nuxt e il Worker inoltra `/api/auth/*`; `SITE_URL` è il `baseURL` pubblico canonico.

- [x] **Step 2: Registrare route lazy e proxy same-origin** — `cors: false` fa ignorare a `registerRoutesLazy` la sua opzione `trustedOrigins`: l'autorità restano le opzioni di `createAuth` (`baseURL: SITE_URL`), e il proxy inoltra l'`Origin` del browser (obbligatorio: Better Auth risponde `MISSING_OR_NULL_ORIGIN`/`INVALID_ORIGIN` senza).

```ts
// convex/http.ts
import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();
authComponent.registerRoutesLazy(http, createAuth, {
  basePath: "/api/auth",
  trustedOrigins: [process.env.SITE_URL!],
  cors: false,
});
export default http;
```

Il controller Nuxt inoltra metodo, path, query, body binario e header al Convex site URL; restituisce status, body e tutti i `Set-Cookie` senza concatenarli. Non segue redirect OAuth lato server (`redirect: "manual"`).

- [x] **Step 3: Testare il proxy prima dell'implementazione** — `test/migration/auth-proxy.test.ts` gira contro un upstream HTTP reale: GET sessione, POST JSON byte-for-byte, callback 302 con due `Set-Cookie` distinti, body vuoto, 500 upstream, header di forwarding non falsificabili e rifiuto di un origin `.convex.cloud`.

`auth-proxy.test.ts` copre GET sessione, POST JSON, callback 302, due `Set-Cookie`, body vuoto, errore Convex 500 e rifiuto di host arbitrari.

Run: `pnpm vitest run test/migration/auth-proxy.test.ts`

Expected: FAIL contro l'handler Better Auth locale corrente.

- [x] **Step 4: Implementare l'import auth idempotente** — idempotenza per chiave naturale (`email`, `(providerId, accountId)`, `userId`), non per `id` legacy: il componente genera `_id`, quindi `importAuthRecordsIdempotently` risolve la mappa legacy→nuovo dentro il batch e rifiuta un record il cui utente non è risolvibile.

```ts
export const importBatch = internalMutation({
  args: {
    migrationKey: v.string(),
    users: v.array(v.any()),
    accounts: v.array(v.any()),
    twoFactors: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    assertMigrationKey(args.migrationKey);
    const auth = createAuth(ctx);
    const adapter = authComponent.adapter(ctx)(auth.options);
    return importAuthRecordsIdempotently(adapter, args);
  },
});
```

La chiave idempotente è `model + legacy id`; i record importati mantengono ID Better Auth, hash `account.password`, provider/account ID Google, `two_factor.secret` e `backupCodes`. Non importare session e verification.

- [x] **Step 5: Eseguire i tre test reali minimizzati** — catena reale (Neon dev → export cifrato AES-256-GCM → import → sign-in su Convex) con account sintetici prodotti dalle stesse primitive del legacy (`hashPassword`, `symmetricEncrypt`). `G03` e `G05` PASS; il giro OAuth Google resta bloccato: `G04=NOT_RUN`.

Su una copia cifrata con almeno un account per scenario:

1. login email/password con la password originale (`G03`);
2. login Google e account linking senza duplicare l'utente (`G04`);
3. login 2FA con authenticator esistente, consumo di un backup code e recovery controllato (`G05`).

Ogni test deve fare logout, invalidare la sessione e ripetere il login. Salvare solo ID pseudonimi e risultati, mai hash o segreti, in `docs/migration/evidence/G03-G05-auth.md`.

- [x] **Step 6: Verificare il comportamento su errori transitori** — `test/migration/auth-client.test.ts` fissa il contratto di `createConvexTokenFetcher` (G02 finding 2): mai un reject, 502 transiente conserva l'ultimo token, solo 401/403 lo azzera.

Simulare 502 su `/get-session` e `/convex/token`: il client conserva lo stato precedente, mostra stato retryable e non cancella il token finché Better Auth non risponde esplicitamente con sessione assente.

- [x] **Step 7: Gate e commit**

Impostare `G03`, `G04`, `G05` a `PASS` solo con evidenze staging. Se il segreto 2FA non è compatibile, impostare `G05=FAIL` e fermarsi; il recovery alternativo richiede una revisione esplicita della spec.

```bash
git add convex app/lib app/composables/useAuth.ts server/api/auth test/migration scripts/migration docs/migration
git commit -m "feat(migration): prove Better Auth credential migration"
```

### Task 5: Spike G06 — organizzazioni applicative e RBAC Convex

> **Stato 2026-09-21: completato.** `G06=PASS`: 36 test ermetici (`pnpm test:gate:g06`) più verifica live del trigger su `airowl/ceremly-staging` → `wary-spaniel-466`. Evidenza: `docs/migration/evidence/G06-org-rbac.md`.
>
> **Deviazioni misurate dal testo sotto** (dettagli e motivazioni nell'evidenza):
> - `appUsers` ha anche `email` (normalizzata, indicizzata) oltre ai campi elencati nello Step 1: senza di essa "è già membro?" e "l'invito è indirizzato a me?" richiederebbero un giro sul componente Better Auth, e il confronto deve avvenire come lo fa Better Auth (`toLowerCase`). `ensureProvisioned` risincronizza la copia dal JWT a ogni login, quindi `changeEmail` arriva comunque al dominio.
> - la tabella inviti ha anche `tokenHash`, `inviterUserId`, `expiresAt`, `createdAt`, `acceptedAt/By`, `canceledAt`, e `auditLogs` viene aggiunta perché lo Step 4 richiede un record per ogni write.
> - `forbidden(code)` restituisce `ConvexError({ code, … })`: il codice è la parte stabile su cui il client decide, i dettagli restano per i log.
> - "un member non scrive" è implementato come *nessuna scrittura amministrativa* (org, membership, inviti) mantenendo la regola legacy `roleCanWrite` per i dati di dominio: la migrazione non deve togliere a un member l'accesso in scrittura che ha oggi in produzione.

**Files:**
- Create: `convex/lib/identity.ts`
- Create: `convex/lib/authorization.ts`
- Create: `convex/lib/audit.ts`
- Create: `convex/organizations.ts`
- Create: `convex/organizations.test.ts`
- Modify: `convex/schema.ts`

**Interfaces:**
- Produces: `requireIdentity(ctx)`, `requireActiveOrganization(ctx)`, `requireRole(ctx, roles)`, `getAuthEmail(ctx, authUserId): Promise<string>`, `forbidden(code): ConvexError`, `findAppUserByAuthId(ctx, authUserId)`, `findMembership(ctx, organizationId, userId)`, `writeAudit(ctx, input)`, `api.organizations.setActive`, `api.organizations.inviteMember`, `api.organizations.acceptInvitation`.

- [x] **Step 1: Aggiungere le tabelle tenant minime** — più `invitations` e `auditLogs`, richieste dagli Step 2 e 4; indici tenant-first (`by_org_user`, `by_organization_role`, `by_org_status`, `by_org_email`, `by_token_hash`).

```ts
appUsers: defineTable({
  authUserId: v.string(),
  legacyId: v.optional(v.string()),
  globalRole: v.union(v.literal("user"), v.literal("superAdmin")),
  locale: v.string(),
  activeOrganizationId: v.optional(v.id("organizations")),
}).index("by_auth_user", ["authUserId"]).index("by_legacy_id", ["legacyId"]),
organizations: defineTable({
  legacyId: v.optional(v.string()),
  name: v.string(),
  slug: v.string(),
  logo: v.optional(v.string()),
  createdAt: v.number(),
}).index("by_slug", ["slug"]).index("by_legacy_id", ["legacyId"]),
memberships: defineTable({
  organizationId: v.id("organizations"),
  userId: v.id("appUsers"),
  role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
  createdAt: v.number(),
}).index("by_org_user", ["organizationId", "userId"]).index("by_user", ["userId"]),
```

- [x] **Step 2: Scrivere prima i test di isolamento** — `convex/organizations.test.ts` (32 casi): ogni requisito elencato qui ha un test dedicato, ed è il gate G06.

Con `convexTest(schema, modules)` creare Alice/org A e Bob/org B. Verificare: Alice non legge B, un member non scrive, admin scrive ma non elimina org, owner gestisce membership, `setActive` rifiuta org senza membership e il client non può forzare `organizationId` negli args. Coprire inoltre invito pending con token hash, scadenza, accept idempotente, email case-insensitive, divieto self-invite e impossibilità di accettare un invito destinato a un'altra email.

Run: `pnpm vitest run convex/organizations.test.ts`

Expected: FAIL finché gli helper non esistono.

- [x] **Step 3: Implementare gli helper con unico indice tenant** — `convex/lib/identity.ts`, `convex/lib/authorization.ts`: `requireRole` è la via di accesso a ogni write tenant-scoped, con membership ri-verificata a ogni chiamata (un puntatore stantio nega, non autorizza).

```ts
export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  roles: readonly OrganizationRole[],
): Promise<AuthzContext> {
  const identity = await requireIdentity(ctx);
  const appUser = await findAppUserByAuthId(ctx, identity.subject);
  if (!appUser.activeOrganizationId) throw forbidden("NO_ACTIVE_ORGANIZATION");
  const membership = await findMembership(ctx, appUser.activeOrganizationId, appUser._id);
  if (!membership || !roles.includes(membership.role)) throw forbidden("INSUFFICIENT_ROLE");
  return { authUserId: identity.subject, appUserId: appUser._id, organizationId: appUser.activeOrganizationId, role: membership.role };
}
```

- [x] **Step 4: Auditare ogni mutation e provare la concorrenza** — `writeAudit` scrive nella stessa transazione della write (una write senza audit non esiste); due accept concorrenti convergono su una sola membership e un solo record `team.invite_accepted`. Il trigger `user.create` è in `convex/auth.ts`; il self-heal è `api.organizations.ensureProvisioned`, idempotente e verificato live.

Due richieste concorrenti di creazione membership devono produrre una sola membership logica; ogni create/update/delete/setActive scrive audit con attore, org, target e dettagli.

Il trigger di creazione Better Auth crea `appUser`, organizzazione personale e membership owner; il primo login esegue self-heal idempotente se uno dei tre record manca. L'accettazione invito può cambiare l'organizzazione attiva soltanto dopo aver creato/verificato la membership.

- [x] **Step 5: Gate e commit**

```bash
git add convex/schema.ts convex/lib convex/organizations.ts convex/organizations.test.ts docs/migration
git commit -m "feat(migration): enforce Convex tenant RBAC"
```

*(2026-09-21: eseguito — `pnpm test:gate:g06` verde (36 casi) e `G06=PASS` nel ledger; G02 e G03–G05 ri-eseguiti senza regressioni.)*

### Task 6: Spike G07 — billing Creem per organizzazione

**Files:**
- Create: `convex/billing.ts`
- Create: `convex/billing.test.ts`
- Create: `scripts/migration/reconcile-creem.ts`
- Modify: `convex/schema.ts`
- Modify: `convex/http.ts`
- Modify: `shared/constants/pricing.ts`

**Interfaces:**
- Consumes: `requireRole(ctx, ["owner"])`, organizzazione attiva.
- Produces: `api.billing.checkoutsCreate`, `api.billing.customersPortalUrl`, `api.billing.planForActiveOrganization`, `internal.billing.syncBillingProducts`.

- [x] **Step 1: Scrivere test RBAC e idempotenza webhook**

Verificare che `entityId` sia sempre l'ID Convex dell'organizzazione attiva, che un ID passato dal browser sia ignorato/rifiutato, che solo owner apra checkout/portal e che lo stesso evento webhook ripetuto non sblocchi due volte un evento né duplichi audit.

Per lo spike aggiungere a `convex/schema.ts` la porzione minima `events` (`legacyId`, `organizationId`, `tier`, `creemOrderId`, `creemCheckoutId`, `unlockedAt`) e `webhookEvents` (`provider`, `providerEventId`, `processedAt`, `outcome`); il Task 10 completa la tabella senza rinominare questi campi.

- [x] **Step 2: Incapsulare l'API ufficiale**

```ts
export const creem = new Creem(components.creem);

const resolve: ApiResolver = async (ctx) => {
  const authz = await requireRole(ctx, ["owner"]);
  const user = await ctx.db.get(authz.appUserId);
  if (!user) return null;
  return {
    userId: authz.authUserId,
    email: await getAuthEmail(ctx, authz.authUserId),
    entityId: authz.organizationId,
  };
};

const billingApi = creem.api({ resolve });
export const checkoutsCreate = billingApi.checkouts.create;
export const customersPortalUrl = billingApi.customers.portalUrl;
```

- [x] **Step 3: Registrare webhook e sync prodotti**

Chiamare `creem.registerRoutes(http)` nello stesso `convex/http.ts`; esporre `syncBillingProducts` come `internalAction` e avviarlo con `pnpm convex run billing:syncBillingProducts`. Mappare esattamente `free`, `celebration`, `atelier` dai product ID Convex env.

- [x] **Step 4: Reconciliation con lo stato esistente**

`reconcile-creem.ts` confronta customer ID, subscription ID, order ID, product, status, periodi ed entity org. Produce JSON con soli identificatori e mismatch; exit code `1` se esiste un mismatch.

- [x] **Step 5: Eseguire G07 e commit**

Su Creem test mode: checkout celebration, subscription atelier, portal, webhook replay, cancel/refund e re-lock evento.

```bash
git add convex/billing.ts convex/billing.test.ts convex/http.ts scripts/migration/reconcile-creem.ts shared/constants/pricing.ts docs/migration
git commit -m "feat(migration): prove organization-scoped Creem billing"
```

### Task 7: Spike G08 — R2 e varianti osservabili con Cloudflare Images

**Files:**
- Create: `convex/files.ts`
- Create: `convex/media.ts`
- Create: `convex/media.test.ts`
- Create: `server/api/internal/storage/presign.post.ts`
- Create: `server/api/internal/storage/object.post.ts`
- Create: `server/api/internal/media/process.post.ts`
- Modify: `convex/schema.ts`
- Modify: `server/types/cloudflare.d.ts`
- Modify: `wrangler.jsonc`

**Interfaces:**
- Produces: `api.files.presignUpload`, `api.files.confirmUpload`, `api.files.downloadUrl`, `api.files.remove`, bridge Worker firmati `POST /api/internal/storage/presign`, `POST /api/internal/storage/object` e `POST /api/internal/media/process`, `internal.media.processVariantResult`, stati `pending|processing|ready|retrying|failed`.

- [x] **Step 1: Estendere schema file e job**

Creare la tabella `files` in `convex/schema.ts`. Ogni originale processabile porta `variantStatus`, `variantAttempts`, `variantError`, `variantUpdatedAt`; ogni variante usa `variantOf`, `variantType`, chiave R2 derivata stabile e checksum. L'indice `by_variant_status` alimenta retry/admin.

- [x] **Step 2: Scrivere test di autorizzazione e stato**

Verificare presign solo per membro autorizzato, conferma solo per chiave emessa, magic bytes prima dello stato `ready`, idempotenza per `sha256+organizationId`, due varianti al massimo, retry fino a 5 e `failed` terminale visibile.

- [x] **Step 3: Processare con Images binding senza cambiare bucket**

`api.files.presignUpload` è una action Convex: autorizza utente e quota, poi chiama `/api/internal/storage/presign` con payload canonico, timestamp, nonce e firma HMAC. Il Worker conserva le credenziali R2, limita expiry, content type, size e key prefix, e restituisce l'URL firmato; nonce e timestamp impediscono replay. `confirmUpload` usa `/api/internal/storage/object` per HEAD e lettura magic bytes prima di marcare il file pronto; lo stesso bridge esegue delete autorizzato. La variante download di `presign` emette URL brevi soltanto dopo l'autorizzazione Convex.

Il Worker media usa lo stesso schema di firma, legge l'originale da `CEREMLY_R2`, genera `thumb` 400px WebP quality 80 e `web` 1600px WebP quality 85 tramite `env.IMAGES`, salva nelle chiavi esistenti `{basePath}/thumb.webp` e `{basePath}/web.webp`, quindi notifica Convex con firma HMAC. Nessun fallback silenzioso restituisce array vuoto.

- [x] **Step 4: Provare file legacy e failure injection**

Testare una chiave R2 esistente, un'immagine piccola, JPEG/PNG/WebP/AVIF, payload non immagine, timeout Images e retry manuale da funzione admin. Salvare conteggi e chiavi pseudonime in `docs/migration/evidence/G08-media.md`.

- [x] **Step 5: Gate e commit**

```bash
git add convex/files.ts convex/media.ts convex/media.test.ts server/api/internal/storage server/api/internal/media server/types/cloudflare.d.ts wrangler.jsonc docs/migration
git commit -m "feat(migration): prove observable R2 image variants"
```

*(2026-09-21: eseguito — `pnpm test:gate:g08` verde (32 casi) e `G08=PASS` nel ledger. Nota: `wrangler.jsonc` non è stato modificato — i binding `CEREMLY_R2` e `IMAGES` esistevano già da G01 e il secret del bridge è una variabile d'ambiente, non un valore committato. Il commit ha incluso anche `shared/migration/bridgeProtocol.ts`, `server/utils/storageBridge.ts`, `server/utils/storageBridgeObjects.ts`, `server/services/file/bridgePolicy.ts`, `server/types/images.ts`, `convex/lib/*` e `package.json`.)*

### Task 8: Spike G09 — matrice protezioni e rate limiting

**Files:**
- Create: `docs/migration/protection-matrix.md`
- Create: `convex/lib/rateLimit.ts`
- Create: `convex/lib/rateLimit.test.ts`
- Create: `test/migration/security-headers.test.ts`
- Modify: `convex/schema.ts`
- Modify: `nuxt.config.ts`
- Modify: `wrangler.jsonc`

**Interfaces:**
- Produces: `assertRateLimit(ctx, { key, bucket, limit, windowMs })`; matrice rotta→protezione per auth, RSVP, contact, waiting list, presign/upload e admin.

- [x] **Step 1: Scrivere la matrice completa**

Righe obbligatorie e chiave:

| Rotta/funzione | Edge | Convex | Chiave |
| --- | --- | --- | --- |
| `/api/auth/*` | Cloudflare Rate Limiting | Better Auth rate limit | IP + path |
| RSVP pubblico | WAF se proxy; altrimenti nessuna copertura edge | obbligatorio | token guest + IP hash |
| contact/waiting-list | WAF se proxy | obbligatorio | IP hash + email hash |
| presign/confirm | Worker limit | obbligatorio | appUserId + organizationId |
| admin | WAF | obbligatorio | superAdmin appUserId |

- [x] **Step 2: Testare atomico consume/reject**

Creare `rateLimitBuckets` con indice `by_key_window`. `assertRateLimit` usa una mutation Convex e bucket temporali indicizzati; N richieste passano, N+1 genera `RATE_LIMITED` con `retryAfterMs`. Due chiamate concorrenti non superano il limite.

- [x] **Step 3: Verificare header e bot trap sul Worker**

Il test HTTP asserisce CSP, HSTS due anni, `X-Content-Type-Options: nosniff`, limite body 1MB, limite upload 5MB, fake server headers e redirect delle bot trap. Le sole eccezioni CSP sono auth proxy e webhook/documentate.

- [x] **Step 4: Registrare G09 e commit**

```bash
git add docs/migration/protection-matrix.md convex/lib/rateLimit.ts convex/lib/rateLimit.test.ts test/migration/security-headers.test.ts nuxt.config.ts wrangler.jsonc docs/migration/gates.md
git commit -m "feat(migration): map and enforce edge protection"
```

*(2026-09-21: eseguito — `pnpm test:gate:g09` verde (36 casi: 15 header/matrix, 14 limiter, 7 auth) e `G09=PASS` nel ledger. Deviazioni dal piano, tutte misurate: (a) `nuxt.config.ts` **non** è stato modificato — il gate ha trovato che le route servite dalla Assets layer di Workers (`/` prerenderizzata e `/_nuxt/**`) non ricevevano alcun header di sicurezza né la cache immutabile, e il fix corretto è `public/_headers` (meccanismo supportato da Cloudflare per le risposte statiche), non un nuovo `routeRules`; (b) `wrangler.jsonc` **non** è stato modificato — nessuna regola WAF/Rate Limiting di zona è dichiarabile lì, e il binding `ratelimits` dei Workers non è stato introdotto perché non sarebbe verificabile senza un deploy; la matrice lo registra come obbligo di deploy; (c) in più rispetto al piano: `convex/auth.ts` (le regole brute-force legacy erano andate perse e sono state riportate con `storage: "database"`), `convex/test.setup.ts` (`initConvexTestWithAuthComponent`, necessario per pilotare il vero handler Better Auth in `convex-test`), `public/_headers`, `package.json` (`test:gate:g09`).)*

- **Task 8 / G09:** completato (2026-09-21). Matrice completa in `docs/migration/protection-matrix.md` e limiter Convex come unica porta d'ingresso per il budget: check e incremento in una sola mutation (12 chiamanti concorrenti, budget 4 → esattamente 4 ammessi), chiave memorizzata solo come `sha256(bucket\0key)`, finestra fissa allineata all'epoca, `pruneExpired` per lo sweep del Task 13. 36 casi di gate più prove live su Worker e staging. Il gate ha trovato tre difetti reali: le route servite dalla Assets layer (`/` prerenderizzata, `/_nuxt/**`) non ricevevano header di sicurezza né cache immutabile — risolto con `public/_headers`; `/api/auth/*` è un proxy trasparente senza header applicativi, quindi quella riga resta all'edge; e la config Convex di Better Auth aveva perso le regole brute-force legacy (riportate verbatim, `storage: "database"`). Evidenza: `docs/migration/evidence/G09-protections.md`.

### Task 9: Spike G10 — modello economico con fan-out reattivo

**Files:**
- Create: `scripts/migration/load-model.ts`
- Create: `scripts/migration/load-runner.ts`
- Create: `test/migration/load-model.test.ts`
- Create: `docs/migration/cost-model.md`

**Interfaces:**
- Produces: report per 20, 50, 100, 1.000 utenti con `explicitCalls`, `scheduledCalls`, `fileCalls`, `reactiveReexecutions`, DB bandwidth/storage, action compute, R2, Resend e traffico pubblico.

- [x] **Step 1: Scrivere il test della formula**

```ts
it("counts reactive fan-out instead of flat calls per planner", () => {
  const result = monthlyCalls({
    explicitCalls: 100,
    scheduledCalls: 20,
    fileCalls: 10,
    writes: 30,
    subscribersPerWrite: 4,
  });
  expect(result.reactiveReexecutions).toBe(120);
  expect(result.total).toBe(250);
});
```

- [x] **Step 2: Implementare il modello puro**

```ts
export interface LoadInputs {
  explicitCalls: number;
  scheduledCalls: number;
  fileCalls: number;
  writes: number;
  subscribersPerWrite: number;
}

export function monthlyCalls(input: LoadInputs) {
  const reactiveReexecutions = input.writes * input.subscribersPerWrite;
  return {
    ...input,
    reactiveReexecutions,
    total: input.explicitCalls + input.scheduledCalls + input.fileCalls + reactiveReexecutions,
  };
}
```

- [x] **Step 3: Eseguire carico sintetico staging**

`load-runner.ts` riproduce mix misurato di login, dashboard, editor evento, guest import, RSVP, reminder, upload, checkout e admin. Per ogni scenario apre 1/5/20 subscription concorrenti e misura dashboard Convex/Cloudflare prima e dopo.

- [x] **Step 4: Produrre confronto e gate**

`cost-model.md` contiene assunzioni, misure, prezzi datati 2026-09-15, interpolazione mensile e margine 30%. `G10=PASS` richiede una fascia scelta esplicitamente e budget/usage alert configurati; nessuna stima usa “1.000 call/planner”.

- [x] **Step 5: Commit e checkpoint hard**

```bash
git add scripts/migration/load-model.ts scripts/migration/load-runner.ts test/migration/load-model.test.ts docs/migration
git commit -m "test(migration): validate Convex cost model"
```

Run: `rg -n '\| G(0[1-9]|10) \| PASS \|' docs/migration/gates.md | wc -l`

Expected: `10`. Se il risultato è diverso, fermare l'esecuzione del piano.

*(2026-09-21: eseguito — il checkpoint ha dato **8**, non 10, e per la regola del piano l'esecuzione si è **fermata** qui: il Task 10 non è iniziato. I due gate mancanti non sono falliti, sono non eseguibili da questo repository, e per entrambi la causa è un accesso esterno e non una lacuna del lavoro: **G04** aspetta un Google client con redirect URI su staging e una consent screen reale (vedi `docs/migration/evidence/G03-G05-auth.md`), **G10** aspetta un accesso alla dashboard — i limiti di spesa Convex sono solo dashboard (`convex --help` verificato: nessun comando di budget) e l'alerting Cloudflare richiede un API token che in `.env` non c'è, solo le chiavi S3 di R2. Entrambi registrati `NOT_RUN` nel ledger con la stessa disciplina, e i due requisiti restano invariati. Deviazioni dal piano, misurate: (a) l'input `subscribersPerWrite` del piano è stato scomposto in fan-out **per flusso** con un flag `watched`, perché un `writes × subscribers` globale non può rappresentare l'RSVP pubblico né lo sweep notturno, dove chi scrive non è chi guarda — il test asserisce che i totali per flusso sommino al totale aggregato; (b) il runner misura 1/5/20 subscriber e scopre che una scrittura che non cambia il valore sottoscritto costa **zero** ri-esecuzioni, quindi il termine del modello è `watched writes`, non `mutations`; (c) `scripts/migration/load-runner.ts` è nuovo rispetto al piano e `test/setup` non è stato toccato. Il modello è puro e testato (17 casi), il runner ha misurato latenze p50/p95 e payload reali, e il documento dichiara esplicitamente cosa non è misurato: le dashboard prima/dopo e i flussi `events`/`guests`/`rsvp`/`reminders`, che non esistono ancora (Tasks 10–12).)*

### Task 10: Schema Convex completo e import domain-safe

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/model/validators.ts`
- Create: `convex/migrations/domainImport.ts`
- Create: `convex/migrations/domainImport.test.ts`

**Interfaces:**
- Consumes: gate `G01`-`G10=PASS`, `MigrationBatch<T>`.
- Produces: tabelle applicative e `internal.migrations.domainImport.importBatch` idempotente.

- [ ] **Step 1: Trascrivere tutte le tabelle correnti**

Definire: `appUsers`, `organizations`, `memberships`, `organizationInvitations`, `events`, `guests`, `rsvpResponses`, `guestActivities`, `eventReminders`, `projects`, `files`, `auditLogs`, `emailSuppressions`, `emailEvents`, `contactMessages`, `waitingList`, `dataExports`, `customLimits`, `jobExecutions`, `webhookEvents`, `siteSettings`, `rateLimitBuckets`, `migrationRecords`. Ogni record migrato ha `legacyId`; timestamp PostgreSQL diventano epoch millisecondi; JSON mantiene le shape di `shared/types/ceremly.ts` e `shared/constants/inviteTheme.ts`.

- [ ] **Step 2: Definire indici equivalenti ai path reali**

Indici minimi: legacy ID, slug evento, token guest, org+status, org+createdAt, event+email normalizzata, guest RSVP, event reminder, provider event ID, job status+nextAttemptAt, email message ID, export user+status. Non usare `.filter()` su query tenant se un indice composto può iniziare da `organizationId`.

- [ ] **Step 3: Scrivere test idempotenza e foreign key logiche**

Importare due volte lo stesso batch e verificare count invariato; rifiutare membership senza user/org, guest senza event/org coerenti, RSVP senza guest, variante senza parent e record con `legacyId` duplicato.

- [ ] **Step 4: Implementare import per ordine topologico**

Ordine vincolante: utenti applicativi → organizzazioni → membership/inviti → eventi/progetti → guest/reminder → RSVP/activity → file → email/audit/export/limiti → billing references. Ogni batch salva `table`, `batchIndex`, `sha256`, `importedAt` in `migrationRecords` prima di rispondere success.

- [ ] **Step 5: Verificare e commit**

Run: `pnpm convex codegen && pnpm vitest run convex/migrations/domainImport.test.ts && pnpm typecheck:convex`

```bash
git add convex/schema.ts convex/model convex/migrations
git commit -m "feat(migration): model and import Ceremly domain in Convex"
```

### Task 11: Portare business logic e API dominio in Convex

**Files:**
- Create: `convex/events.ts`
- Create: `convex/guests.ts`
- Create: `convex/rsvp.ts`
- Create: `convex/reminders.ts`
- Create: `convex/projects.ts`
- Create: `convex/domain.test.ts`

**Interfaces:**
- Consumes: `requireRole`, `writeAudit`, schema completo.
- Produces: query/mutation con gli stessi payload funzionali dei composable attuali.

- [ ] **Step 1: Scrivere characterization test dal comportamento legacy**

Coprire create/list/get/update/delete evento e progetto, import guest con dedup email, soft-delete guest, invito pubblico via token, RSVP upsert, deadline/closed message, statistiche, mark-sent, reminder massimo 3, event tier lock e tenant isolation.

- [ ] **Step 2: Esporre funzioni pubbliche senza `organizationId` arbitrario**

Contratti principali:

```ts
api.events.list({ cursor, limit })
api.events.get({ eventId })
api.events.create({ input })
api.events.update({ eventId, input })
api.events.remove({ eventId })
api.guests.list({ eventId, cursor, limit })
api.guests.importCsv({ eventId, rows })
api.rsvp.publicInvite({ token })
api.rsvp.submit({ token, attending, companionsCount, answers, declineMessage })
api.projects.list({ cursor, limit })
```

L'organizzazione arriva sempre da `requireActiveOrganization`; `eventId` viene verificato contro la stessa organizzazione prima di ogni accesso.

- [ ] **Step 3: Audit e idempotenza**

Ogni mutation autenticata scrive audit nella stessa transaction Convex. RSVP usa guest ID come unicità logica; activity reminder usa `guestId+type+reminderId`; mark-sent e unlock/relock sono no-op se già nello stato finale.

- [ ] **Step 4: Eseguire suite e commit**

Run: `pnpm vitest run convex/domain.test.ts && pnpm typecheck:convex`

```bash
git add convex/events.ts convex/guests.ts convex/rsvp.ts convex/reminders.ts convex/projects.ts convex/domain.test.ts
git commit -m "feat(migration): port tenant domain to Convex"
```

### Task 12: Profilo, GDPR, form pubblici e site mode

**Files:**
- Create: `convex/profile.ts`
- Create: `convex/publicForms.ts`
- Create: `convex/dataExports.ts`
- Create: `convex/siteSettings.ts`
- Create: `convex/lib/jobQueue.ts`
- Create: `convex/jobs.ts`
- Create: `convex/auxiliaryFlows.test.ts`
- Modify: `server/api/contact.post.ts`
- Modify: `server/api/waiting-list/subscribe.post.ts`
- Modify: `server/api/public/invite/[token]/rsvp.post.ts`

**Interfaces:**
- Consumes: authz, rate limiter, job queue e R2 signing.
- Produces: `enqueueJob(ctx, type, entityId)`, `api.profile.current`, `api.profile.update`, `api.profile.requestDeletion`, `api.dataExports.request`, `api.dataExports.status`, `api.publicForms.contact`, `api.publicForms.waitingList`, `api.siteSettings.getPublic`.

- [ ] **Step 1: Scrivere test di profilo e cancellazione**

Verificare lettura/aggiornamento solo del proprio profilo, campi consentiti `name|phone|bio|locale|timezone|image`, rifiuto di ruolo/email arbitrari, richiesta export idempotente e cancellazione account differita/auditata. Il purge elimina dati personali secondo il comportamento corrente senza lasciare membership orfane.

- [ ] **Step 2: Portare export GDPR e download**

`api.dataExports.request` crea un job `data-export`; l'action raccoglie profilo, membership/eventi accessibili, file metadata, audit e billing, salva JSON su R2 e persiste scadenza/token. `api.dataExports.downloadUrl` restituisce un URL firmato breve solo al proprietario e solo per export `succeeded` non scaduto.

`convex/lib/jobQueue.ts` crea il record `pending` e chiama `ctx.scheduler.runAfter(0, internal.jobs.run, { jobId })`. In questo task `convex/jobs.ts` implementa già il runner `data-export` e `account-purge`; il Task 13 aggiunge email/media, retry generalizzato e cron senza cambiare la firma `enqueueJob`.

- [ ] **Step 3: Mantenere bridge Worker sottili per write anonime**

Contact, waiting list e RSVP pubblico restano route Nuxt di trasporto da massimo 25 righe: estraggono l'IP Cloudflare, calcolano un hash HMAC non reversibile, inoltrano payload e `edgeRequestId` a una HTTP action Convex e restituiscono la risposta. Validazione di dominio, rate limit, deduplica, write e audit vivono esclusivamente in Convex. Questo evita di fidarsi di un IP fornito dal browser e consente WAF/Rate Limiting Cloudflare.

- [ ] **Step 4: Portare site mode a Convex**

`siteSettings` contiene una sola chiave `siteMode` con `active|waitinglist|maintenance|maintenance-readonly`. `api.siteSettings.getPublic` è read-only; la mutation richiede superAdmin e audit. Il middleware Worker legge il valore da Convex con timeout fail-closed: in caso di errore conserva maintenance se già osservata e non riapre silenziosamente le write.

- [ ] **Step 5: Testare spam, deduplica e failure mode**

Testare honeypot, tempo minimo form, email disposable, doppia iscrizione waiting list, RSVP replay, IP hash falsificato, Convex timeout e modalità maintenance-readonly. Nessun bridge importa repository, Drizzle o service legacy.

- [ ] **Step 6: Commit**

```bash
git add convex/profile.ts convex/publicForms.ts convex/dataExports.ts convex/siteSettings.ts convex/lib/jobQueue.ts convex/jobs.ts convex/auxiliaryFlows.test.ts server/api/contact.post.ts server/api/waiting-list/subscribe.post.ts server/api/public/invite/'[token]'/rsvp.post.ts
git commit -m "feat(migration): port profile GDPR and public flows to Convex"
```

### Task 13: Scheduler, cron, Resend e retry persistito

**Files:**
- Create: `convex/email.ts`
- Create: `convex/emailTemplates/ChangeEmailEmail.ts`
- Create: `convex/emailTemplates/ContactConfirmationEmail.ts`
- Create: `convex/emailTemplates/ContactNotificationEmail.ts`
- Create: `convex/emailTemplates/EventCleanupWarning.ts`
- Create: `convex/emailTemplates/GuestInviteEmail.ts`
- Create: `convex/emailTemplates/GuestReminderEmail.ts`
- Create: `convex/emailTemplates/OrgInviteEmail.ts`
- Create: `convex/emailTemplates/ResetPasswordEmail.ts`
- Create: `convex/emailTemplates/VerificationEmail.ts`
- Create: `convex/emailTemplates/WaitingListEmail.ts`
- Create: `convex/emailTemplates/_softMeadow.ts`
- Create: `convex/emailTemplates/index.ts`
- Create: `convex/emailTemplates/EventCleanupWarning.test.ts`
- Modify: `convex/jobs.ts`
- Create: `convex/crons.ts`
- Create: `convex/jobs.test.ts`
- Modify: `convex/http.ts`
- Modify: `server/api/webhooks/resend.post.ts`
- Modify: `convex/auth.ts`

**Interfaces:**
- Consumes: `enqueueJob(ctx, type, entityId)` dal Task 12.
- Produces: `internal.jobs.run`, `internal.jobs.recordOutcome`, `api.jobs.retryDead`.

- [ ] **Step 1: Scrivere test state machine job**

Stati validi: `pending→running→succeeded`, `running→retrying→running`, `running→dead`, `dead→pending` solo da superAdmin. Il backoff è `min(60_000 * 2 ** attempts, 86_400_000)`, massimo 5 tentativi. La stessa idempotency key non crea due job.

- [ ] **Step 2: Implementare mutation/action split**

La mutation crea/claim il job e schedula `internal.jobs.run` con solo `jobId`. L'action invoca Resend o il Worker media; una mutation registra provider ID o errore sanitizzato e pianifica il prossimo tentativo. Nessun segreto entra in `jobExecutions`.

- [ ] **Step 3: Portare i job esistenti**

Tipi esatti: `send-invite-email`, `send-reminder-email`, `data-export`, `image-variant`, `event-cleanup-warning`, `account-purge`. Conservare suppression Resend, email event webhook, audit e idempotenza correnti.

Spostare i template React Email elencati da `server/emailTemplates/` a `convex/emailTemplates/`, mantenere input e snapshot test, e importarli soltanto dalle action Node di `convex/email.ts`. I template non leggono runtime config Nuxt: ricevono app name, URL e locale come props validate.

Registrare in `convex/http.ts` la route firmata Resend e rendere `server/api/webhooks/resend.post.ts` un bridge temporaneo senza business logic durante rehearsal. Al cutover il dashboard Resend punta direttamente al Convex site URL; replay dello stesso `svix-id`/message event non duplica `emailEvents`.

- [ ] **Step 4: Definire cron Convex**

`convex/crons.ts` registra reminder giornaliero 07:00 UTC, cleanup file 03:00 UTC, eventi stale, requeue varianti e purge account. Le funzioni cron selezionano piccoli batch indicizzati e schedulano job; non eseguono loop illimitati.

- [ ] **Step 5: Test e commit**

Usare fake timers e `finishAllScheduledFunctions`; simulare Resend 429/500/success e webhook duplicato.

```bash
git add convex/email.ts convex/emailTemplates convex/jobs.ts convex/crons.ts convex/jobs.test.ts convex/http.ts convex/auth.ts server/api/webhooks/resend.post.ts
git commit -m "feat(migration): replace QStash with durable Convex jobs"
```

### Task 14: Migrare il frontend da `$fetch` a Convex

**Files:**
- Modify: `app/composables/useEvents.ts`
- Modify: `app/composables/useEventGuests.ts`
- Modify: `app/composables/useEventStats.ts`
- Modify: `app/composables/usePublicInvite.ts`
- Modify: `app/composables/useOrganization.ts`
- Modify: `app/composables/useProjects.ts`
- Modify: `app/composables/useSubscription.ts`
- Modify: `app/stores/organizationStore.ts`
- Modify: `app/stores/profileStore.ts`
- Modify: `app/components/profile/DataExportSection.vue`
- Modify: `app/components/profile/DataExportHistory.vue`
- Modify: `app/components/landing/Contact.vue`
- Modify: `app/components/landing/WaitingListCTA.vue`
- Modify: `app/components/blog/BlogNewsletter.vue`
- Modify: `app/components/blog/BlogSidebar.vue`
- Modify: `app/pages/index.vue`
- Modify: `app/pages/dashboard/profile/index.vue`
- Modify: `app/pages/dashboard/events/[id]/editor.vue`
- Modify: le altre pagine consumer sotto `app/pages/dashboard/**`
- Modify: `app/pages/e/[slug]/[token].vue`
- Create: `test/migration/frontend-data-layer.test.ts`

**Interfaces:**
- Consumes: `api.events`, `api.guests`, `api.rsvp`, `api.organizations`, `api.projects`, `api.billing`.
- Produces: UI invariata che usa query/mutation/realtime Convex; `$fetch` resta solo per `/api/auth/*` e route Worker strettamente necessarie ai binding.

- [ ] **Step 1: Scrivere il test anti-CRUD Nuxt**

Il test scansiona i composable dominio e fallisce se trova `$fetch("/api/events`, `/api/projects`, `/api/organizations`, `/api/limits` o GET `/api/public/invite`. Consente `/api/auth` e i tre bridge anonimi POST contact/waiting-list/RSVP; verifica inoltre che quei bridge non importino repository, Drizzle o service legacy.

- [ ] **Step 2: Migrare un vertical slice completo**

Migrare `useProjects.ts` a `useConvexQuery(api.projects.list)` e `useConvexMutation` per create/update/remove; preservare shape `ProjectItem`, loading, errori e toast. Verificare realtime aprendo due browser context.

- [ ] **Step 3: Migrare eventi, guest e RSVP**

Sostituire uno per volta i composable elencati; mantenere SSR solo per invito pubblico/preview e CSR per dashboard/auth. Gli args non includono mai `organizationId`.

- [ ] **Step 4: Migrare organizzazione e billing**

`organizationStore` salva l'org attiva tramite `api.organizations.setActive`; `useSubscription` chiama wrapper Ceremly Convex e continua a esporre `currentTier`, `isAtelier`, `unlockEvent`, `openCustomerPortal`, `refreshSubscription`.

- [ ] **Step 5: Migrare profilo, export e form pubblici**

`profileStore` usa `api.profile`; i componenti export usano `api.dataExports`; contact, waiting-list e submit RSVP chiamano soltanto i bridge Worker protetti. Gli upload avatar/editor usano presign Convex → PUT R2 → confirm Convex e non inviano più il file al runtime Nuxt.

- [ ] **Step 6: Verificare e commit per vertical slice**

Run: `pnpm vitest run test/migration/frontend-data-layer.test.ts && pnpm typecheck && pnpm test`

Creare commit separati `feat(migration): move projects UI to Convex`, `feat(migration): move events UI to Convex`, `feat(migration): move organization and billing UI to Convex`.

### Task 15: Gestionale `/admin` Convex

**Files:**
- Create: `convex/admin.ts`
- Create: `convex/admin.test.ts`
- Create: `app/layouts/admin.vue`
- Create: `app/middleware/admin.ts`
- Create: `app/pages/admin/index.vue`
- Create: `app/pages/admin/users/index.vue`
- Create: `app/pages/admin/organizations/index.vue`
- Create: `app/pages/admin/events/index.vue`
- Create: `app/pages/admin/jobs/index.vue`
- Create: `app/pages/admin/audit/index.vue`

**Interfaces:**
- Consumes: `appUsers.globalRole`, audit, billing e job retry.
- Produces: query aggregate indicizzate e mutation admin con `reason` obbligatoria.

- [ ] **Step 1: Scrivere test authorization-first**

Ogni export di `convex/admin.ts` chiama `requireSuperAdmin` prima di leggere/scrivere. Testare anonimo, user normale e superAdmin; nessuna query restituisce secret/hash/token completo.

- [ ] **Step 2: Bootstrap controllato del primo superAdmin**

Una internal mutation confronta email normalizzata con `SUPER_ADMIN_EMAIL_ALLOWLIST`, assegna il ruolo e scrive audit. Dopo il bootstrap, modifiche ruolo richiedono superAdmin esistente e motivazione non vuota.

- [ ] **Step 3: Implementare dashboard e ricerca indicizzate**

Metriche: utenti, org, eventi, RSVP, conversioni e stato billing. Pagine: ricerca utenti/org/eventi, limiti custom, subscription read-only con azioni wrapper, job dead/retry, export e audit. Nessuna impersonazione, modifica password o delete irreversibile.

- [ ] **Step 4: Auditare ogni write e verificare UI**

Playwright verifica redirect non-admin, accesso admin, cambio limite con motivo, retry job e record audit con actor/target/timestamp/reason/details.

- [ ] **Step 5: Commit**

```bash
git add convex/admin.ts convex/admin.test.ts app/layouts/admin.vue app/middleware/admin.ts app/pages/admin
git commit -m "feat(migration): add audited Convex admin console"
```

### Task 16: Export cifrato, import, riconciliazione e rehearsal

**Files:**
- Create: `scripts/migration/types.ts`
- Create: `scripts/migration/crypto.ts`
- Create: `scripts/migration/inventory.ts`
- Create: `scripts/migration/export-neon.ts`
- Create: `scripts/migration/import-convex.ts`
- Create: `scripts/migration/reconcile.ts`
- Create: `test/migration/crypto.test.ts`
- Create: `test/migration/reconcile.test.ts`
- Create: `docs/migration/rehearsal.md`

**Interfaces:**
- Consumes: `MIGRATION_ENCRYPTION_KEY` base64 da 32 byte, `MigrationBatch<T>`.
- Produces: bundle AES-256-GCM versionati, manifest SHA-256, `ReconciliationResult[]` ed exit code affidabile.

- [ ] **Step 1: Implementare cifratura autenticata**

Formato file: magic `CEREMLY-MIGRATION-V1`, 12 byte IV, 16 byte auth tag, ciphertext. `crypto.test.ts` prova round-trip, chiave errata, byte alterato e assenza di plaintext nel file.

- [ ] **Step 2: Generare inventario dalla sorgente reale**

Per ciascuna tabella corrente registrare classe `production|ephemeral|regenerable`, count, checksum canonico e destinazione. `session` e `verification` sono `ephemeral/not-imported`; oggetti R2 sono `production/manifest-only`; auth, dominio, audit e billing sono `production/imported`.

- [ ] **Step 3: Esportare a watermark consistente**

`export-neon.ts` legge tutte le tabelle con ordinamento PK, serializza timestamp ISO/JSON canonico, divide in batch da 100, cifra immediatamente e invoca `Buffer.fill(0)` sui buffer plaintext appena cifrati. Il manifest include watermark DB, versione schema e checksum per tabella.

- [ ] **Step 4: Importare e riconciliare**

`import-convex.ts` verifica tag/checksum, invoca auth import e domain import in ordine topologico, può essere rilanciato. `reconcile.ts` confronta count/checksum, riferimenti logici, manifest R2, piani/limiti, customer/subscription/order Creem e produce exit `1` su qualsiasi mismatch.

- [ ] **Step 5: Rehearsal completo staging**

Eseguire due full import e un delta import. Playwright copre password, Google linking, 2FA, tenant isolation, RSVP, checkout, webhook replay, file legacy, varianti, job retry e admin. Cronometrare separatamente export delta, import e reconcile.

- [ ] **Step 6: Gate temporale e commit**

`docs/migration/rehearsal.md` registra comandi, commit SHA, deployment ID, count/checksum, tempi e risultato. Richiede delta+reconcile ≤15 minuti e maintenance simulata ≤30 minuti.

```bash
git add scripts/migration test/migration docs/migration/rehearsal.md
git commit -m "feat(migration): add encrypted rehearsal pipeline"
```

### Task 17: Runbook di cutover e rollback pre-write

**Files:**
- Create: `scripts/migration/preflight.ts`
- Create: `scripts/migration/smoke-production.ts`
- Create: `docs/migration/cutover.md`
- Create: `docs/migration/rollback.md`
- Modify: `shared/constants/siteMode.ts`
- Modify: `server/middleware/0.site-mode.ts`
- Modify: `nuxt.config.ts`

**Interfaces:**
- Produces: modalità `maintenance-readonly`, preflight machine-readable e smoke test read-only.

- [ ] **Step 1: Separare maintenance da read-only**

`maintenance-readonly` consente pagine, login e GET pubbliche ma rifiuta ogni write legacy con `503` e `Retry-After`; consente solo endpoint admin necessari a rollback. Testare che RSVP, checkout, upload e mutation account siano bloccati.

- [ ] **Step 2: Automatizzare il preflight**

`preflight.ts` verifica: dieci gate PASS, rehearsal completato nelle ultime 24 ore sullo stesso commit SHA, backup Neon, export key disponibile, zero job legacy in-flight, webhook secret configurato, DNS TTL approvato, callback Google staging/prod e alert costi attivi. Un fallimento produce exit `1` e non muta sistemi esterni.

- [ ] **Step 3: Scrivere il runbook numerato**

Ordine esatto: attiva read-only Vercel → ferma enqueue legacy → salva watermark → export/import delta → reconcile automatico → checklist manuale → invalida sessioni legacy → cambia Google callback/Creem webhook/DNS → smoke read-only → abilita scritture Convex → monitor intensivo.

- [ ] **Step 4: Definire rollback consentito**

Prima delle prime write Convex: ripristina DNS/callback/webhook, riabilita enqueue e write Vercel, registra incidente. Dopo le prime write Convex: vietato rollback automatico; mantenere Convex authority e applicare fix/migrazione inversa approvata.

- [ ] **Step 5: Default Cloudflare solo dopo GO**

Dopo approvazione manuale del runbook, cambiare il default Nitro da `vercel` a `cloudflare` e rimuovere i cron Vercel dalla config target, mantenendo il commit/tag legacy deployabile.

- [ ] **Step 6: Verificare e commit**

```bash
git add scripts/migration/preflight.ts scripts/migration/smoke-production.ts docs/migration/cutover.md docs/migration/rollback.md shared/constants/siteMode.ts server/middleware/0.site-mode.ts nuxt.config.ts
git commit -m "ops(migration): codify blue-green cutover"
```

### Task 18: Cutover controllato

**Files:**
- Modify: `docs/migration/cutover.md` (registro esecuzione)
- Modify: `docs/migration/gates.md` (decisione finale)

**Interfaces:**
- Consumes: approvazione umana GO, accessi Cloudflare/Convex/Google/Creem/Vercel/Neon.
- Produces: Cloudflare+Convex come authority di produzione oppure rollback pre-write completato.

- [ ] **Step 1: Eseguire preflight senza side effect**

Run: `pnpm tsx scripts/migration/preflight.ts --environment production`

Expected: exit `0` e report firmato con commit/deployment IDs.

- [ ] **Step 2: Richiedere conferma umana immediatamente prima della maintenance**

Non attivare maintenance, cambiare DNS, callback o webhook senza la conferma esplicita dell'operatore responsabile nella finestra concordata.

- [ ] **Step 3: Eseguire il runbook con timestamp**

Ogni comando e risultato viene incollato nel registro; interrompere e applicare rollback pre-write se import/reconcile supera soglie o smoke fallisce. La riapertura write Convex è il punto di non ritorno automatico.

- [ ] **Step 4: Smoke test e osservabilità**

Run: `pnpm tsx scripts/migration/smoke-production.ts --read-only` prima delle write e `pnpm tsx scripts/migration/smoke-production.ts --write-canary` dopo. Controllare login, webhook, RSVP canary, job, R2, error rate e dashboard costi.

- [ ] **Step 5: Commit del registro senza segreti**

```bash
git add docs/migration/cutover.md docs/migration/gates.md
git commit -m "ops(migration): record Cloudflare Convex cutover"
```

### Task 19: Osservazione e rimozione legacy

**Files:**
- Delete after observation: `server/database/**`
- Delete after observation: `server/repositories/**`
- Delete after observation: `server/queue/**`
- Delete after observation: `server/services/**`
- Delete after observation: `server/emailTemplates/**`
- Delete after observation: `server/api/jobs/**`
- Delete after observation: `server/api/cron/**`
- Delete after observation: `server/api/admin/**`
- Delete after observation: `server/api/user/**`
- Delete after observation: `server/api/webhooks/resend.post.ts`, `server/api/webhooks/resend.post.test.ts`
- Delete after observation: `server/api/public/invite/[token].get.ts`, `server/api/public/preview.get.ts`
- Delete after observation: CRUD legacy sotto `server/api/events/**`, `server/api/projects/**`, `server/api/organizations/**`, `server/api/file/**`
- Delete after observation: `server/middleware/1.auth.ts`, `server/middleware/2.organization.ts`
- Delete after observation: `server/utils/auth.ts`, `server/utils/db.ts`, `server/utils/drivers.ts`, `server/utils/permissions.ts`, `server/utils/creem.ts`, `server/utils/email.ts`, `server/utils/audit/**`
- Modify: `package.json`, `pnpm-lock.yaml`, `.env.example`, `nuxt.config.ts`
- Create: `test/migration/no-legacy-runtime.test.ts`
- Create: `docs/migration/observation-closeout.md`

**Interfaces:**
- Consumes: periodo di osservazione formalmente chiuso, zero mismatch e zero rollback aperti.
- Produces: runtime senza Neon, Drizzle, QStash, Upstash applicativo, Sharp, plugin Creem Better Auth e cron Vercel.

- [ ] **Step 1: Definire criteri di chiusura osservazione**

Per almeno 14 giorni consecutivi dopo il cutover: nessun mismatch dati/billing, login success rate entro la baseline approvata, zero cross-tenant incident, webhook lag entro la soglia definita nel gate G07, job dead gestiti entro l'SLA documentato, costi entro il modello G10 e backup verificati. Registrare metriche giornaliere in `observation-closeout.md`.

- [ ] **Step 2: Scrivere test che fallisce finché esistono dipendenze runtime legacy**

Il test scansiona `package.json`, `nuxt.config.ts` e import runtime e rifiuta `@neondatabase/serverless`, `drizzle-orm`, `drizzle-kit`, `@upstash/qstash`, `@upstash/redis`, `sharp`, `@creem_io/better-auth`, `preset: vercel`, `/api/jobs` e `/api/cron`.

- [ ] **Step 3: Rimuovere codice e configurazione legacy**

Eliminare solo i path elencati che non hanno consumer Convex; conservare i migration artifact e gli export cifrati fuori dal repository secondo retention. Rimuovere `NUXT_DATABASE_*`, `NUXT_QSTASH_*`, `NUXT_UPSTASH_*`, `NUXT_CRON_SECRET`, segreti Creem/Resend spostati in Convex e config Vercel. Conservare `server/api/public/pixel/[...token].get.ts` come bridge Worker sottile per compatibilità URL, delegando ogni validazione e write a una mutation Convex senza import legacy.

- [ ] **Step 4: Verifica finale completa**

Run:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm typecheck:convex
pnpm test
pnpm test:migration
pnpm build:cloudflare
pnpm wrangler deploy --dry-run --outdir .wrangler/final-dry-run
```

Expected: tutti exit `0`; ricerca legacy senza match runtime.

- [ ] **Step 5: Commit finale**

```bash
git add -A
git commit -m "refactor(migration): retire Vercel Neon and Upstash runtime"
```

## Self-review checklist

- [ ] Tutti i dieci spike della spec hanno un gate, un comando e un file evidenza.
- [ ] Password, Google, 2FA, session invalidation e recovery sono coperti.
- [ ] Org/RBAC non dipende dal plugin Organization e non accetta authority client.
- [ ] Creem usa organization ID come entity e webhook idempotente.
- [ ] R2 non cambia bucket/chiavi e le varianti non falliscono silenziosamente.
- [ ] Job/action hanno retry persistito, massimo tentativi, DLQ e retry admin.
- [ ] `/admin` usa `superAdmin`, non include impersonazione e audita le write.
- [ ] Rate limit distingue traffico Worker da chiamate Convex dirette.
- [ ] Il modello costi include subscription re-execution fan-out.
- [ ] Rehearsal valida count, checksum, riferimenti, billing e R2.
- [ ] Cutover ha punto di non ritorno e rollback pre-write esplicito.
- [ ] La rimozione legacy avviene solo dopo osservazione formalmente chiusa.
- [ ] Nessun task introduce doppia scrittura di produzione.
- [ ] I nomi delle interfacce condivise sono coerenti in tutti i task.

## Riferimenti verificati il 2026-09-15

- Cloudflare Nuxt Workers: `https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/nuxt/`
- Cloudflare existing project autoconfig: `https://developers.cloudflare.com/workers/framework-guides/automatic-configuration/`
- Convex scheduled functions: `https://docs.convex.dev/scheduling/scheduled-functions`
- Convex testing: `https://docs.convex.dev/testing/convex-test`
- Better Auth component: `https://labs.convex.dev/better-auth`
- Better Auth 0.12 migration: `https://labs.convex.dev/better-auth/migrations/migrate-to-0-12`
- Creem Convex component: `https://docs.creem.io/code/sdks/convex/quickstart`
