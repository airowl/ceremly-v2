# Consolidamento ambienti: da 3 (dev/staging/prod) a 2 (dev/prod)

**Data:** 2026-06-21
**Tipo:** Refactor infrastruttura + cleanup codice
**Stato:** Design approvato (brainstorming), pronto per il piano d'implementazione

---

## 1. Obiettivo

Ridurre gli ambienti del progetto da **tre** (dev / staging / prod) a **due** (dev / prod), eliminando lo "staging" che è già di fatto degenere. Il modello target adotta la convenzione idiomatica di Vercel:

- **dev** → ambiente **Preview** di Vercel (branch git `dev`), più lo sviluppo **locale** su `localhost:3000`.
- **prod** → ambiente **Production** di Vercel (branch git `main`).

Non è un cambiamento strutturale profondo: è la **formalizzazione di una direzione già imboccata** (branch Neon `staging` già eliminato il 2026-06-19, `.env.staging` già orfano a livello di codice) più la chiusura di alcuni residui e di un buco di billing che il nuovo modello attiva.

---

## 2. Stato attuale (verificato sul codice e su Vercel, 2026-06-21)

### 2.1 File env (gitignored; solo `.env.example` è committato)
| File | Ruolo | Creem key (prefisso) |
|------|-------|----------------------|
| `.env` | dev locale | `creem_test_…` |
| `.env.staging` | staging (**orfano**: nessun codice lo legge) | `placeholder…` |
| `.env.prod` | prod | `placeholder…` |
| `.env.example` | template committato | — |

`.gitignore`: `.env`, `.env.*`, `!.env.example`.

### 2.2 Come l'app riconosce l'ambiente
- **`NUXT_ENV`** (valori `dev|staging|prod`): usato **solo dal tooling** build/CLI (drizzle, seed). Logica già ternaria a 2 vie (`=== "prod" ? … : …`) → `staging` cade già nel ramo `dev`.
- **`NODE_ENV`** (`development|production`): unico discriminatore a runtime. Su Vercel **ogni** deploy (Preview e Production) ha `NODE_ENV=production` → **a runtime staging ≡ prod**, e Preview ≡ Production.
- **`appEnv`** (`server/utils/runtimeConfig.ts:80` = `process.env.NODE_ENV`): esposto in `runtimeConfig.public`. **NON è dead code** — vedi §5.
- **`NUXT_NITRO_PRESET`** (`node-server|vercel`): preset Nitro, build-time.

### 2.3 Bug attivo: `.env.production` inesistente
Il tooling cerca `.env.production`, ma il file reale è `.env.prod`. `pnpm db:migrate:prod` (che setta `NUXT_ENV=prod`) carica un file inesistente → fallback silenzioso su `process.env`. 10 occorrenze nel repo principale:
- `server/database/drizzle.config.ts:5`
- `server/database/seed/index.ts:6`, `reset.ts:5`, `verify-rbac.ts:12`, `verify-rate-limit.ts:5`, `verify-isolation.ts:8`, `verify-isolation-api.ts:12`, `verify-signup-org.ts:7`, `verify-account-purge.ts:9`, `verify-plan-limit.ts:7`

### 2.4 Neon (già a 2 branch)
- `main` (`ep-dark-dream`) → prod
- `dev` (`ep-mute-fire`) → dev locale **e** Preview (condiviso)
- branch Neon `staging` → **già eliminato** (2026-06-19)

### 2.5 Vercel (progetto `ceremly-v2`, team `airowls-projects`)
- **Production** (branch `main`): 39 var.
- **Preview** (generico, tutti i branch): 39 var.
- **Preview (staging)**: 39 var **branch-scoped al git branch `staging`** ← lo "staging" residuo da smontare.
- **Development**: vuoto (si usa `.env` locale).
- Domini sul team: solo `jaitechs.com`, `airowlgasga.dev`. **`ceremly.com` NON è collegato a Vercel.**

### 2.6 Email (invariato, fuori scope)
dev/staging → `airowlgasga.dev`; prod → `ceremly.com`.

---

## 3. Modello target

| | **dev — locale** | **dev — Vercel Preview** | **prod — Vercel Production** |
|---|---|---|---|
| Branch git | `dev` | `dev` | `main` |
| Branch Neon | `dev` | `dev` | `main` |
| `NUXT_PUBLIC_BASE_URL` | `http://localhost:3000` | `https://dev.ceremly.com` | `https://ceremly.com` |
| Preset | `node-server` | `vercel` | `vercel` |
| `NUXT_ENV` | `dev` | `dev` | `prod` |
| Creem `testMode` | `true` | `true` | `false` |
| Email mittente | `airowlgasga.dev` | `airowlgasga.dev` | `ceremly.com` |
| R2 / Redis | dev | dev | prod |

**Vincolo fermo:** il locale resta su `localhost:3000`. `NUXT_PUBLIC_BASE_URL=http://localhost:3000` in `.env` **non si tocca**.

**Dominio dev:** `dev.ceremly.com` (sottodominio di `ceremly.com`, costo extra 0). Locale e Preview condividono il branch Neon `dev` (già così): rischio = rumore di dati di test, **non** corruzione schema (`build` = `nuxt build`, nessun `db:migrate` automatico in deploy).

---

## 4. Modifiche nel repo (le esegue Claude)

1. **Elimina `.env.staging`** (file locale gitignored).
2. **`.env.example`**: `NUXT_ENV` → commento `dev | prod` (rimuovi `staging`); correggi l'header (oggi cita `.env.local`/`.env.production` → allinea a `.env`/`.env.prod`).
3. **Fix bug naming** (§2.3): nelle 10 occorrenze, `.env.production` → `.env.prod`. Verifica che `pnpm db:migrate:prod` poi carichi il file giusto.
4. **Fix billing Creem `testMode`** (§5).
5. **Pulizia docs**: aggiorna i riferimenti a "staging" al modello a 2 ambienti in `docs/base/LOCAL-DEV-SERVICES.md`, `docs/base/EMAIL-ARCHITECTURE.md`, `docs/superpowers/specs/2026-06-18-local-dev-services-design.md`, `docs/security/NUXT_ADMIN_API_KEY.md`. (I plan storici in `docs/superpowers/plans/` sono archivio: non riscriverli.)

---

## 5. Fix billing: `testMode` di Creem da `VERCEL_ENV`

### Problema
`appEnv = NODE_ENV`, e Creem fa `testMode: appEnv !== "production"`. Su Vercel ogni deploy (Preview incluso) ha `NODE_ENV=production` → quando `dev.ceremly.com` (Preview) sarà attivo, Creem girerebbe in modalità **non-test**. L'app non sa distinguere Preview da Production a runtime.

### Perché `VERCEL_ENV` e non `NUXT_ENV`
- `NUXT_ENV` è **manuale**: se non settato sull'ambiente Production di Vercel, il flag andrebbe in default sbagliato e **la prod non incasserebbe** (`testMode:true`). Si scambierebbe un bug-dev con un bug-prod.
- `VERCEL_ENV` è **auto-iniettato** da Vercel (`production|preview`), non dimenticabile, corretto per ogni deploy a build e runtime.

### Implementazione
- Esporre in `runtimeConfig.public` un flag dedicato, es. `isProdDeployment: process.env.VERCEL_ENV === "production"`.
- Puntare a quel flag **solo** i 3 punti Creem:
  - `server/utils/creem.ts:93` → `testMode: !runtimeConfig.public.isProdDeployment`
  - `server/services/checkout.service.ts:52`
  - `server/services/eventReconcile.service.ts:45`
- Aggiornare i 2 test che oggi pilotano `testMode` via `appEnv`: `server/services/checkout.service.test.ts:32`, `server/services/eventReconcile.service.test.ts:34`.

### Cosa NON toccare
`server/utils/auth.ts:354` abilita l'openAPI con `appEnv === "development"` (= **solo locale**). È un asse diverso (local-only vs non-production-deployment): **non** instradarlo sul nuovo flag, altrimenti gli API docs verrebbero esposti sul `dev.ceremly.com` pubblico. `appEnv` resta com'è per questo uso.

### Tempistica
Il rischio è **prospettico** (oggi le key Creem su Preview/Production sono placeholder). Il fix **deve** essere in `main` **prima** di scrivere una key Creem **live** su Production.

---

## 6. Modifiche infrastruttura Vercel (le esegue l'utente, Claude guida passo-passo)

Le env `NUXT_*` su Vercel sono **Sensitive**: `vercel env pull` le scarica vuote. Source of truth = file locali. Modifiche via dashboard o `printf '%s' "$val" | vercel env add KEY <env>` (stdin).

- **A.** Collegare `ceremly.com` a Vercel + zona DNS (Cloudflare). Precondizione per prod e per `dev.ceremly.com`.
- **B.** Aggiungere il dominio `dev.ceremly.com` al progetto e **assegnarlo al branch `dev`** (branch domain → URL stabile per i webhook).
- **C.** **Rimuovere l'ambiente `Preview (staging)`** (39 var branch-scoped al git branch `staging`) + l'eventuale branch git `staging`.
- **D.** Allineare le env **`Preview`** generiche ai valori **dev**: `NUXT_ENV=dev`, `NUXT_PUBLIC_BASE_URL=https://dev.ceremly.com`, DB branch dev, R2/Redis dev, Creem **test** key.

---

## 7. Fuori scope (debito collaterale, solo annotato)

Da non risolvere in questo lavoro, ma registrato perché emerso durante l'analisi:

- **Env Creem stale su Vercel**: Production e Preview hanno ancora i 6 product ID `STARTER/PREMIUM/AGENCY_{MONTH,YEAR}` (modello B2B **già rimosso dal codice**, che ora usa `CELEBRATION`/`ATELIER`). Da riconciliare nel lavoro di go-live Creem.
- **Placeholder security-critical su prod**: `NUXT_ADMIN_API_KEY`, `NUXT_CRON_SECRET`, chiavi Creem ancora placeholder su `.env.prod`/Vercel Production. Da sostituire prima del go-live.
- **Email**: mapping domini invariato.
- **Isolamento R2 dev/Preview**: continuano a condividere il bucket `ceremly-dev` (accettato).

---

## 8. Rischi e precondizioni

- **`dev.ceremly.com` dipende da `ceremly.com`** collegato a Vercel/DNS (passo A). Finché non è pronto, lo sviluppo locale su `localhost:3000` non è impattato.
- **Ordine sul fix billing**: §5 in `main` prima di qualsiasi key Creem live su Production.
- **Rename `.env.production`→`.env.prod`**: a rename fatto, `db:migrate:prod` deve essere ri-testato (a vuoto) per confermare che carica `.env.prod`.

---

## 9. Criteri di completamento

- [ ] `.env.staging` rimosso; `.env.example` aggiornato (`NUXT_ENV=dev|prod`, header coerente).
- [ ] Nessuna occorrenza di `.env.production` nel repo principale; `db:migrate:prod` carica `.env.prod`.
- [ ] Creem `testMode` deriva da `VERCEL_ENV` nei 3 punti; test aggiornati e verdi; `auth.ts` openAPI invariato.
- [ ] `typecheck` + `lint` + test verdi.
- [ ] Docs allineate al modello a 2 ambienti.
- [ ] (Infra, utente) `ceremly.com` collegato, `dev.ceremly.com` assegnato al branch `dev`, ambiente `Preview (staging)` rimosso, env `Preview` allineate a dev.
