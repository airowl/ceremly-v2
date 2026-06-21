# Consolidamento ambienti (dev/prod) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ridurre il codice da 3 ambienti (dev/staging/prod) a 2 (dev/prod), eliminare lo "staging" residuo, correggere il bug `.env.production` e chiudere il buco di billing Creem `testMode` su Vercel Preview.

**Architecture:** Solo modifiche al repo. La distinzione a runtime tra Preview e Production passa da un flag `isProdDeployment` derivato da `VERCEL_ENV` (auto-iniettato da Vercel), esposto in `runtimeConfig.public` e consumato dai 3 punti Creem. Il tooling DB continua a usare `NUXT_ENV` (build/CLI), ora ridotto a `dev|prod`. Le operazioni infrastrutturali su Vercel/DNS sono manuali (sezione finale, non task).

**Tech Stack:** Nuxt 4 + Nitro (preset vercel), TypeScript, Drizzle Kit, Vitest, Creem (`@creem_io/better-auth`).

**Spec di riferimento:** `docs/superpowers/specs/2026-06-21-consolidamento-ambienti-dev-prod-design.md`

## Global Constraints

- Il locale resta su `localhost:3000`: `NUXT_PUBLIC_BASE_URL=http://localhost:3000` in `.env` **non si tocca**.
- Il fix billing (Task 2) deve essere in `main` **prima** di scrivere una key Creem **live** su Production.
- `server/utils/auth.ts:354` (openAPI) resta su `runtimeConfig.public.appEnv === "development"` (asse local-only): **NON** instradarlo sul nuovo flag.
- `typecheck` + `lint` + test verdi prima di ogni commit.
- Push sul remoto **sempre manuale** (lo fa l'utente); i commit automatici sono OK.
- Branch di lavoro: `dev`.

---

## File Structure

- `server/database/drizzle.config.ts` + `server/database/seed/*.ts` (9 file) — bug naming `.env.production` → `.env.prod` (Task 1).
- `server/utils/runtimeConfig.ts` — nuovo flag `isProdDeployment` in `public` (Task 2).
- `server/utils/creem.ts`, `server/services/checkout.service.ts`, `server/services/eventReconcile.service.ts` — `testMode` dal nuovo flag (Task 2).
- `server/services/checkout.service.test.ts`, `server/services/eventReconcile.service.test.ts` — mock aggiornati + scenario Preview (Task 2).
- `.env.staging` (eliminato), `.env.example` — `NUXT_ENV=dev|prod`, header e commenti coerenti (Task 3).
- `vitest.config.ts` + 5 file docs — pulizia riferimenti "staging" (Task 4).

---

## Task 1: Fix bug naming `.env.production` → `.env.prod`

**Files:**
- Modify: `server/database/drizzle.config.ts:5`
- Modify: `server/database/seed/index.ts:6`, `reset.ts:5`, `verify-rbac.ts:12`, `verify-rate-limit.ts:5`, `verify-isolation.ts:8`, `verify-isolation-api.ts:12`, `verify-signup-org.ts:7`, `verify-account-purge.ts:9`, `verify-plan-limit.ts:7`

**Interfaces:**
- Consumes: niente.
- Produces: niente (cambio interno; `NUXT_ENV=prod` ora carica il file `.env.prod` realmente esistente).

Nota: questo è un fix su stringhe di config — il "ciclo di test" è una verifica `grep` deterministica, non un unit test. Tutte le 10 occorrenze hanno lo stesso literal `".env.production"` dentro il pattern `process.env.NUXT_ENV === "prod" ? ".env.production" : ".env"`; solo `.env.production` cambia, `.env` resta.

- [ ] **Step 1: Verifica pre-fix (il bug è presente, 10 occorrenze)**

Run:
```bash
grep -rn '\.env\.production' server/database --include='*.ts'
```
Expected: 10 righe (drizzle.config.ts:5 + 9 file seed).

- [ ] **Step 2: Applica la sostituzione su tutti i file**

Run (macOS / BSD sed — nota la stringa vuota dopo `-i`):
```bash
grep -rl '\.env\.production' server/database --include='*.ts' | xargs sed -i '' 's#\.env\.production#.env.prod#g'
```

- [ ] **Step 3: Verifica post-fix**

Run:
```bash
grep -rn '\.env\.production' server/database --include='*.ts'   # atteso: nessun output (exit 1)
grep -rcn '\.env\.prod"' server/database --include='*.ts' | grep -c ':1'  # atteso: 10 file con 1 occorrenza
```
Expected: prima riga vuota; il pattern ora è `... === "prod" ? ".env.prod" : ".env"`.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (nessun errore introdotto — sono solo stringhe).

- [ ] **Step 5: Commit**

```bash
git add server/database
git commit -m "fix(db): tooling cerca .env.prod non .env.production"
```

---

## Task 2: Fix billing — Creem `testMode` da `VERCEL_ENV`

**Files:**
- Modify: `server/utils/runtimeConfig.ts:80` (aggiunta `isProdDeployment` in `public`)
- Modify: `server/utils/creem.ts:93`, `server/services/checkout.service.ts:52`, `server/services/eventReconcile.service.ts:45`
- Test: `server/services/checkout.service.test.ts:26-35`, `server/services/eventReconcile.service.test.ts:30-37`

**Interfaces:**
- Consumes: `process.env.VERCEL_ENV` (auto-iniettato da Vercel: `"production"` su Production, `"preview"` su Preview, `undefined` in locale).
- Produces: `runtimeConfig.public.isProdDeployment: boolean` — `true` solo sul deploy Production di Vercel. I 3 punti Creem calcolano `testMode: !runtimeConfig.public.isProdDeployment`.

Razionale del test: oggi i mock usano `appEnv: "development"`. Li cambiamo a `appEnv: "production"` (= NODE_ENV su Vercel) **+** `isProdDeployment: false` per simulare l'ambiente **Preview** — esattamente il caso del buco. Con il codice attuale (`testMode: appEnv !== "production"`) `testMode` risulta `false` e l'asserzione `testMode: true` fallisce; dopo il fix (`testMode: !isProdDeployment`) risulta `true`.

> **Limite del test (importante):** questi test mockano interamente `runtimeConfig`, quindi provano solo che i 3 consumatori leggono correttamente `isProdDeployment`. **Non** provano che `process.env.VERCEL_ENV` si risolva al valore giusto a runtime su Vercel (la detection dell'ambiente è proprio ciò che il mock sostituisce). Quella risoluzione va confermata su un deploy reale — vedi sezione infra punto **F**, da fare prima della key Creem live.

- [ ] **Step 1: Aggiorna il mock in `checkout.service.test.ts` per simulare Preview**

In `server/services/checkout.service.test.ts`, sostituisci il blocco `public` del mock (righe 30-33):
```typescript
        public: {
            baseURL: "https://example.com",
            appEnv: "development",
        },
```
con:
```typescript
        public: {
            baseURL: "https://example.com",
            // Scenario Vercel Preview: NODE_ENV=production ma deployment non-prod.
            appEnv: "production",
            isProdDeployment: false,
        },
```

- [ ] **Step 2: Aggiorna il mock in `eventReconcile.service.test.ts` per simulare Preview**

In `server/services/eventReconcile.service.test.ts`, sostituisci il blocco `public` del mock (righe 33-35):
```typescript
        public: {
            appEnv: "development",
        },
```
con:
```typescript
        public: {
            // Scenario Vercel Preview: NODE_ENV=production ma deployment non-prod.
            appEnv: "production",
            isProdDeployment: false,
        },
```

- [ ] **Step 3: Esegui i 2 test → devono FALLIRE (red)**

Run:
```bash
npx vitest run server/services/checkout.service.test.ts server/services/eventReconcile.service.test.ts
```
Expected: FAIL. Le asserzioni `expect(createCreemClient).toHaveBeenCalledWith({ apiKey: "test_api_key", testMode: true })` ricevono `testMode: false` (perché il codice usa ancora `appEnv !== "production"` e `appEnv` ora è `"production"`).

- [ ] **Step 4: Aggiungi il flag `isProdDeployment` in `runtimeConfig.public`**

In `server/utils/runtimeConfig.ts`, dentro il blocco `public:` (subito dopo la riga 80 `appEnv: process.env.NODE_ENV,`), aggiungi:
```typescript
            appEnv: process.env.NODE_ENV,
            // true SOLO sul deploy Production di Vercel. VERCEL_ENV è auto-iniettato
            // (production|preview); NODE_ENV invece è "production" anche in Preview,
            // quindi non distingue gli ambienti. Pilota il testMode di Creem.
            isProdDeployment: process.env.VERCEL_ENV === "production",
```

- [ ] **Step 5: Punta i 3 consumatori Creem al nuovo flag**

In `server/utils/creem.ts:93`, `server/services/checkout.service.ts:52`, `server/services/eventReconcile.service.ts:45`, sostituisci (identico in tutti e tre):
```typescript
        testMode: runtimeConfig.public.appEnv !== "production",
```
con:
```typescript
        testMode: !runtimeConfig.public.isProdDeployment,
```
(Attenzione all'indentazione: `eventReconcile.service.ts:45` è indentato di 12 spazi, gli altri due di 8.) **Non** toccare `server/utils/auth.ts:354` (openAPI, resta su `appEnv === "development"`).

- [ ] **Step 6: Esegui i 2 test → devono PASSARE (green)**

Run:
```bash
npx vitest run server/services/checkout.service.test.ts server/services/eventReconcile.service.test.ts
```
Expected: PASS. `testMode: !false = true`.

- [ ] **Step 7: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/utils/runtimeConfig.ts server/utils/creem.ts server/services/checkout.service.ts server/services/eventReconcile.service.ts server/services/checkout.service.test.ts server/services/eventReconcile.service.test.ts
git commit -m "fix(billing): Creem testMode da VERCEL_ENV, non NODE_ENV

NODE_ENV=production anche su Vercel Preview, quindi appEnv non distingue
Preview da Production: dev.ceremly.com avrebbe usato Creem in modalita
non-test. Nuovo flag isProdDeployment (VERCEL_ENV===production) pilota i
3 punti testMode. openAPI (auth.ts) resta local-only su NODE_ENV."
```

---

## Task 3: Elimina `.env.staging` e aggiorna `.env.example`

**Files:**
- Delete: `.env.staging` (gitignored, non tracciato)
- Modify: `.env.example` (righe 4, 7, 8, 16, 105)

**Interfaces:**
- Consumes: niente.
- Produces: template `.env.example` coerente col modello a 2 ambienti.

- [ ] **Step 1: Elimina il file staging**

Run:
```bash
rm -f .env.staging && ls .env.staging 2>&1 | grep -q 'No such file' && echo "rimosso"
```
Expected: `rimosso`. (Il file è gitignored: non serve `git rm`.)

- [ ] **Step 2: Aggiorna l'header di `.env.example` (righe 4, 7, 8)**

Sostituisci:
```
# Setup: cp .env.example .env.local
```
con:
```
# Setup: cp .env.example .env
```
Sostituisci:
```
#   - .env.local      → Local development (gitignored)
#   - .env.production → Production deployment (gitignored)
```
con:
```
#   - .env       → Local development / dev (gitignored)
#   - .env.prod  → Production deployment (gitignored)
```

- [ ] **Step 3: Riduci `NUXT_ENV` a `dev | prod` (riga 16)**

Sostituisci:
```
NUXT_ENV=dev                                     # dev | staging | prod
```
con:
```
NUXT_ENV=dev                                     # dev | prod
```

- [ ] **Step 4: Rimuovi "staging" dal commento QStash (riga 105)**

Sostituisci:
```
#   - prod/staging: token set → publish to QStash cloud (delivers to your base URL).
```
con:
```
#   - prod: token set → publish to QStash cloud (delivers to your base URL).
```

- [ ] **Step 5: Verifica**

Run:
```bash
grep -ni staging .env.example   # atteso: nessun output (exit 1)
ls .env.staging 2>&1            # atteso: No such file or directory
```
Expected: nessun riferimento "staging" in `.env.example`; file staging assente.

- [ ] **Step 6: Commit**

```bash
git add .env.example
git commit -m "chore(env): rimuove staging da .env.example, allinea naming file"
```

---

## Task 4: Pulizia riferimenti "staging" in docs e config

**Files:**
- Modify: `vitest.config.ts:12` (commento codice)
- Modify: `docs/base/LOCAL-DEV-SERVICES.md`, `docs/base/EMAIL-ARCHITECTURE.md`, `docs/superpowers/specs/2026-06-18-local-dev-services-design.md`, `docs/security/NUXT_ADMIN_API_KEY.md`, `docs/superpowers/specs/2026-06-19-resend-webhooks-design.md`

**Interfaces:** nessuna (commenti e prosa).

Principio di riscrittura: "dev/staging" → "dev"; "test/staging (Vercel)" → "dev (Vercel Preview)"; rimuovi la nozione di un terzo ambiente. Non riscrivere i plan in `docs/superpowers/plans/` (archivio) né lo spec corrente (`2026-06-21-...`, dove "staging" è il tema).

- [ ] **Step 1: `vitest.config.ts:12` (commento codice)**

Sostituisci:
```typescript
        // I test DB-backed toccano il branch Neon dev (condiviso dev/staging):
```
con:
```typescript
        // I test DB-backed toccano il branch Neon dev (condiviso con i deploy Preview):
```

- [ ] **Step 2: `docs/security/NUXT_ADMIN_API_KEY.md:182`**

Sostituisci `Valore diverso tra dev, staging e prod` con `Valore diverso tra dev e prod`.

- [ ] **Step 3: `docs/superpowers/specs/2026-06-19-resend-webhooks-design.md:133`**

Sostituisci `(prod=main, dev/staging=dev)` con `(prod=main, dev=dev)`.

- [ ] **Step 4: `docs/base/EMAIL-ARCHITECTURE.md` (righe 106, 115)**

- Riga 106: intestazione colonna `| ... | Prod | Dev/Staging |` → `| ... | Prod | Dev |`.
- Riga 115: `prod ceremly.com, dev/staging airowlgasga.dev` → `prod ceremly.com, dev airowlgasga.dev`.

- [ ] **Step 5: `docs/base/LOCAL-DEV-SERVICES.md` (righe 5, 26, 37, 48-50, 52, 55)**

- Riga 5: `staging e prod sono tutto cloud` → `i deploy Preview e prod sono tutto cloud`.
- Riga 26: colonna `test/staging (Vercel)` → `dev (Vercel Preview)`.
- Riga 37: `Modello a **2 account**: uno *non-prod* (dev + test/staging), uno *prod* separato.` → `Modello a **2 account**: uno *non-prod* (dev locale + Preview), uno *prod* separato.`
- Righe 48-50, sostituisci:
```
Verificato: DB, Redis, QStash e base URL sono già separati per ambiente. **Eccezione:
staging e prod condividono lo stesso bucket R2** → i file si mescolano. Inoltre in dev
il public URL R2 è un placeholder.
```
con:
```
Verificato: DB, Redis, QStash e base URL sono già separati per ambiente. In dev
il public URL R2 è un placeholder.
```
- Riga 52: `1. Crea un bucket R2 **dev** e uno **test** (oltre a quello prod esistente).` → `1. Crea un bucket R2 **dev** (oltre a quello prod esistente).`
- Riga 55: elimina interamente la riga `   - staging: bucket + public URL **test**, distinti da prod.`

- [ ] **Step 6: `docs/superpowers/specs/2026-06-18-local-dev-services-design.md` (righe 11, 17, 22, 96, 101, 108)**

Questo è uno spec storico: aggiungi in cima una nota di superamento e neutralizza i riferimenti staging:
- In testa al file, dopo il titolo, inserisci: `> **Nota (2026-06-21):** lo "staging" descritto qui è stato eliminato — vedi 2026-06-21-consolidamento-ambienti-dev-prod-design.md. I riferimenti sotto sono storici.`
- Sostituisci le occorrenze `test/staging` → `dev (Preview)` e `staging↔prod` → `dev↔prod` dove compaiono (righe 11, 17, 22, 96, 101, 108).

- [ ] **Step 7: Verifica**

Run:
```bash
grep -rni staging docs/base docs/security vitest.config.ts
grep -rni staging docs/superpowers/specs/2026-06-18-local-dev-services-design.md docs/superpowers/specs/2026-06-19-resend-webhooks-design.md | grep -v 'Nota (2026-06-21)'
```
Expected: nessuna occorrenza "staging" residua (eccetto eventualmente la nota di superamento dello Step 6).

- [ ] **Step 8: Commit**

```bash
git add vitest.config.ts docs/
git commit -m "docs: allinea riferimenti staging al modello a 2 ambienti"
```

---

## Operazioni infrastruttura (manuali — le esegue l'utente)

Queste **non** sono task di codice: sono azioni su Vercel/Cloudflare/Neon. L'ordine conta (A precede B). Le env `NUXT_*` su Vercel sono *Sensitive*: usare la dashboard o `printf '%s' "$val" | vercel env add KEY <env>` (stdin); `vercel env pull` le scarica vuote.

- [ ] **A.** Collegare `ceremly.com` a Vercel + zona DNS (Cloudflare). Precondizione per prod e per `dev.ceremly.com`.
- [ ] **B.** Aggiungere il dominio `dev.ceremly.com` al progetto `ceremly-v2` e assegnarlo al **branch `dev`** (branch domain → URL stabile per i webhook).
- [ ] **C.** Rimuovere l'ambiente Vercel `Preview (staging)` (39 var branch-scoped al git branch `staging`) + l'eventuale branch git `staging`.
- [ ] **D.** Allineare le env Vercel **Preview** ai valori dev: `NUXT_ENV=dev`, `NUXT_PUBLIC_BASE_URL=https://dev.ceremly.com`, DB branch dev, R2/Redis dev, Creem **test** key. Verificare che `VERCEL_ENV` NON sia impostato a mano (deve restare quello auto di Vercel).
- [ ] **E.** (debito collaterale, correlato) Riconciliare le env Creem stale su Production + Preview: rimuovere i 6 `NUXT_CREEM_PRODUCT_ID_STARTER/PREMIUM/AGENCY_{MONTH,YEAR}`, aggiungere `CELEBRATION`/`ATELIER`; sostituire i placeholder con valori reali **prima** del go-live. **Vincolo:** la key Creem **live** su Production solo dopo che il Task 2 è in `main`.
- [ ] **F.** **Verifica runtime del flag billing (bloccante prima della key Creem live).** I test verdi del Task 2 NON coprono la risoluzione di `VERCEL_ENV` a runtime (la mockano). Quindi: (1) su Vercel, `Project Settings → Environment Variables → "Automatically expose System Environment Variables"` deve essere **ON** (altrimenti `VERCEL_ENV` non raggiunge il runtime e `isProdDeployment` sarebbe sempre `false`); (2) con un campo di debug temporaneo o un `console.log`, conferma **positivamente** che `runtimeConfig.public.isProdDeployment === true` su un deploy **Production** e `=== false` su un deploy **Preview**; (3) rimuovi il debug dopo la conferma.

---

## Self-Review

**Spec coverage:**
- §4.1 elimina `.env.staging` → Task 3 Step 1. ✅
- §4.2 `.env.example` (NUXT_ENV + header) → Task 3 Step 2-4. ✅
- §4.3 bug naming `.env.production`→`.env.prod` (10 punti) → Task 1. ✅
- §4.4 fix billing Creem `VERCEL_ENV` → Task 2. ✅
- §4.5 pulizia docs (+ resend-webhooks-design) → Task 4 Step 2-6. ✅
- §4.6 residui codice (vitest.config.ts:12, .env.example:105) → Task 4 Step 1 + Task 3 Step 4. ✅
- §5 implementazione `isProdDeployment` + mock parziali → Task 2 Step 4 + note Step 1-2. ✅
- §6 infra Vercel → sezione "Operazioni infrastruttura". ✅
- §7 debito collaterale (Creem stale, placeholder) → sezione infra punto E. ✅

**Placeholder scan:** nessun "TBD"/"handle edge cases"/codice mancante. Le modifiche di prosa nei docs (Task 4) mostrano la sostituzione concreta per ogni riga.

**Type consistency:** `isProdDeployment` (boolean) definito in `runtimeConfig.public` (Task 2 Step 4) e consumato come `!runtimeConfig.public.isProdDeployment` nei 3 punti (Step 5) e nei mock (Step 1-2). Nome e tipo coerenti ovunque.
