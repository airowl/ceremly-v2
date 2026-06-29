# Ceremly — Production Readiness Assessment (2026-06-27)

> Valutazione multi-agente (feature-completeness + deploy-readiness + security risk-sweep) con verifica
> diretta dello stato DB di produzione (Neon branch `main`) e del working tree. Aggiorna — non sostituisce —
> `CODE-REVIEW-PRODUCTION-READINESS.md` (2026-06-17, precedente al lavoro tema invito + consolidamento ambienti).

## Verdetto

**Il codice di `dev` è near-ready per il merge in `main`. Il go-live OPERATIVO NON è fatto.**

La domanda "è pronto per la produzione?" si divide in due:

1. **Codice `dev` pronto per merge → `main`?** → **Quasi sì.** Zero bloccanti di sicurezza/cross-tenant,
   tutte e 8 le feature core MVP complete end-to-end, build health verde. Restano 2 task di *codice*
   prima del merge (rimuovere endpoint debug, ri-eseguire i gate).
2. **Checklist operativa di go-live completa?** → **No.** `main` (prod) è **28 commit indietro** rispetto a
   `dev`; la migrazione **0010 non è applicata** in prod; env Creem-live / Admin sono placeholder; webhook
   Resend non registrato.

Rischio complessivo **basso**: prod ha solo dati di smoke-test (2 user, 2 org, 1 evento, 1 subscription, **0 guest**),
nessun cliente reale.

## Build health (dev HEAD, 2026-06-27)

| Check | Esito |
|---|---|
| `typecheck` | ✅ EXIT=0 (solo warning benigni nuxt-site-config/robots) |
| `test` | ✅ **132/132** passati (29 file) |
| `build` | ✅ EXIT=0 |
| `lint` | ⚠️ EXIT=1 — solo `vue/require-default-prop` stilistici, pre-esistenti repo-wide, non enforced |

## Stato DB produzione (verificato via Neon — branch `main` `br-flat-block-a2u92hp5`)

- `drizzle.__drizzle_migrations` = **10 righe (0000 → 0009)**. **Manca 0010.**
- `events`: ha `palette`(text) + `invite_font`(text), **NON ha `theme`(jsonb)** → conferma indipendente: prod è a 0009.
- Dati: 2 user · 2 org · 1 evento · 1 subscription · 0 guest → smoke-test.

## Feature MVP — 8/8 complete end-to-end

Eventi (CRUD+wizard+editor) · blocchi invito · RSVP con domande custom · gestione ospiti (import/CRUD) ·
distribuzione email (QStash) · reminder (cron) · tema invito custom · pagamenti Creem
(free/celebration/atelier + sblocco evento via webhook idempotente). Flusso pubblico ospite completo
("Salva in agenda" Google Calendar + .ics). Le feature rinviate a Phase 2/3 dalla spec (gruppi condizionali,
broadcast, pagina live, gallery collaborativa) **non** sono gap MVP.

## Sicurezza — zero bloccanti

Isolamento tenant verificato sulle WHERE reali (distribuzione, RSVP pubblico, anteprima HMAC, webhook Resend):
nessun leak cross-tenant. Input tema (4 hex + font da catalogo whitelisted) validato server-side, nessuna
injection CSS/JS. Nessun secret hardcoded oltre all'endpoint debug (sotto).

---

## ⛔ Bloccanti go-live (ordinati per dipendenza)

> **Strategia: MIGRATE-FIRST (zero-downtime).** `git grep` su `main` non trova alcun accesso DB a
> `events.palette`/`events.theme` nel codice prod attuale → applicare 0010 PRIMA del deploy è sicuro.
> Deploy-first invece manderebbe `/e/**` e `/api/public/preview` in **500** finché la migrazione non gira.

| # | Item | Owner | Azione |
|---|------|-------|--------|
| 1 | Rimuovere endpoint debug `_deploy-check` | **code** | `git rm server/api/_deploy-check.get.ts` + commit. Token hardcoded `vEnv-check-7Kq2` di fatto pubblico (git history + bundle), espone VERCEL_ENV/creemTestMode. Scopo (verifica VERCEL_ENV) già assolto. |
| 2 | Ri-eseguire i gate su dev HEAD | **code** | `pnpm typecheck && pnpm lint && pnpm test && pnpm build` dopo la rimozione (rigenera `nitro-routes.d.ts`). |
| 3 | Env Vercel Production reali e non vuote | **user-ops** | Verificare le 18 chiavi REQUIRED_ENV (`server/plugins/0.validate-env.ts` → throw al boot in prod). Trappola: `NUXT_QSTASH_*`, `NUXT_CF_*` (R2), `NUXT_UPSTASH_*` sono vuote in dev (fallback) ma required in prod. Source of truth = `.env.prod` (env Sensitive). |
| 4 | `NUXT_ADMIN_API_KEY` reale | **user-ops** | `openssl rand -hex 32` → Vercel + `.env.prod`. Un placeholder non-vuoto non fa fallire il boot ma resta insicuro. |
| 5 | Creem live: prodotti + chiavi | **user-ops** | Prodotti live (Celebrazione one-time 3900c, Atelier mensile 2400c) + `NUXT_CREEM_PRODUCT_ID_*` / `NUXT_CREEM_API_KEY` / `NUXT_CREEM_WEBHOOK_SECRET` live. Prereq: "Automatically expose System Environment Variables" ON su Vercel (altrimenti VERCEL_ENV null → chiave test). |
| 6 | Test-run 0010 su branch Neon temporaneo | **user-ops** | Branch da `main`, puntarci `NUXT_DATABASE_URL_DIRECT`, `pnpm db:migrate:prod`. Confermare: (a) applica SOLO 0010 (hash 0009 combacia), (b) l'evento reale converte palette→theme. DROP palette irreversibile → de-risk obbligatorio. Rollback = elimina branch. |
| 7 | Applicare 0010 al DB prod reale | **user-ops** | `pnpm db:migrate:prod` sul branch `main` (host SENZA `-pooler`). **PRIMA del deploy** del codice. |
| 8 | Merge `dev`→`main` + push manuale | **user-ops** | `git checkout main && git merge dev` (fast-forward: 28 avanti, 0 indietro) + push → Vercel deploya Production. |
| 9 | Verifica post-deploy | **user-ops** | Billing live (checkout di prova reale, creemTestMode=false) + invito reale `https://ceremly.com/e/<slug>` + `/api/public/preview` → 200 con tema/font renderizzati. Solo allora go-live pubblico. |

## ⚠️ Should-fix (gap GDPR rilevanti — vedi conferma sotto)

- **Export dati GDPR (Art. 20)** — `[code]` backend completo (`dataExport.service.ts`, route `/api/user/data-export/*`,
  handler QStash) + componenti pronti (`DataExportSection.vue`, `DataExportHistory.vue`) ma **nessuna pagina li monta**.
  Confermato: grep su `app/` negativo; `profile/index.vue` ha solo Personal Info / Preferences / Security.
- **Cancellazione account (Art. 17)** — `[code]` endpoint `account.delete.ts` + `profileStore.deleteAccount()` esistono
  ma **nessun trigger UI** (solo in `requirements.md`). Confermato.
- Cron `purge-deleted-accounts` non registrato in `nuxt.config.ts` (rilevante dopo aver reso raggiungibile la cancellazione). `[code]`
- Webhook Resend non registrato lato provider + `NUXT_RESEND_WEBHOOK_SECRET` (senza, delivery/bounce non tracciati; invio ok). `[user-ops]`
- `CRON_SECRET` + `NUXT_CRON_SECRET` (rinforzo Bearer per i cron; senza, si reggono su `x-vercel-cron`). `[user-ops]`

## Nice-to-have

- `findEventBySlug` non org-scoped (oggi sicuro: gated da preview token HMAC; rischio solo latente per futuri chiamanti).
- Cleanup: `DROP TABLE user_custom_limits` su prod (orfana); rimuovere env morte `NUXT_PUBLIC_PLAUSIBLE_*`.
- CSP #16 (nonce vs prerender): debito accettato, nessuna azione al go-live.

## ❓ Solo l'utente può confermare

1. **La privacy policy pubblicata promette export dati e/o cancellazione account?** Se SÌ, montare quelle UI
   (oggi backend-complete ma irraggiungibili) **diventa un go-live BLOCKER, non un should-fix.**
2. Secret effettivamente ruotati a valori reali su Vercel (env Sensitive → non verificabili via CLI/codice).
3. Env Vercel Production sincronizzate da `.env.prod`; "Expose System Env Variables" ON.
4. Prodotti Creem live creati e chiavi live impostate.
5. Webhook Resend registrato + dominio `events.ceremly.com` verificato (SPF/DKIM).
