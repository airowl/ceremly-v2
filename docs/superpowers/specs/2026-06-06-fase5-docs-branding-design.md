# FASE 5 — Pulizia documentazione e branding (Design)

> **Spec di input per `writing-plans`.** Deriva da `IMPLEMENTATION.md` FASE 5 (righe 207-225),
> verificata con grep/read reali sul tree attuale. **È l'ULTIMA fase:** assume che `0`, `1a-d`, `2`,
> `3`, `4` siano già landed. Obiettivo: allineare docs e branding allo stato finale (org-tenancy,
> Vercel serverless, Neon HTTP, QStash/Upstash, Vercel Cron, entità `projects`), rimuovendo **ogni**
> traccia Ceremly/eventi.

---

## Convenzioni già chiuse (NON rivalutare)

- FASE 5 è l'ultima e documenta lo **stato finale** post-0-4, non gli stub odierni.
- **Decisione utente — branding: tutto env-driven.** Nessun placeholder hardcoded: nome/dominio/
  data-domain vengono da variabili d'ambiente; dove serve un fallback build-time si usa un valore
  neutro o vuoto, **mai** una stringa-brand fissa.
- **Decisione adottata:** `base/` → `docs/guide/`; storia migrazione tenuta (esclusa dal gate); doppio gate finale.

## ⚠️ Gate non soddisfacibile prima del tempo

Oggi solo `1a` è committato. Il gate "`grep ceremly → 0`" **non può passare** finché 1b-d/2/3/4 non
hanno effettivamente rimosso/sostituito il loro codice. **Lo spec è scritto al contratto (0-4 done)**,
non al tree odierno. FASE 5 si esegue **dopo** le altre.

---

## Sezione 1 — La lente: classificazione per OWNER-PHASE

Discriminatore unico per ogni residuo Ceremly/event: **"sopravvive a 0-4?"**

- **No** → l'ha già rimosso/sostituito un'altra fase → FASE 5 fa solo **verify-removed** (nel gate).
- **Sì ma stale** → è infra trasversale che resta ma descrive lo stato vecchio → **FASE 5 riscrive**.

Questo impedisce a FASE 5 di assorbire lavoro di 1b/1c/1d/2/3/4 (doppio lavoro, conflitti).

### Tabella maestra (= cuore dello spec)

| Artefatto | Stato attuale (`path:riga`) | Owner phase | Azione FASE 5 |
|---|---|---|---|
| `CLAUDE.md` | architettura event-based (events/guests/landing/reminder/Mastra/WhatsApp/node-postgres/Cloudflare); cita `docs/pattern/` inesistente | **5** | **rewrite** |
| `README.md` | `# Ceremly`; RSVP eventi via Email/WhatsApp; Mastra/AI; deploy Node/Cloudflare-Hyperdrive | **5** | **rewrite** |
| `nuxt.config.ts` | `site.name "Ceremly"` (139), `site.url ceremly.it` (138), `schemaOrg` (193-194), Plausible `data-domain "ceremly.com"` (13); chunk `grapesjs` morto (313) | **5** | **rebrand-sweep → env-driven** |
| `app/app.vue` | `twitterSite "@ceremly"` (42), og name "Ceremly" (47) | **5** | **rebrand-sweep → env-driven** |
| `app/components/landing/AppHeader.vue` (24), `AppFooter.vue` (13) | brand label visuale | **5** | **rebrand-sweep** |
| `app/pages/index.vue` (14,39), `blogs/index.vue` (12), `blogs/[slug].vue` (13) | fallback baseUrl `ceremly.it` + schemaOrg | **5** | **rebrand-sweep → env-driven** |
| `app/assets/css/main.css` (6) | commento header design system | **5** | **rebrand-sweep** |
| i18n blocco `landing` (it/en) | marketing eventi/RSVP/WhatsApp/matrimoni | **5** | **rewrite** (copy generico) |
| Email sopravvissute (`Verification`/`ResetPassword`/`WaitingList`/`Contact*`/`index.ts`) | brand/copyright/address/claim "gestione eventi" | **5** | **rebrand-sweep → env-driven** |
| `content/blogs/*` (6 file) | tema eventi/matrimonio, author "Team Ceremly" | **5** | **replace** (placeholder generici) |
| `.env.example` | naming già generico; var infra Vercel/Neon/QStash | **2/3** (infra), **5** (sweep coerenza) | **verify + sweep** |
| `server/emailTemplates/EventInviteEmail.ts` | invito evento | **1b** | **verify-removed** |
| i18n keys `event`/`team`/`invite`; `app/pages/dashboard/event/**`; `dashboard/event/[id]/requirements.md` | app-UI event-scoped | **1c/1d** | **verify-removed/rewritten** |
| `base/` (11 file) | guida build, descrive accuratamente lo stack target | **5** | **move → `docs/guide/`** + fonte rewrite |
| `docs/superpowers/**`, `IMPLEMENTATION.md` | storia migrazione (cita Ceremly legittimamente) | — | **keep** (escluso dal gate) |

---

## Sezione 2 — Riscrittura `CLAUDE.md` (rewrite)

Fonte: `base/STACK-AND-CONVENTIONS.md` + `base/00-START-HERE.md` + verifica sul codice landed.

| Sezione | Oggi (Ceremly) | Nuovo (boilerplate) |
|---|---|---|
| Architecture / Tech Stack | eventi/RSVP/landing/reminder, Mastra/AI, WhatsApp | org-tenancy (Better Auth org plugin), Neon HTTP, QStash/Upstash, Vercel Cron |
| Key Directories | `landing-editor/`, componenti event | `server/queue/`, `server/api/{jobs,cron}/`, `server/repositories/` |
| Middleware Stack | `2.events.ts` | `2.organization.ts` (org attiva) |
| Database Schema | events/event_users/guests/... | organization/member/invitation/projects |
| Services Layer | event/guest/landing/reminder/ai/eventTemplate/team/publicEvent | generici + `project.service` |
| Landing Page Editor | sezione intera | **rimuovere** |
| Public vs Authenticated API | event/rsvp | rimuovere; descrivere `/api/projects`, `/api/jobs`, `/api/cron` |
| Payment Architecture | Creem + limiti event | Creem invariato, limiti generalizzati (org/projects) |
| Auth Flow | — | aggiungere risoluzione **org attiva** |
| Backend Pattern | cita `docs/pattern/` inesistente | ricreare i pattern (vedi Sez. 6) **o** rimuovere il riferimento dangling |
| Known Issues | Supabase/Stripe/Polar/GrapesJS stale | rimuovere voci ormai false |

## Sezione 3 — Riscrittura `README.md` (rewrite)

Titolo/descrizione env-driven ("SaaS boilerplate multi-tenant"); features generiche
(org/team/projects/billing/auth/file/email); tech stack Vercel + Neon HTTP + QStash/Upstash;
deployment Vercel. Rimuovere Mastra/WhatsApp/eventi/Cloudflare-Hyperdrive.

## Sezione 4 — Rebrand-sweep config + frontend (→ env-driven)

| File:riga | Modifica |
|---|---|
| `nuxt.config.ts:139` `site.name` | da `useRuntimeConfig().public.appName` (env `NUXT_PUBLIC_APP_NAME`, già esiste) |
| `nuxt.config.ts:138` `site.url` | da env (`NUXT_PUBLIC_SITE_URL`), fallback neutro/vuoto |
| `nuxt.config.ts:193-194` `schemaOrg` | name/url da env |
| `nuxt.config.ts:13` Plausible `data-domain` | da env (`NUXT_PUBLIC_PLAUSIBLE_DOMAIN`); se assente, disabilitare lo script |
| `nuxt.config.ts:313` chunk `grapesjs` | **rimuovere** (dep rimossa, chunk morto) |
| `app/app.vue:42,47`, `index.vue:14,39`, `blogs/*.vue:12-13` | fallback `ceremly.it`/og/twitter → env-driven, niente brand hardcoded |
| `AppHeader.vue:24`, `AppFooter.vue:13`, `main.css:6` | brand label da config app / commento neutro |

## Sezione 5 — i18n marketing (rewrite blocco `landing`)

**Solo** il blocco `landing` (it + en) — le keys app-UI (`event`/`team`/`invite`) sono di 1c/1d.
Mantenere la **struttura delle sezioni** (hero/features/pricing/faq + meta SEO), copy **generico SaaS B2B**
(org/team/billing), placeholder ma sensato. Niente eventi/RSVP/WhatsApp/matrimoni.

## Sezione 6 — Email templates (rebrand-sweep + verify-removed)

Sweep brand/copyright/address/claim (→ env-driven dove possibile, es. `appName` dalla config) sui template
**sopravvissuti**: `Verification`, `ResetPassword`, `WaitingList`, `Contact*`, `index.ts`, `requirements.md`.
`EventInviteEmail.ts` = **verify-removed** (1b).

## Sezione 7 — Blog content

Sostituire i 6 post evento/matrimonio con **1-2 placeholder SaaS generici** (mantiene dimostrabile l'infra
`@nuxt/content`); author neutro/env. Route e i18n blog restano.

## Sezione 8 — Sweep finale `.env.example`

Solo coerenza/naming: confermare che le var infra Vercel/Neon/QStash/Upstash (introdotte da FASE 2/3)
siano presenti e ordinate; nessuna var event-specific residua. **Non** è qui che si introducono (è 2/3).

## Sezione 9 — Disposizione `base/` e storia migrazione

- `base/` → **spostare in `docs/guide/`** (riferimento riutilizzabile per cloni futuri; è anche la fonte del rewrite CLAUDE/README).
- `docs/superpowers/**` + `IMPLEMENTATION.md` → **tenere** come record datato della migrazione; **esclusi** dal brand gate.

---

## Sezione 10 — Ordine di pulizia

1. Riscrivi `CLAUDE.md` + `README.md` (fonte `base/`).
2. Rebrand-sweep config + frontend + `app.vue` + `main.css` (→ env-driven).
3. Riscrivi blocco `landing` i18n (it/en).
4. Rebrand email sopravvissute.
5. Blog → placeholder.
6. Sposta `base/` → `docs/guide/`.
7. Sweep finale `.env.example` + GATE.

---

## Sezione 11 — GATE FINALE (doppio, set di path esplicito)

- **Brand gate:**
  `grep -rIi ceremly app/ server/ shared/ i18n/ content/ public/ nuxt.config.ts README.md CLAUDE.md .env.example package.json`
  → **0 hit**. (Esclude di proposito `docs/` e `IMPLEMENTATION.md` = storia migrazione legittima.)
- **Vocabolario gate (staleness architetturale):**
  `grep -rIE 'event|guest|rsvp|reminder|whatsapp|matrimoni' CLAUDE.md README.md app/ server/ shared/ i18n/`
  → **0 hit non-legittimo**. `landing` valutato **case-by-case** (può colpire "landing page" generica legittima — non bloccare ciecamente).

---

## Checkpoint FASE 5

- [ ] `CLAUDE.md` / `README.md` / `.env.example` descrivono il boilerplate (org/Vercel/Neon/QStash), non Ceremly/eventi
- [ ] Branding **env-driven**: nessun nome/dominio hardcoded; chunk `grapesjs` morto rimosso
- [ ] Brand gate → 0 hit; Vocabolario gate → 0 hit non-legittimo
- [ ] `base/` spostata in `docs/guide/`; storia migrazione tenuta ed esclusa dal gate
- [ ] Riferimento `docs/pattern/` di `CLAUDE.md` risolto (ricreato o rimosso, non dangling)
- [ ] Commit: `docs: rewrite docs and branding for boilerplate`

---

## Cosa esplicitamente NON copre questa spec

- `EventInviteEmail.ts` → **1b**; i18n/pagine/requirements event-scoped → **1c/1d** (FASE 5 li **verifica** assenti, non li produce).
- Introduzione var infra `.env.example` (Vercel/Neon/QStash/Upstash) → **FASE 2/3** (qui solo sweep di coerenza).
- Codice `projects` → **FASE 4**.
