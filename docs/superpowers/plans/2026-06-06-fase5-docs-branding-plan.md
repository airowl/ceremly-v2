# FASE 5 — Pulizia documentazione e branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allineare documentazione e branding del repo allo stato finale del boilerplate (org-tenancy, Vercel serverless, Neon HTTP, QStash/Upstash, Vercel Cron, entità `projects`), rimuovendo ogni traccia "Ceremly"/eventi e rendendo il branding interamente env-driven.

**Architecture:** FASE 5 è l'ULTIMA fase e documenta lo stato post-0-4. Possiede solo i residui "infra trasversale stale" (docs, branding, copy marketing, email, blog); tutto ciò che è prodotto-evento (EventInviteEmail, i18n keys event/team, pagine/requirements event-scoped) è già stato rimosso/sostituito dalle fasi precedenti e qui viene solo VERIFICATO assente nel gate. Il branding diventa env-driven: nome/dominio/data-domain vengono da `runtimeConfig.public` (`NUXT_PUBLIC_APP_NAME`, `NUXT_PUBLIC_BASE_URL`, `NUXT_PUBLIC_PLAUSIBLE_DOMAIN`), senza stringhe-brand hardcoded.

**Tech Stack:** Nuxt 4 + Vue 3 + TypeScript, @nuxtjs/i18n (it/en), @nuxt/content (blog), React Email (server/emailTemplates), @nuxtjs/seo (schemaOrg/sitemap/robots), nuxt-security.

---

## Prerequisiti / Gate (cosa deve essere landed prima)

**GATE BLOCCANTE — questa fase NON parte finché 0, 1a-d, 2, 3, 4 non sono landed.**

- Oggi (tree odierno) **solo `1a` è committato**. Il gate finale `grep ceremly → 0` è **strutturalmente insoddisfacibile** finché 1b-d/2/3/4 non hanno rimosso/sostituito il loro codice (EventInviteEmail.ts, i18n keys `event`/`team`/`invite`, pagine `dashboard/event/**`, var infra `.env`, driver Neon, preset Vercel, entità `projects`).
- Prima di iniziare, **verificare che le seguenti fasi siano landed** (atteso: tutte committate prima di FASE 5):
  - `1b` ha rimosso `server/emailTemplates/EventInviteEmail.ts` e il suo render in `index.ts` + i suoi consumer.
  - `1c/1d` hanno rimosso/riscritto le keys i18n `event`/`team`/`invite` e le pagine `app/pages/dashboard/event/**` + i relativi `requirements.md`.
  - `2/3` hanno introdotto in `.env.example` le var infra (Neon `DATABASE_URL`, Upstash QStash/Redis, preset Vercel) e rimosso `NUXT_NITRO_PRESET=cloudflare-module` / `NUXT_CF_HYPERDRIVE_ID`.
  - `4` ha introdotto l'entità-esempio `projects` (schema + service + repository + route).
- Se uno di questi non è landed, **NON eseguire** questo piano: i task che fanno `verify-removed` falliranno e il gate finale non potrà passare. Eseguire FASE 5 solo dopo aver confermato che il tree è allo stato 0-4.

**Comando di pre-flight (atteso dopo 0-4):**
```bash
test ! -f server/emailTemplates/EventInviteEmail.ts && echo "OK: EventInviteEmail rimosso (1b)" || echo "STOP: 1b non landed"
```

---

## File Structure (creati / modificati / spostati / rimossi)

| File | Azione | Responsabilità in FASE 5 |
|---|---|---|
| `CLAUDE.md` | **rewrite** | Documentare architettura boilerplate (org/Vercel/Neon/QStash/projects); rimuovere eventi/Mastra/WhatsApp; risolvere riferimento dangling a `docs/pattern/` |
| `README.md` | **rewrite** | Titolo/descrizione/tech-stack/features/deployment generici boilerplate (Vercel+Neon); rimuovere Mastra/WhatsApp/eventi/Cloudflare-Hyperdrive |
| `nuxt.config.ts` | **rebrand-sweep → env-driven** | `site.name/url/description`, `schemaOrg`, Plausible `data-domain` → env; rimuovere chunk `grapesjs` morto |
| `app/app.vue` | **rebrand-sweep → env-driven** | `twitterSite`, `defineWebSite.name` → env |
| `app/components/landing/AppHeader.vue` | **rebrand-sweep → env-driven** | Brand label visuale → `appName` da config |
| `app/components/landing/AppFooter.vue` | **rebrand-sweep → env-driven** | Brand label visuale → `appName` da config |
| `app/pages/index.vue` | **rebrand-sweep → env-driven** | Fallback `baseUrl`, `SoftwareApplication.name` → env |
| `app/pages/blogs/index.vue` | **rebrand-sweep → env-driven** | Fallback `baseUrl` → env |
| `app/pages/blogs/[slug].vue` | **rebrand-sweep → env-driven** | Fallback `baseUrl` + `knownOgSlugs` (slug evento) → puliti |
| `app/assets/css/main.css` | **rebrand-sweep** | Commento header design system → neutro |
| `i18n/locales/it-IT.json` (blocco `landing` r2-366) | **rewrite** | Copy marketing generico SaaS B2B (no eventi/RSVP/WhatsApp/matrimoni); mantenere struttura keys consumate dai template |
| `i18n/locales/en-US.json` (blocco `landing` r2-366) | **rewrite** | Mirror EN del precedente |
| `server/emailTemplates/VerificationEmail.ts` | **rebrand-sweep → env-driven** | `appName` prop, translations factory, header/bold env-driven |
| `server/emailTemplates/ResetPasswordEmail.ts` | **rebrand-sweep → env-driven** | idem |
| `server/emailTemplates/WaitingListEmail.ts` | **rebrand-sweep → env-driven** | idem |
| `server/emailTemplates/ContactConfirmationEmail.ts` | **rebrand-sweep → env-driven** | idem |
| `server/emailTemplates/ContactNotificationEmail.ts` | **rebrand-sweep → env-driven** | idem |
| `server/emailTemplates/index.ts` | **rebrand-sweep → env-driven** | render functions + `emailSubjects` threadano `appName` da `runtimeConfig.public.appName`; rimuovere export/render `EventInviteEmail` |
| `server/utils/email.ts` | **modify** | Adeguare chiamate a `emailSubjects.*(appName)` |
| `server/services/contact.service.ts` | **verify/modify** | Adeguare eventuali chiamate a `emailSubjects` / render contact |
| `server/emailTemplates/requirements.md` | **rebrand-sweep** | Rimuovere riferimenti brand "Ceremly" |
| `app/pages/requirements.md` | **rebrand-sweep** | Rimuovere "ceremly"/eventi residui |
| `content/blogs/*` (6 file evento) | **replace** | Sostituire con 2 placeholder SaaS generici (1 it + 1 en, collegati via `translationSlug`) |
| `public/og/*` (immagini evento) | **delete** | Rimuovere OG immagini dei blog evento sostituiti |
| `base/` (11 file) | **move → `docs/guide/`** | Mantenere come riferimento per cloni; è la fonte del rewrite CLAUDE/README |
| `.env.example` | **sweep** | Aggiungere `NUXT_PUBLIC_PLAUSIBLE_DOMAIN`; coerenza naming (var infra restano di 2/3) |
| `docs/superpowers/**`, `IMPLEMENTATION.md` | **keep** | Storia migrazione; esclusi dal gate |

**Convenzioni env-driven (vincolanti):**
- Nome prodotto = `runtimeConfig.public.appName` (env `NUXT_PUBLIC_APP_NAME`, già esistente, default `.env.example` = `YourSaaSName`).
- Base URL = `runtimeConfig.public.baseURL` (env `NUXT_PUBLIC_BASE_URL`, già esistente).
- Plausible domain = nuova env `NUXT_PUBLIC_PLAUSIBLE_DOMAIN`; se assente lo script Plausible non si registra.
- In `nuxt.config.ts` (eseguito a build-time prima del runtimeConfig nitro) si legge `process.env.NUXT_PUBLIC_*` direttamente, con **fallback vuoto** (`""`), MAI una stringa-brand fissa.
- Nei template email (CLI + runtime) si legge `runtimeConfig.public.appName` con fallback `""`.

---

## Ordine di esecuzione (gate finale per ultimo)

1. Task 1 — Pre-flight (verifica 0-4 landed).
2. Task 2 — Rewrite `CLAUDE.md`.
3. Task 3 — Rewrite `README.md`.
4. Task 4 — Rebrand-sweep `nuxt.config.ts` (env-driven + chunk grapesjs).
5. Task 5 — Rebrand-sweep `app/app.vue` (env-driven).
6. Task 6 — Rebrand-sweep `AppHeader.vue` + `AppFooter.vue` (env-driven).
7. Task 7 — Rebrand-sweep `index.vue` + `blogs/index.vue` + `blogs/[slug].vue` (env-driven).
8. Task 8 — Rebrand-sweep `main.css`.
9. Task 9 — Rewrite blocco `landing` i18n (it/en).
10. Task 10 — Rebrand email templates (env-driven) + `index.ts` + `email.ts` + verify contact.
11. Task 11 — Rebrand-sweep `requirements.md` residui (email + pages).
12. Task 12 — Blog → placeholder + pulizia `public/og/` + `knownOgSlugs`.
13. Task 13 — Move `base/` → `docs/guide/`.
14. Task 14 — Sweep `.env.example` (`NUXT_PUBLIC_PLAUSIBLE_DOMAIN`).
15. Task 15 — GATE FINALE (brand gate + vocabolario gate + typecheck + build) + commit.

---

## Task 1 — Pre-flight: verifica che 0-4 siano landed

**Files:**
- Verify: `server/emailTemplates/EventInviteEmail.ts` (deve NON esistere), i18n keys `event`/`team`/`invite`, `.env.example` (var infra).

**Steps:**

- [ ] Verificare che `EventInviteEmail.ts` sia stato rimosso da 1b:
  ```bash
  test ! -f /Users/airowlgasga/coding/project/boilerplate-saas/server/emailTemplates/EventInviteEmail.ts \
    && echo "OK: EventInviteEmail rimosso (1b)" \
    || echo "STOP: 1b non landed — fermare FASE 5"
  ```
  Output atteso: `OK: EventInviteEmail rimosso (1b)`.

- [ ] Verificare che le keys i18n event-scoped siano state rimosse da 1c/1d:
  ```bash
  grep -cE '"(event|team|invite)":' /Users/airowlgasga/coding/project/boilerplate-saas/i18n/locales/it-IT.json
  ```
  Output atteso: `0` (le keys top-level `event`/`team`/`invite` non esistono più). Se > 0, **fermare**: 1c/1d non landed.

- [ ] Verificare che le pagine dashboard event-scoped siano state rimosse da 1c/1d:
  ```bash
  test ! -d /Users/airowlgasga/coding/project/boilerplate-saas/app/pages/dashboard/event \
    && echo "OK: dashboard/event rimosso (1c/1d)" \
    || echo "STOP: 1c/1d non landed"
  ```
  Output atteso: `OK: dashboard/event rimosso (1c/1d)`.

- [ ] Verificare che `.env.example` sia allo stato 2/3 (niente Cloudflare-Hyperdrive):
  ```bash
  grep -c "NUXT_CF_HYPERDRIVE_ID" /Users/airowlgasga/coding/project/boilerplate-saas/.env.example
  ```
  Output atteso: `0`. Se `1`, FASE 2/3 non hanno ancora ripulito le var infra: i task 2/3 di FASE 5 descriveranno comunque lo stato Vercel/Neon (corretto), ma **annotare** che `.env.example` va già allo stato 2/3.

- [ ] Se tutti i check passano, procedere. Nessun commit in questo task.

---

## Task 2 — Rewrite `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md` (riscrittura completa).
- Verify: `grep -ciE 'event|guest|rsvp|reminder|whatsapp|mastra|matrimoni|cloudflare|hyperdrive|node-postgres' CLAUDE.md` → 0.

Fonte: `base/STACK-AND-CONVENTIONS.md` + `base/00-START-HERE.md` (verificati). Sostituisce l'intero contenuto di `CLAUDE.md`.

**Steps:**

- [ ] Sostituire l'intero contenuto di `CLAUDE.md` con:

```markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
pnpm dev                    # Start dev server (localhost:3000)
pnpm build                  # Production build
pnpm preview                # Preview production build
pnpm typecheck              # Type checking (vue-tsc)
pnpm lint                   # ESLint

# Database (Drizzle ORM + Neon Postgres)
pnpm db:generate            # Generate migrations (interactive — needs TTY)
pnpm db:migrate             # Run migrations (dev)
pnpm db:migrate:prod        # Run migrations (production)
pnpm db:push                # Push schema directly (no migration files)
pnpm db:studio              # Drizzle Studio GUI
pnpm db:seed                # Seed database
pnpm db:reset               # Reset database
pnpm auth:schema            # Regenerate Better Auth schema (re-add custom user fields after)
```

## Architecture

**Multi-tenant SaaS boilerplate** built with Nuxt 4 + Vue 3 + TypeScript. The tenancy model is **B2B-first with B2C as a degenerate case**: every account is an *organization* (Better Auth organization plugin); a B2C user is simply an organization with a single member. Every tenant resource carries an `organizationId` and every query filters by tenant. Role-based access within an organization (owner/admin/member).

### Architectural principle: Strada A (event-driven serverless)
The backend runs on **Vercel as serverless functions** — no persistent process. Consequences (mandatory):
- No polling workers, no `while(true)`, no long-lived Redis connections.
- Background/async work is enqueued to an **HTTP queue (Upstash QStash)**. The "worker" is an HTTP route under `server/api/jobs/...` that the queue invokes — an endpoint, not a process.
- Scheduled tasks are **Vercel Cron** declared in `vercel.json`, hitting a `server/api/cron/...` route. Cron does no heavy work: it enqueues or processes small batches.
- DB connections use the **Neon HTTP/serverless driver** (`@neondatabase/serverless`), not the classic TCP driver.

### Tech Stack
- **Framework**: Nuxt 4 (fullstack, Nitro, preset `vercel`)
- **UI**: Nuxt UI v4 + Tailwind CSS (warm earthy palette)
- **State**: Pinia stores (auto-imported)
- **DB**: Neon (serverless Postgres) via Drizzle ORM + Drizzle Kit, UUID v7 IDs
- **Auth**: Better Auth (email/password + Google OAuth + 2FA) with **organization plugin**
- **Payments**: Creem only (`@creem_io/better-auth`)
- **Storage**: Cloudflare R2 (S3-compatible) behind a `server/storage/` abstraction
- **Email**: Resend + React Email templates (`server/emailTemplates/`)
- **Cache / rate-limit**: Upstash Redis (HTTP)
- **Queue**: Upstash QStash (HTTP) behind a `server/queue/` abstraction
- **Error tracking**: Sentry
- **i18n**: Italian default, English alternate (`prefix_except_default` strategy)
- **Content**: @nuxt/content for blog (Markdown files in `content/blogs/`)
- **Branding**: env-driven (`NUXT_PUBLIC_APP_NAME`, `NUXT_PUBLIC_BASE_URL`) — no hardcoded brand strings
- **Dark mode**: Disabled

### Key Directories
- `app/` — Frontend (pages, components, composables, stores, layouts, middleware)
- `server/` — Backend (API routes, database schema, middleware, utils, email templates)
- `server/services/` — Business logic layer (all domain logic lives here, routes are thin controllers)
- `server/repositories/` — Drizzle queries encapsulated per entity (org-scoped)
- `server/api/jobs/` — HTTP endpoints invoked by the QStash queue
- `server/api/cron/` — HTTP endpoints hit by Vercel Cron
- `shared/` — Shared between client/server (Zod schemas, constants, utils)
- `i18n/locales/` — Translation files (`it-IT.json`, `en-US.json`)
- `content/blogs/` — Blog posts (Markdown)
- `docs/guide/` — Build guide (stack, conventions, phase-by-phase reference for clones)
- `drizzle/migrations/` — Generated migration files

### Server Middleware Stack (numbered for order)
1. `0.common.ts` — Common setup
2. `0.site-mode.ts` — Enforces active/waitinglist/maintenance mode
3. `1.auth.ts` — Attaches auth session to `event.context`
4. `2.organization.ts` — Resolves and attaches the active organization for scoped requests
5. `3.rate-limit.ts` — Rate limiting (Upstash, 100 req/min)
6. `4.block-bots.ts` — Blocks malicious bots

### Client Middleware
- `auth.global.ts` — Supports `auth: { only: 'guest' }` and `auth: { only: 'user' }` per page
- `0.site-mode.global.ts` — Client-side enforcement of site mode

### Route Rules
- **Landing/blog pages**: SSR + prerender (SEO)
- **Dashboard + auth pages**: CSR only (`ssr: false`)
- Security headers exempt the Creem webhook and the Nuxt Icon proxy

### Payment Architecture (Creem)
- Plans: `starter`, `premium`, `agency`
- Single provider, no branching logic
- `persistSubscriptions: true` auto-manages the `creem_subscription` table
- Webhook auto-registered at `/api/auth/creem/webhook` by the Better Auth plugin
- Product IDs via env: `NUXT_CREEM_PRODUCT_ID_{STARTER|PREMIUM|AGENCY}_{MONTH|YEAR}`
- Plan limits centralized in `shared/constants/pricing.ts` (`-1` = unlimited), enforced per organization
- Customer portal via `creem.createPortal()` for upgrade/downgrade

### Auth Flow
- Better Auth catch-all at `/api/auth/[...all]`
- Session cached in Upstash Redis (`secondaryStorage`)
- **Active organization** resolved from the session and attached in middleware `2.organization.ts`
- Server: `getAuthSession(event)` / `requireAuth(event)` in `server/utils/auth.ts`
- Client: `useAuth()` composable wraps the Better Auth client
- After `pnpm auth:schema`, manually re-add custom user fields

### Database Schema
- Schemas in `server/database/schema/` with barrel export via `index.ts`
- Auth tables auto-generated by Better Auth (`user`, `account`, `session`, `verification`, `two_factor`)
- Organization tables (Better Auth organization plugin): `organization`, `member`, `invitation`
- `creem_subscription` auto-managed by the Creem plugin
- Domain tables: `projects` (canonical org-scoped example entity), `file`, `email_logs`, `contact_messages`, `audit_log`, `waiting_list`, `data_exports`, `user_custom_limits`

### Services Layer
All business logic lives in `server/services/`. Routes are thin controllers (max 20-25 lines) that delegate here.

| Service | Purpose |
|---------|---------|
| `project.service.ts` | Project CRUD, org-scoped — the canonical pattern to replicate for new entities |
| `file/fileService.ts` | R2 uploads (direct + presigned), dedup via SHA-256, image processing |
| `planLimit.service.ts` | Plan limit checks per organization |
| `user.service.ts` | Profile updates, account deletion |
| `dataExport.service.ts` | GDPR user data export |
| `contact.service.ts` | Contact form handling |
| `waitingList.service.ts` | Waiting list subscriptions |

### Key Server Utilities
- `server/utils/validateBody.ts` — `parseBody(event, schema)`, `parseQueryParams(event, schema)`
- `server/utils/permissions.ts` — RBAC: `getUserRole()`, `requireMember()`, `requireWrite()`, `requireOwner()` (organization-scoped)
- `server/utils/db.ts` — `getDB()` (preferred singleton, Neon HTTP driver)
- `server/utils/audit/` — `logAudit(event, action, opts)`, `AUDIT_ACTIONS`, `AUDIT_CATEGORIES`
- `server/utils/spamProtection.ts` — Disposable email check, rate limiting, honeypot, timing validation
- `server/utils/requireAdminApiKey.ts` — Admin API key check

### Public vs Authenticated API
- `server/api/projects/` — Authenticated, org-scoped resource management endpoints (the example entity)
- `server/api/jobs/` — QStash queue consumers (HTTP)
- `server/api/cron/` — Vercel Cron targets (HTTP)

### Security
- Fake server headers (`X-Powered-By: PHP/5.2.17`, `Server: Apache/2.2.15`) to misdirect bots
- Bot traps: `/wp-admin`, `/wp-login.php`, `/.env` redirect to homepage
- Strict CSP, HSTS (2-year), request size limits (1MB body, 5MB uploads)
- Admin endpoints require `NUXT_ADMIN_API_KEY` header
- Audit logging on all auth events (IP, User-Agent, success/failure)
- Magic bytes file validation (binary header check, not just MIME)

### Design System
- Defined in `app/assets/css/main.css`
- Background: Smoke White `#FAF9F6`
- Font: Manrope
- Landing page uses pure Tailwind (no Nuxt UI components) + custom CSS animations
- Google Material Symbols Outlined for landing page icons

## Backend conventions (MUST READ)

Before writing or modifying backend code, read `docs/guide/STACK-AND-CONVENTIONS.md`. Key rules:

- **Thin routes**: `server/api/` routes validate input, call a service, return output. No business logic in routes.
- **Services**: business logic in `server/services/` (pure functions + singleton classes for SDKs).
- **Repositories**: Drizzle queries live in `server/repositories/` behind domain-named functions, not inline in routes/services.
- **Provider abstraction**: every external SDK sits behind its own module (`server/storage/`, `server/billing/`, `server/emailTemplates/` + `server/utils/email.ts`, `server/queue/`); never call a provider SDK directly elsewhere.
- **Body validation**: always `parseBody(event, schema)` — never `readBody` + `safeParse`.
- **Query validation**: always `parseQueryParams(event, schema)` — never `getQuery` + cast.
- **Schemas**: always from `shared/schemas/` — never inline in the route.
- **Multi-tenancy**: every query on tenant resources MUST filter by `organizationId`. This is a security requirement.
- **Audit**: `logAudit()` on every write operation.
- **DB**: `getDB()` preferred.
- **Env**: `useRuntimeConfig()` in routes — never `process.env`.
- **Auth**: `requireAuth(event)` as the first operation in protected routes.
- **RBAC**: `requireMember()` / `requireWrite()` / `requireOwner()` for organization access control.
- **Error**: try-catch handling `23505` (unique constraint) + re-throw + 500 fallback.

## Git

- **Commit automatici OK** — quando il lavoro è pronto e verificato, si può committare automaticamente.
- **Push sempre manuale** — il push sul remoto lo esegue sempre l'utente, mai automatico.

## Conventions

- **Environment files**: `.env` (dev), `.env.production` (prod) — see `.env.example`
- **API pattern**: `server/api/[resource]/[action].[method].ts`
- **i18n**: Use `const { t } = useI18n()` and `useLocalePath()` for routes
- **Blog translations**: Linked via `translationSlug` field in content frontmatter
- **Plan limits**: Check via `/api/limits/*` endpoints before resource-creating operations
- **File uploads**: Two paths — direct upload or presigned URL flow (presign → upload → confirm)
- **Email templates**: React Email in `server/emailTemplates/`, env-driven app name, i18n via `user.locale`

## Known Issues
- `sharp-wasm32` error during Nitro build is pre-existing
- `pnpm db:generate` is interactive when creating new tables (needs TTY)
```

- [ ] Verificare assenza vocabolario stale nel file riscritto:
  ```bash
  grep -ciE 'event|guest|rsvp|reminder|whatsapp|mastra|matrimoni|cloudflare|hyperdrive|node-postgres|grapesjs' /Users/airowlgasga/coding/project/boilerplate-saas/CLAUDE.md
  ```
  Output atteso: `0`. (Nota: "Cloudflare R2" è presente nello stack come storage legittimo — vedi check sotto.)

- [ ] Il check precedente DEVE essere `0` ma "Cloudflare R2" è legittimo. Eseguire il check raffinato che esclude la riga R2:
  ```bash
  grep -inE 'event|guest|rsvp|reminder|whatsapp|mastra|matrimoni|hyperdrive|node-postgres|grapesjs' /Users/airowlgasga/coding/project/boilerplate-saas/CLAUDE.md
  ```
  Output atteso: nessun match. (`Cloudflare R2` resta perché è lo storage reale; non è nel pattern di questo check.)

- [ ] Verificare che non resti il riferimento dangling a `docs/pattern/`:
  ```bash
  grep -c "docs/pattern" /Users/airowlgasga/coding/project/boilerplate-saas/CLAUDE.md
  ```
  Output atteso: `0` (sostituito da `docs/guide/STACK-AND-CONVENTIONS.md`).

- [ ] Commit:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add CLAUDE.md && git commit -m "docs: rewrite CLAUDE.md for boilerplate (org/Vercel/Neon/QStash)"
  ```

---

## Task 3 — Rewrite `README.md`

**Files:**
- Modify: `README.md` (riscrittura completa).
- Verify: `grep -ciE 'ceremly|event|guest|rsvp|reminder|whatsapp|mastra|matrimoni|hyperdrive|node-postgres' README.md` → 0.

**Steps:**

- [ ] Sostituire l'intero contenuto di `README.md` con:

```markdown
# SaaS Boilerplate

[![Nuxt UI](https://img.shields.io/badge/Made%20with-Nuxt%20UI-00DC82?logo=nuxt&labelColor=020420)](https://ui.nuxt.com)

A repeatable, production-ready multi-tenant SaaS boilerplate built with Nuxt 4, Vue 3, TypeScript, Better Auth, and Drizzle ORM. B2B-first organization tenancy with B2C as a degenerate case. Branding is fully env-driven — set `NUXT_PUBLIC_APP_NAME` and you are ready to clone.

## Tech Stack

- **Framework**: Nuxt 4 + Vue 3 + TypeScript (Nitro, Vercel preset)
- **UI**: Nuxt UI v4 + Tailwind CSS
- **State Management**: Pinia
- **Database**: Neon (serverless Postgres) with Drizzle ORM (Neon HTTP driver)
- **Auth**: Better Auth (Google OAuth + Email/Password + 2FA) with organization plugin
- **Payments**: Creem (`@creem_io/better-auth`)
- **Storage**: Cloudflare R2 (S3-compatible)
- **Email**: Resend with React Email templates
- **Cache / Rate-limit**: Upstash Redis (HTTP)
- **Background jobs**: Upstash QStash + Vercel Cron (HTTP, serverless)
- **Error tracking**: Sentry
- **Security**: nuxt-security + CSP + Rate Limiting
- **Internationalization**: Nuxt i18n (Italian default, English)
- **SEO**: @nuxtjs/seo (sitemap, robots, schema.org)
- **Blog**: @nuxt/content (Markdown)

## Features

- **Organizations & Teams**: B2B-first multi-tenancy; invite members with role-based access (owner/admin/member)
- **Projects**: Canonical org-scoped example entity — the pattern to replicate for new resources
- **Subscription Plans**: Starter, Premium, Agency with per-organization plan limit enforcement
- **Authentication**: Email/password, Google OAuth, two-factor authentication
- **File Storage**: R2 uploads with SHA-256 deduplication and magic-bytes validation
- **Background Jobs**: HTTP queue (QStash) consumers + Vercel Cron, fully serverless
- **Transactional Email**: Resend + React Email templates, env-driven app name
- **Waiting List**: Pre-launch mode with email collection
- **Contact Form**: Built-in contact form with spam protection
- **Audit Logging**: Track auth and system events
- **GDPR Data Export**: User data export functionality
- **Blog**: Markdown blog via @nuxt/content with i18n translations

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 10+
- A Neon Postgres database
- An Upstash account (Redis + QStash)

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Configure your .env file (see .env.example for all variables)

# Push schema to database (no migration files)
pnpm db:push

# Or generate and run migrations
pnpm db:generate
pnpm db:migrate

# Start development server
pnpm dev
```

### Environment Variables

See [.env.example](.env.example) for the full list. Key variables:

```env
# App (branding is env-driven)
NUXT_PUBLIC_BASE_URL=http://localhost:3000
NUXT_PUBLIC_APP_NAME=YourSaaSName
NUXT_PUBLIC_SITE_MODE=active                # active | waitinglist | maintenance

# Auth
NUXT_BETTER_AUTH_SECRET=your-secret-key
NUXT_GOOGLE_CLIENT_ID=...
NUXT_GOOGLE_CLIENT_SECRET=...

# Database (Neon)
NUXT_DATABASE_URL=postgresql://...

# Payments (Creem)
NUXT_CREEM_API_KEY=...
NUXT_CREEM_WEBHOOK_SECRET=...

# Storage (Cloudflare R2)
NUXT_CF_ACCOUNT_ID=...
NUXT_CF_R2_BUCKET_NAME=...

# Email
NUXT_RESEND_API_KEY=...

# Admin
NUXT_ADMIN_API_KEY=...
```

## Development

```bash
pnpm dev                    # Development server (localhost:3000)
pnpm build                  # Production build
pnpm preview                # Preview production build
pnpm typecheck              # Type checking (vue-tsc)

# Database
pnpm db:generate            # Generate migrations
pnpm db:migrate             # Run migrations
pnpm db:push                # Push schema directly
pnpm db:studio              # Drizzle Studio GUI
pnpm db:seed                # Seed database
pnpm db:reset               # Reset database
pnpm auth:schema            # Regenerate Better Auth schema
```

## Project Structure

```
├── app/
│   ├── components/         # UI components (admin/, landing/)
│   ├── composables/        # Vue composables
│   ├── layouts/            # Auth, dashboard, public layouts
│   ├── middleware/         # Client middleware (auth, site-mode)
│   ├── pages/              # File-based routing
│   ├── stores/             # Pinia stores
│   └── assets/css/         # Global styles + design system
├── server/
│   ├── api/                # API routes (thin controllers); jobs/ + cron/ for serverless work
│   ├── services/           # Business logic layer
│   ├── repositories/       # Drizzle queries per entity (org-scoped)
│   ├── database/schema/    # Drizzle schema files
│   ├── emailTemplates/     # React Email templates (i18n, env-driven brand)
│   ├── middleware/         # Server middleware (auth, organization, rate-limit, bot-block)
│   └── utils/              # Server utilities (auth, db, permissions, audit)
├── shared/
│   ├── schemas/            # Zod validation schemas
│   ├── constants/          # Enums, pricing plans
│   └── utils/              # Shared utilities
├── i18n/locales/           # Translation files (it-IT, en-US)
├── content/blogs/          # Blog posts (Markdown)
├── docs/guide/             # Build guide (stack, conventions, phases)
└── drizzle/migrations/     # Generated migration files
```

## Subscription Plans

Configured in `shared/constants/pricing.ts`. Limits are enforced per organization; `-1` means unlimited.

## Deployment

Deploy to **Vercel** (Nitro `vercel` preset). The database is **Neon** (serverless Postgres via the HTTP driver), background jobs run on **Upstash QStash** + **Vercel Cron**, and cache/rate-limiting use **Upstash Redis** (HTTP). No persistent process is required.

## License

MIT
```

- [ ] Verificare assenza brand/vocabolario stale:
  ```bash
  grep -inE 'ceremly|guest|rsvp|reminder|whatsapp|mastra|matrimoni|hyperdrive|node-postgres' /Users/airowlgasga/coding/project/boilerplate-saas/README.md
  ```
  Output atteso: nessun match. ("event-driven serverless" non è presente nel README; se lo si aggiungesse, "event-driven" è legittimo — non bloccare, ma il README sopra non lo usa.)

- [ ] Commit:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add README.md && git commit -m "docs: rewrite README.md for boilerplate (Vercel/Neon/Upstash)"
  ```

---

## Task 4 — Rebrand-sweep `nuxt.config.ts` (env-driven + chunk grapesjs)

**Files:**
- Modify: `nuxt.config.ts:13` (Plausible data-domain), `:137-142` (site), `:190-197` (schemaOrg), `:305-321` (vite manualChunks).
- Verify: `grep -ci ceremly nuxt.config.ts` → 0.

**Steps:**

- [ ] Rendere lo script Plausible env-driven. Sostituire l'intero blocco `app:` (righe 6-17):

  Cercare:
  ```ts
  app: {
        head: {
            script: [
                {
                    src: 'https://datafa.st/js/script.js',
                    defer: true,
                    'data-website-id': 'dfid_QH5EiOhjJIj12ptsEinDZ',
                    'data-domain': 'ceremly.com',
                },
            ],
        },
    },
  ```
  Sostituire con:
  ```ts
  app: {
        head: {
            // Plausible/DataFast analytics: registrato solo se il dominio è configurato via env.
            script: process.env.NUXT_PUBLIC_PLAUSIBLE_DOMAIN
                ? [
                    {
                        src: 'https://datafa.st/js/script.js',
                        defer: true,
                        'data-website-id': process.env.NUXT_PUBLIC_PLAUSIBLE_WEBSITE_ID || '',
                        'data-domain': process.env.NUXT_PUBLIC_PLAUSIBLE_DOMAIN,
                    },
                ]
                : [],
        },
    },
  ```

- [ ] Rendere `site` env-driven. Sostituire (righe 137-142):
  ```ts
  site: {
        url: process.env.NUXT_PUBLIC_BASE_URL || "https://ceremly.it",
        name: "Ceremly",
        description: "Piattaforma automatica per gestire gli RSVP di eventi privati via Email e WhatsApp.",
        defaultLocale: "it",
    },
  ```
  Con:
  ```ts
  site: {
        url: process.env.NUXT_PUBLIC_BASE_URL || "",
        name: process.env.NUXT_PUBLIC_APP_NAME || "",
        description: "",
        defaultLocale: "it",
    },
  ```

- [ ] Rendere `schemaOrg` env-driven. Sostituire (righe 190-197):
  ```ts
  schemaOrg: {
        identity: {
            type: "Organization",
            name: "Ceremly",
            url: process.env.NUXT_PUBLIC_BASE_URL || "https://ceremly.it",
            logo: "/icon.png",
        },
    },
  ```
  Con:
  ```ts
  schemaOrg: {
        identity: {
            type: "Organization",
            name: process.env.NUXT_PUBLIC_APP_NAME || "",
            url: process.env.NUXT_PUBLIC_BASE_URL || "",
            logo: "/icon.png",
        },
    },
  ```

- [ ] Rimuovere il chunk morto `grapesjs`. Sostituire (righe 312-313):
  ```ts
  manualChunks(id) {
                        if (id.includes("node_modules/grapesjs")) return "vendor-grapesjs";
                        if (id.includes("node_modules/@unovis")) return "vendor-unovis";
  ```
  Con:
  ```ts
  manualChunks(id) {
                        if (id.includes("node_modules/@unovis")) return "vendor-unovis";
  ```

- [ ] Verificare:
  ```bash
  grep -ci ceremly /Users/airowlgasga/coding/project/boilerplate-saas/nuxt.config.ts
  grep -c grapesjs /Users/airowlgasga/coding/project/boilerplate-saas/nuxt.config.ts
  ```
  Output atteso: `0` e `0`.

- [ ] Verificare typecheck del config (sintassi TS):
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && pnpm typecheck 2>&1 | tail -20
  ```
  Output atteso: nessun errore nuovo riconducibile a `nuxt.config.ts`. (Errori pre-esistenti `sharp-wasm32` ignorabili.)

- [ ] Commit:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add nuxt.config.ts && git commit -m "refactor: env-driven branding in nuxt.config + remove dead grapesjs chunk"
  ```

---

## Task 5 — Rebrand-sweep `app/app.vue` (env-driven)

**Files:**
- Modify: `app/app.vue:42` (twitterSite), `:47` (defineWebSite.name).
- Verify: `grep -ci ceremly app/app.vue` → 0.

**Steps:**

- [ ] Aggiungere lettura di `appName` da runtimeConfig. Dopo la riga `const { locale, t } = useI18n()` (riga 3), inserire:
  ```ts
  const appName = computed(() => useRuntimeConfig().public.appName || '')
  ```
  Risultato (righe 1-5 circa):
  ```ts
  <script setup lang="ts">
  import { it, en } from '@nuxt/ui/locale'
  const { locale, t } = useI18n()
  const appName = computed(() => useRuntimeConfig().public.appName || '')

  const uiLocale = computed(() => locale.value === 'it' ? en : it)
  ```

- [ ] Sostituire `twitterSite` (riga 42). Cercare:
  ```ts
  twitterSite: "@ceremly",
  ```
  Sostituire con (handle Twitter da env; vuoto se non configurato):
  ```ts
  twitterSite: useRuntimeConfig().public.twitterHandle || undefined,
  ```

- [ ] Sostituire il `name` in `defineWebSite` (riga 47). Cercare:
  ```ts
  defineWebSite({
            name: 'Ceremly',
            description: computed(() => t('landing.seo.description')),
  ```
  Sostituire con:
  ```ts
  defineWebSite({
            name: appName.value,
            description: computed(() => t('landing.seo.description')),
  ```

- [ ] Aggiungere `twitterHandle` al runtimeConfig public. In `server/utils/runtimeConfig.ts`, nel blocco `public:` (dopo `appName: process.env.NUXT_PUBLIC_APP_NAME,` riga 64) inserire:
  ```ts
  twitterHandle: process.env.NUXT_PUBLIC_TWITTER_HANDLE,
  ```

- [ ] Verificare:
  ```bash
  grep -ci ceremly /Users/airowlgasga/coding/project/boilerplate-saas/app/app.vue
  ```
  Output atteso: `0`.

- [ ] Commit:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add app/app.vue server/utils/runtimeConfig.ts && git commit -m "refactor: env-driven brand/twitter handle in app.vue"
  ```

---

## Task 6 — Rebrand-sweep `AppHeader.vue` + `AppFooter.vue` (env-driven)

**Files:**
- Modify: `app/components/landing/AppHeader.vue:24`, `app/components/landing/AppFooter.vue:13`.
- Verify: `grep -ci ceremly app/components/landing/AppHeader.vue app/components/landing/AppFooter.vue` → 0.

**Steps:**

- [ ] In `AppHeader.vue`, aggiungere `appName` allo script. Cercare (righe 2-4):
  ```ts
  const { t, locale, setLocale } = useI18n()
  const { shouldShowAuthLinks } = useSiteMode()
  const route = useRoute()
  ```
  Sostituire con:
  ```ts
  const { t, locale, setLocale } = useI18n()
  const { shouldShowAuthLinks } = useSiteMode()
  const route = useRoute()
  const appName = computed(() => useRuntimeConfig().public.appName || '')
  ```

- [ ] In `AppHeader.vue`, sostituire la label brand (riga 24). Cercare:
  ```vue
  <span class="text-xl font-bold tracking-tight">Ceremly</span>
  ```
  Sostituire con:
  ```vue
  <span class="text-xl font-bold tracking-tight">{{ appName }}</span>
  ```

- [ ] In `AppFooter.vue`, aggiungere `appName` allo script. Cercare (righe 1-3):
  ```ts
  <script setup lang="ts">
  const { t, locale, setLocale } = useI18n()
  </script>
  ```
  Sostituire con:
  ```ts
  <script setup lang="ts">
  const { t, locale, setLocale } = useI18n()
  const appName = computed(() => useRuntimeConfig().public.appName || '')
  </script>
  ```

- [ ] In `AppFooter.vue`, sostituire la label brand (riga 13). Cercare:
  ```vue
  <span class="text-lg font-bold">Ceremly</span>
  ```
  Sostituire con:
  ```vue
  <span class="text-lg font-bold">{{ appName }}</span>
  ```

- [ ] Verificare:
  ```bash
  grep -ci ceremly /Users/airowlgasga/coding/project/boilerplate-saas/app/components/landing/AppHeader.vue /Users/airowlgasga/coding/project/boilerplate-saas/app/components/landing/AppFooter.vue
  ```
  Output atteso: `0` per entrambi.

- [ ] Commit:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add app/components/landing/AppHeader.vue app/components/landing/AppFooter.vue && git commit -m "refactor: env-driven brand label in landing header/footer"
  ```

---

## Task 7 — Rebrand-sweep `index.vue` + `blogs/index.vue` + `blogs/[slug].vue` (env-driven)

**Files:**
- Modify: `app/pages/index.vue:14,40`, `app/pages/blogs/index.vue:12`, `app/pages/blogs/[slug].vue:13,82-89`.
- Verify: `grep -ci ceremly app/pages/index.vue app/pages/blogs/index.vue app/pages/blogs/[slug].vue` → 0.

Nota: `runtimeConfig.public.baseURL` legge `NUXT_PUBLIC_BASE_URL` (verificato in `server/utils/runtimeConfig.ts:63`). Il fallback brand `'https://ceremly.it'` va sostituito con stringa vuota (env-driven, niente brand fisso).

**Steps:**

- [ ] In `index.vue`, sostituire il fallback baseUrl (riga 14). Cercare:
  ```ts
  const baseUrl = (runtimeConfig.public.baseURL as string || 'https://ceremly.it').replace(/\/$/, '')
  ```
  Sostituire con:
  ```ts
  const baseUrl = ((runtimeConfig.public.baseURL as string) || '').replace(/\/$/, '')
  ```

- [ ] In `index.vue`, sostituire il `name` di `SoftwareApplication` (riga 40). Cercare:
  ```ts
  '@type': 'SoftwareApplication',
        'name': 'Ceremly',
  ```
  Sostituire con:
  ```ts
  '@type': 'SoftwareApplication',
        'name': (runtimeConfig.public.appName as string) || '',
  ```

- [ ] In `blogs/index.vue`, sostituire il fallback baseUrl (riga 12). Cercare:
  ```ts
  const baseUrl = (runtimeConfig.public.baseURL as string || 'https://ceremly.it').replace(/\/$/, '')
  ```
  Sostituire con:
  ```ts
  const baseUrl = ((runtimeConfig.public.baseURL as string) || '').replace(/\/$/, '')
  ```

- [ ] In `blogs/[slug].vue`, sostituire il fallback baseUrl (riga 13). Cercare:
  ```ts
  const baseUrl = (runtimeConfig.public.baseURL as string || 'https://ceremly.it').replace(/\/$/, '')
  ```
  Sostituire con:
  ```ts
  const baseUrl = ((runtimeConfig.public.baseURL as string) || '').replace(/\/$/, '')
  ```

- [ ] In `blogs/[slug].vue`, sostituire il set `knownOgSlugs` con gli slug dei blog placeholder (vedi Task 12). Cercare (righe 82-89):
  ```ts
  const knownOgSlugs = new Set([
        'gestione-rsvp-matrimonio',
        'wedding-rsvp-management',
        'errori-comuni-organizzazione-eventi',
        'common-event-planning-mistakes',
        'whatsapp-vs-email-inviti',
        'whatsapp-vs-email-invitations',
    ])
  ```
  Sostituire con:
  ```ts
  const knownOgSlugs = new Set<string>([])
  ```
  (I blog placeholder non hanno OG immagini dedicate in `public/og/`; la pagina ripiega su `article.cover` o nessuna OG image.)

- [ ] Verificare:
  ```bash
  grep -ci ceremly /Users/airowlgasga/coding/project/boilerplate-saas/app/pages/index.vue /Users/airowlgasga/coding/project/boilerplate-saas/app/pages/blogs/index.vue "/Users/airowlgasga/coding/project/boilerplate-saas/app/pages/blogs/[slug].vue"
  ```
  Output atteso: `0` per tutti.

- [ ] Nota sul vocabolario gate: in `[slug].vue` restano `shareOnWhatsApp` / l'icona WhatsApp dei bottoni di condivisione social. **Questo è una feature di condivisione social generica legittima** (accanto a X/Facebook/LinkedIn), non copy event-specific: il vocabolario gate la valuta case-by-case e NON va rimossa. Annotare per il gate finale (Task 15).

- [ ] Commit:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add "app/pages/index.vue" "app/pages/blogs/index.vue" "app/pages/blogs/[slug].vue" && git commit -m "refactor: env-driven baseUrl + clean known og slugs in landing/blog pages"
  ```

---

## Task 8 — Rebrand-sweep `app/assets/css/main.css`

**Files:**
- Modify: `app/assets/css/main.css:6`.
- Verify: `grep -ci ceremly app/assets/css/main.css` → 0.

**Steps:**

- [ ] Sostituire il commento header (righe 5-8). Cercare:
  ```css
  /* ════════════════════════════════════════════════════════
     Ceremly Design System for Nuxt UI 4
     Warm earthy palette · Soft corners · Light mode
     ════════════════════════════════════════════════════════ */
  ```
  Sostituire con:
  ```css
  /* ════════════════════════════════════════════════════════
     Design System for Nuxt UI 4
     Warm earthy palette · Soft corners · Light mode
     ════════════════════════════════════════════════════════ */
  ```

- [ ] Verificare:
  ```bash
  grep -ci ceremly /Users/airowlgasga/coding/project/boilerplate-saas/app/assets/css/main.css
  ```
  Output atteso: `0`.

- [ ] Commit:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add app/assets/css/main.css && git commit -m "chore: neutral design-system header comment"
  ```

---

## Task 9 — Rewrite blocco `landing` i18n (it/en)

**Files:**
- Modify: `i18n/locales/it-IT.json` (righe 2-366, blocco `landing`), `i18n/locales/en-US.json` (righe 2-366, blocco `landing`).
- Verify: `grep -ciE 'ceremly|rsvp|whatsapp|matrimoni|wedding|evento|event' i18n/locales/it-IT.json i18n/locales/en-US.json` valutato (vedi sotto).

Il blocco `landing` va riscritto con copy generico SaaS B2B (org/team/billing), mantenendo **tutte** le keys consumate da `index.vue`, `AppHeader.vue`, `AppFooter.vue` (verificate: `nav.*`, `hero.*` incl. `mockup.*`, `waitlistHero.*`, `features.*` incl. `cards.email/whatsapp/socialProof`, `dashboard.*` incl. `mockup.*`, `whatsapp.*` incl. `mockup.*`, `pricing.*`, `finalCta.*`, `seo.*`, `landingFooter.*`, `faq.*` con `questions.q1..q6`, `waitingList.*`, `contact.*`, `newsletter.*`, più le keys non consumate da index.vue ma presenti: `howItWorks.*`, `forWho.*`, `trust.*`, `why.*`). Le keys vanno **mantenute identiche** (i template e altri componenti possono referenziarle); cambia solo il valore.

Nota: `index.vue` ha sezioni con icone/mockup che parlano di "whatsapp" come canale (`features.cards.whatsapp`, sezione `whatsapp`). Poiché il prodotto-evento non esiste più, queste sezioni vanno **riusate come generiche feature SaaS** mantenendo le stesse keys (es. `cards.whatsapp` → feature "Notifiche"/"Integrazioni"). Il template `index.vue` non viene modificato qui: solo i valori i18n cambiano.

**Steps:**

- [ ] In `it-IT.json`, sostituire l'intero blocco `landing` (dall'apertura `"landing": {` riga 2 alla sua chiusura `},` riga 366 inclusa) con il seguente (copy generico SaaS B2B, italiano con accenti corretti):

```json
    "landing": {
        "nav": {
            "features": "Funzionalità",
            "pricing": "Prezzi",
            "clients": "Clienti",
            "blog": "Blog",
            "getStarted": "Inizia ora"
        },
        "hero": {
            "badge": "Boilerplate SaaS pronto al lancio",
            "title": "Lancia il tuo SaaS multi-tenant in",
            "titleHighlight": "tempo record",
            "subtitle": "Tutto ciò che ti serve per partire: organizzazioni, team, abbonamenti, autenticazione e billing. Concentrati sul prodotto, non sull'infrastruttura.",
            "cta": "Inizia subito",
            "ctaSecondary": "Scopri come funziona",
            "socialProofCount": "+400",
            "socialProofUsers": "400+ team",
            "socialProofText": "lo stanno usando!",
            "mockup": {
                "whatsappTitle": "Nuovo membro nel team",
                "whatsappDesc": "Marco Rossi si è unito all'organizzazione",
                "whatsappTime": "Adesso",
                "emailTitle": "Abbonamento attivato",
                "emailDesc": "Giulia Bianchi ha avviato il piano Premium",
                "emailTime": "2m fa",
                "rsvpComplete": "Onboarding completato",
                "rsvpPercent": "85% configurato"
            }
        },
        "waitlistHero": {
            "title": "Iscriviti alla lista d'attesa",
            "description": "Sii tra i primi a provare la piattaforma e ottieni accesso prioritario con uno sconto a vita.",
            "placeholder": "La tua email migliore",
            "cta": "Unisciti alla lista d'attesa",
            "privacy": "Nessuno spam, solo aggiornamenti importanti."
        },
        "features": {
            "badge": "Perché sceglierci?",
            "title": "Tutto ciò che ti serve per gestire il tuo SaaS",
            "subtitle": "Strumenti pensati per far crescere il tuo prodotto e i tuoi team senza attriti.",
            "cards": {
                "email": {
                    "title": "Organizzazioni & Team",
                    "description": "Multi-tenancy B2B-first: ogni account è un'organizzazione con membri, ruoli e permessi pronti all'uso."
                },
                "whatsapp": {
                    "title": "Billing integrato",
                    "description": "Abbonamenti ricorrenti, piani, trial e limiti per piano già collegati: incassa dal primo giorno."
                },
                "socialProof": {
                    "title": "Auth completa",
                    "description": "Email/password, Google OAuth e autenticazione a due fattori, con sessioni sicure e gestione profilo."
                }
            }
        },
        "dashboard": {
            "badge": "Dashboard in tempo reale",
            "title": "Tieni tutto sotto controllo",
            "description": "Una dashboard chiara che mostra membri, abbonamenti e attività del tuo team. Esporta i dati quando vuoi.",
            "check1": "Gestione membri e ruoli",
            "check2": "Export dei dati in un click",
            "check3": "Audit log delle attività",
            "mockup": {
                "eventName": "La tua organizzazione",
                "active": "Attiva",
                "confirmed": "Membri attivi",
                "confirmedValue": "84% (126)",
                "waiting": "Inviti in sospeso",
                "waitingValue": "12% (18)",
                "declined": "Disattivati",
                "declinedValue": "4% (6)"
            }
        },
        "whatsapp": {
            "badge": "Serverless by design",
            "title": "Infrastruttura scalabile, zero manutenzione",
            "description": "Deploy su Vercel, database Neon serverless, code di lavoro su QStash e cron gestiti. Nessun processo da tenere acceso: il codice si sveglia solo quando serve.",
            "cta": "Scopri lo stack",
            "mockup": {
                "contactName": "Il tuo team",
                "message1": "Ciao! Ecco il riepilogo della tua organizzazione:",
                "linkTitle": "Dashboard",
                "linkUrl": "app.example.com",
                "linkCta": "Apri la dashboard",
                "reply": "Perfetto, configurato in un attimo!",
                "inputPlaceholder": "Scrivi un messaggio"
            }
        },
        "pricing": {
            "badge": "Prezzi",
            "title": "Scegli il piano giusto per il tuo team",
            "description": "Scegli il piano che fa per te.",
            "recommended": "Consigliato",
            "perEvent": "/progetto",
            "perMonth": "/mese",
            "cta": "Inizia ora",
            "note": "Fatturazione mensile o annuale. Disdici quando vuoi.",
            "billing": {
                "monthly": "Mensile",
                "yearly": "Annuale",
                "perMonth": "/mese",
                "perYear": "/anno",
                "savings": "Risparmi {amount} all'anno"
            },
            "tiers": {
                "starter": {
                    "title": "Starter",
                    "description": "Ideale per progetti personali e piccoli team.",
                    "cta": "Inizia ora"
                },
                "premium": {
                    "title": "Premium",
                    "description": "Perfetto per team in crescita e startup.",
                    "cta": "Inizia ora",
                    "badge": "Consigliato"
                },
                "agency": {
                    "title": "Agency",
                    "description": "Per agenzie e aziende con più organizzazioni.",
                    "cta": "Inizia ora"
                }
            }
        },
        "finalCta": {
            "title": "Pronto a lanciare il tuo SaaS?",
            "description": "Iscriviti oggi e ricevi un mese di piano Premium gratuito al lancio ufficiale.",
            "placeholder": "Inserisci la tua email",
            "cta": "Unisciti alla lista d'attesa"
        },
        "seo": {
            "title": "Boilerplate SaaS multi-tenant pronto al lancio",
            "description": "Boilerplate SaaS multi-tenant con organizzazioni, team, abbonamenti, autenticazione e billing. Lancia il tuo prodotto più velocemente.",
            "ogTitle": "Boilerplate SaaS multi-tenant — lancia più velocemente",
            "ogDescription": "Organizzazioni, team, billing e auth pronti all'uso. Concentrati sul prodotto, non sull'infrastruttura.",
            "keywords": "saas boilerplate, multi-tenant, organizzazioni, team, abbonamenti, autenticazione, billing, nuxt, starter kit"
        },
        "landingFooter": {
            "privacy": "Privacy Policy",
            "terms": "Termini di Servizio",
            "contacts": "Contatti",
            "blog": "Blog",
            "copyright": "Tutti i diritti riservati."
        },
        "howItWorks": {
            "title": "Inizia in 3 semplici step",
            "subtitle": "Dalla registrazione alla produzione in pochi minuti, non mesi.",
            "step1": {
                "title": "Step 1 - Crea la tua organizzazione",
                "description": "Registrati e crea la tua organizzazione in pochi secondi. Invita il team e configura i ruoli.",
                "highlight": "La tua organizzazione è pronta subito dopo la registrazione."
            },
            "step2": {
                "title": "Step 2 - Configura il prodotto",
                "description": "Collega gli abbonamenti, imposta i limiti per piano e personalizza il branding via variabili d'ambiente.",
                "highlight": "Tutto già cablato: parti senza scrivere infrastruttura."
            },
            "step3": {
                "title": "Step 3 - Lancia e cresci",
                "description": "Deploy su Vercel, monitora le attività dalla dashboard ed esporta i dati quando serve.",
                "highlight": "Tutto sotto controllo, in un'unica dashboard."
            },
            "cta": "Inizia ora"
        },
        "forWho": {
            "title": "Costruito per chi lancia SaaS",
            "subtitle": "Che tu stia lanciando un nuovo prodotto o gestendo più clienti, la piattaforma si adatta alle tue esigenze.",
            "planner": {
                "title": "Per builder",
                "feature1": "Startup e indie hacker",
                "feature2": "Prodotti B2B",
                "feature3": "MVP e prototipi"
            },
            "couples": {
                "title": "Per professionisti",
                "feature1": "Agenzie di sviluppo",
                "feature2": "Studi di consulenza",
                "feature3": "Team di prodotto"
            }
        },
        "trust": {
            "badge": "Sicurezza & Privacy",
            "title": "I tuoi dati sono al sicuro",
            "subtitle": "Privacy e sicurezza dei dati come priorità assoluta.",
            "emailDelivery": {
                "title": "Email Sicure",
                "description": "Invii verificati con SPF/DKIM per massima deliverability.",
                "benefit1": "Nessun rischio di finire in spam",
                "benefit2": "Tracciamento aperture in tempo reale"
            },
            "privacy": {
                "title": "Conforme al GDPR",
                "description": "Dati protetti e trattati secondo le normative europee.",
                "benefit1": "Export e cancellazione dei dati su richiesta",
                "benefit2": "Nessuna condivisione con terze parti"
            },
            "cta": {
                "description": "Pronto a lanciare il tuo SaaS?",
                "primary": "Entra in lista d'attesa",
                "secondary": "Scopri di più"
            }
        },
        "why": {
            "badge": "Perché noi",
            "title": "Perché sceglierci",
            "benefits": {
                "hub": {
                    "title": "Tutto in un'unica piattaforma",
                    "description": "Auth, billing, team e storage in un'unica soluzione."
                },
                "efficiency": {
                    "title": "Lancio più veloce",
                    "description": "Infrastruttura pronta: dal clone al deploy in poche ore."
                },
                "accessibility": {
                    "title": "Facile da personalizzare",
                    "description": "Branding env-driven e convenzioni chiare. Pronto all'uso."
                }
            },
            "mission": {
                "badge": "La nostra missione",
                "description": "Crediamo che lanciare un SaaS dovrebbe essere veloce e piacevole. Eliminiamo il lavoro ripetitivo di setup per farti concentrare sul prodotto."
            }
        },
        "faq": {
            "title": "Domande Frequenti",
            "subtitle": "Tutto quello che ti serve sapere prima di iniziare.",
            "questions": {
                "q1": {
                    "question": "Come funziona la piattaforma?",
                    "answer": "Crei la tua organizzazione, inviti il team e configuri il prodotto. Auth, billing e multi-tenancy sono già pronti: parti dal primo giorno."
                },
                "q2": {
                    "question": "Servono competenze tecniche?",
                    "answer": "Per personalizzare il branding bastano poche variabili d'ambiente. Per estendere il prodotto serve conoscere Nuxt e TypeScript."
                },
                "q3": {
                    "question": "È davvero multi-tenant?",
                    "answer": "Sì. Ogni account è un'organizzazione e ogni risorsa è isolata per tenant. Il modello è B2B-first con il B2C come caso particolare."
                },
                "q4": {
                    "question": "I dati sono al sicuro?",
                    "answer": "Assolutamente. Usiamo crittografia standard, siamo conformi al GDPR e supportiamo export e cancellazione dei dati su richiesta."
                },
                "q5": {
                    "question": "Posso provare prima di pagare?",
                    "answer": "Iscriviti alla lista d'attesa per ottenere accesso prioritario e uno sconto a vita. I primi utenti avranno anche un mese Premium gratuito."
                },
                "q6": {
                    "question": "Quando sarà disponibile?",
                    "answer": "Stiamo lavorando al lancio. Iscriviti alla lista d'attesa per essere tra i primi a provare la piattaforma e ricevere aggiornamenti."
                }
            }
        },
        "waitingList": {
            "badge": "Coming Soon",
            "title": "Unisciti alla Waiting List",
            "description": "Sii tra i primi ad ottenere l'accesso quando lanceremo. I primi utenti ottengono vantaggi esclusivi.",
            "placeholder": "Inserisci il tuo indirizzo email",
            "submitButton": "Unisciti alla Lista",
            "submittedButton": "Sei dentro!",
            "successTitle": "Benvenuto a bordo!",
            "successMessage": "Grazie per esserti iscritto! Ti abbiamo inviato un'email di conferma.",
            "successMessageNoEmail": "Grazie per esserti iscritto! Ti avviseremo non appena lanceremo.",
            "alreadySubscribedTitle": "Già iscritto",
            "alreadySubscribedMessage": "Questa email è già nella waiting list. Ti avviseremo al lancio!",
            "errorTitle": "Oops!",
            "errorMessage": "Qualcosa è andato storto. Riprova più tardi.",
            "privacyNote": "Rispettiamo la tua privacy. Niente spam, mai.",
            "validation": {
                "invalidEmail": "Inserisci un indirizzo email valido"
            },
            "features": {
                "earlyAccess": {
                    "title": "Accesso Anticipato",
                    "description": "Sii il primo a testare la piattaforma"
                },
                "specialBenefits": {
                    "title": "Vantaggi Speciali",
                    "description": "Sconti esclusivi per i primi utenti"
                },
                "updates": {
                    "title": "Aggiornamenti Prioritari",
                    "description": "Rimani informato su ogni traguardo"
                }
            }
        },
        "contact": {
            "badge": "Contattaci",
            "title": "Hai domande? Siamo qui per aiutarti",
            "description": "Compila il form e ti risponderemo entro 24 ore.",
            "nameLabel": "Nome",
            "emailLabel": "Email",
            "subjectLabel": "Oggetto",
            "messageLabel": "Messaggio",
            "namePlaceholder": "Il tuo nome",
            "emailPlaceholder": "Il tuo indirizzo email",
            "subjectPlaceholder": "Di cosa vuoi parlare?",
            "messagePlaceholder": "Scrivi il tuo messaggio qui...",
            "submitButton": "Invia messaggio",
            "submittedButton": "Messaggio inviato!",
            "successTitle": "Messaggio inviato!",
            "successMessage": "Grazie per averci contattato. Ti risponderemo il prima possibile.",
            "errorTitle": "Oops!",
            "errorMessage": "Qualcosa è andato storto. Riprova più tardi.",
            "privacyNote": "I tuoi dati sono al sicuro. Li usiamo solo per risponderti.",
            "validation": {
                "requiredName": "Il nome è obbligatorio",
                "requiredEmail": "L'email è obbligatoria",
                "requiredSubject": "L'oggetto è obbligatorio",
                "requiredMessage": "Il messaggio è obbligatorio",
                "invalidName": "Il nome deve contenere almeno 2 caratteri",
                "invalidEmail": "Inserisci un indirizzo email valido",
                "invalidSubject": "L'oggetto deve contenere almeno 3 caratteri",
                "invalidMessage": "Il messaggio deve contenere almeno 10 caratteri"
            },
            "info": {
                "email": {
                    "title": "Email",
                    "value": "hello{'@'}example.com"
                },
                "hours": {
                    "title": "Orari",
                    "value": "Lun-Ven, 9:00-18:00"
                },
                "response": {
                    "title": "Tempi di risposta",
                    "value": "Entro 24 ore lavorative"
                }
            }
        },
        "newsletter": {
            "badge": "Rimani Aggiornato",
            "title": "Iscriviti alla Newsletter",
            "description": "Ricevi le ultime novità direttamente nella tua casella di posta.",
            "nameLabel": "Nome",
            "emailLabel": "Email",
            "namePlaceholder": "Il tuo nome",
            "emailPlaceholder": "Il tuo indirizzo email",
            "submitButton": "Iscriviti",
            "submittedButton": "Iscritto!",
            "successTitle": "Benvenuto!",
            "successMessage": "Grazie per esserti iscritto!",
            "errorTitle": "Oops!",
            "errorMessage": "Qualcosa è andato storto. Riprova più tardi.",
            "privacyNote": "Rispettiamo la tua privacy. Niente spam, mai.",
            "validation": {
                "invalidName": "Il nome deve contenere almeno 2 caratteri",
                "invalidEmail": "Inserisci un indirizzo email valido"
            },
            "features": {
                "exclusiveContent": {
                    "title": "Contenuti Esclusivi",
                    "description": "Accedi a consigli e guide riservate"
                },
                "specialOffers": {
                    "title": "Offerte Speciali",
                    "description": "Sii il primo a conoscere promozioni"
                },
                "updates": {
                    "title": "Ultimi Aggiornamenti",
                    "description": "Rimani informato su nuove funzionalità"
                }
            }
        }
    },
```

- [ ] In `en-US.json`, sostituire l'intero blocco `landing` (apertura `"landing": {` riga 2 → chiusura `},` riga 366) con il mirror EN:

```json
    "landing": {
        "nav": {
            "features": "Features",
            "pricing": "Pricing",
            "clients": "Clients",
            "blog": "Blog",
            "getStarted": "Get started"
        },
        "hero": {
            "badge": "SaaS boilerplate ready to ship",
            "title": "Launch your multi-tenant SaaS in",
            "titleHighlight": "record time",
            "subtitle": "Everything you need to start: organizations, teams, subscriptions, authentication and billing. Focus on your product, not the infrastructure.",
            "cta": "Get started",
            "ctaSecondary": "See how it works",
            "socialProofCount": "+400",
            "socialProofUsers": "400+ teams",
            "socialProofText": "are using it!",
            "mockup": {
                "whatsappTitle": "New team member",
                "whatsappDesc": "Marco Rossi joined the organization",
                "whatsappTime": "Now",
                "emailTitle": "Subscription activated",
                "emailDesc": "Giulia Bianchi started the Premium plan",
                "emailTime": "2m ago",
                "rsvpComplete": "Onboarding complete",
                "rsvpPercent": "85% configured"
            }
        },
        "waitlistHero": {
            "title": "Join the waiting list",
            "description": "Be among the first to try the platform and get priority access with a lifetime discount.",
            "placeholder": "Your best email",
            "cta": "Join the waiting list",
            "privacy": "No spam, just important updates."
        },
        "features": {
            "badge": "Why choose us?",
            "title": "Everything you need to run your SaaS",
            "subtitle": "Tools designed to grow your product and your teams without friction.",
            "cards": {
                "email": {
                    "title": "Organizations & Teams",
                    "description": "B2B-first multi-tenancy: every account is an organization with members, roles and permissions out of the box."
                },
                "whatsapp": {
                    "title": "Built-in billing",
                    "description": "Recurring subscriptions, plans, trials and per-plan limits already wired: get paid from day one."
                },
                "socialProof": {
                    "title": "Complete auth",
                    "description": "Email/password, Google OAuth and two-factor authentication, with secure sessions and profile management."
                }
            }
        },
        "dashboard": {
            "badge": "Real-time dashboard",
            "title": "Keep everything under control",
            "description": "A clear dashboard showing members, subscriptions and your team's activity. Export your data anytime.",
            "check1": "Member and role management",
            "check2": "One-click data export",
            "check3": "Activity audit log",
            "mockup": {
                "eventName": "Your organization",
                "active": "Active",
                "confirmed": "Active members",
                "confirmedValue": "84% (126)",
                "waiting": "Pending invites",
                "waitingValue": "12% (18)",
                "declined": "Deactivated",
                "declinedValue": "4% (6)"
            }
        },
        "whatsapp": {
            "badge": "Serverless by design",
            "title": "Scalable infrastructure, zero maintenance",
            "description": "Deploy on Vercel, Neon serverless database, QStash work queues and managed cron. No process to keep running: the code wakes up only when needed.",
            "cta": "Explore the stack",
            "mockup": {
                "contactName": "Your team",
                "message1": "Hi! Here is your organization summary:",
                "linkTitle": "Dashboard",
                "linkUrl": "app.example.com",
                "linkCta": "Open the dashboard",
                "reply": "Perfect, set up in no time!",
                "inputPlaceholder": "Type a message"
            }
        },
        "pricing": {
            "badge": "Pricing",
            "title": "Pick the right plan for your team",
            "description": "Choose the plan that fits you.",
            "recommended": "Recommended",
            "perEvent": "/project",
            "perMonth": "/month",
            "cta": "Get started",
            "note": "Monthly or yearly billing. Cancel anytime.",
            "billing": {
                "monthly": "Monthly",
                "yearly": "Yearly",
                "perMonth": "/month",
                "perYear": "/year",
                "savings": "Save {amount} per year"
            },
            "tiers": {
                "starter": {
                    "title": "Starter",
                    "description": "Ideal for personal projects and small teams.",
                    "cta": "Get started"
                },
                "premium": {
                    "title": "Premium",
                    "description": "Perfect for growing teams and startups.",
                    "cta": "Get started",
                    "badge": "Recommended"
                },
                "agency": {
                    "title": "Agency",
                    "description": "For agencies and companies with multiple organizations.",
                    "cta": "Get started"
                }
            }
        },
        "finalCta": {
            "title": "Ready to launch your SaaS?",
            "description": "Sign up today and get one month of the Premium plan free at official launch.",
            "placeholder": "Enter your email",
            "cta": "Join the waiting list"
        },
        "seo": {
            "title": "Multi-tenant SaaS boilerplate ready to ship",
            "description": "Multi-tenant SaaS boilerplate with organizations, teams, subscriptions, authentication and billing. Launch your product faster.",
            "ogTitle": "Multi-tenant SaaS boilerplate — launch faster",
            "ogDescription": "Organizations, teams, billing and auth out of the box. Focus on your product, not the infrastructure.",
            "keywords": "saas boilerplate, multi-tenant, organizations, teams, subscriptions, authentication, billing, nuxt, starter kit"
        },
        "landingFooter": {
            "privacy": "Privacy Policy",
            "terms": "Terms of Service",
            "contacts": "Contact",
            "blog": "Blog",
            "copyright": "All rights reserved."
        },
        "howItWorks": {
            "title": "Get started in 3 simple steps",
            "subtitle": "From signup to production in minutes, not months.",
            "step1": {
                "title": "Step 1 - Create your organization",
                "description": "Sign up and create your organization in seconds. Invite your team and set up roles.",
                "highlight": "Your organization is ready right after signup."
            },
            "step2": {
                "title": "Step 2 - Configure your product",
                "description": "Wire up subscriptions, set per-plan limits and customize branding via environment variables.",
                "highlight": "Everything pre-wired: start without writing infrastructure."
            },
            "step3": {
                "title": "Step 3 - Launch and grow",
                "description": "Deploy on Vercel, monitor activity from the dashboard and export data whenever you need.",
                "highlight": "Everything under control, in a single dashboard."
            },
            "cta": "Get started"
        },
        "forWho": {
            "title": "Built for SaaS builders",
            "subtitle": "Whether you are launching a new product or managing multiple clients, the platform adapts to your needs.",
            "planner": {
                "title": "For builders",
                "feature1": "Startups and indie hackers",
                "feature2": "B2B products",
                "feature3": "MVPs and prototypes"
            },
            "couples": {
                "title": "For professionals",
                "feature1": "Development agencies",
                "feature2": "Consulting firms",
                "feature3": "Product teams"
            }
        },
        "trust": {
            "badge": "Security & Privacy",
            "title": "Your data is safe",
            "subtitle": "Data privacy and security as the top priority.",
            "emailDelivery": {
                "title": "Secure Email",
                "description": "Verified delivery with SPF/DKIM for maximum deliverability.",
                "benefit1": "No risk of landing in spam",
                "benefit2": "Real-time open tracking"
            },
            "privacy": {
                "title": "GDPR Compliant",
                "description": "Data protected and handled according to European regulations.",
                "benefit1": "Data export and deletion on request",
                "benefit2": "No sharing with third parties"
            },
            "cta": {
                "description": "Ready to launch your SaaS?",
                "primary": "Join the waiting list",
                "secondary": "Learn more"
            }
        },
        "why": {
            "badge": "Why us",
            "title": "Why choose us",
            "benefits": {
                "hub": {
                    "title": "Everything in one platform",
                    "description": "Auth, billing, teams and storage in a single solution."
                },
                "efficiency": {
                    "title": "Faster launch",
                    "description": "Ready-made infrastructure: from clone to deploy in hours."
                },
                "accessibility": {
                    "title": "Easy to customize",
                    "description": "Env-driven branding and clear conventions. Ready to use."
                }
            },
            "mission": {
                "badge": "Our mission",
                "description": "We believe launching a SaaS should be fast and enjoyable. We remove the repetitive setup work so you can focus on the product."
            }
        },
        "faq": {
            "title": "Frequently Asked Questions",
            "subtitle": "Everything you need to know before getting started.",
            "questions": {
                "q1": {
                    "question": "How does the platform work?",
                    "answer": "You create your organization, invite your team and configure your product. Auth, billing and multi-tenancy are ready: start from day one."
                },
                "q2": {
                    "question": "Do I need technical skills?",
                    "answer": "Customizing the branding takes a few environment variables. Extending the product requires knowing Nuxt and TypeScript."
                },
                "q3": {
                    "question": "Is it really multi-tenant?",
                    "answer": "Yes. Every account is an organization and every resource is isolated per tenant. The model is B2B-first with B2C as a special case."
                },
                "q4": {
                    "question": "Is my data safe?",
                    "answer": "Absolutely. We use standard encryption, are GDPR compliant and support data export and deletion on request."
                },
                "q5": {
                    "question": "Can I try before paying?",
                    "answer": "Join the waiting list to get priority access and a lifetime discount. Early users also get one month of Premium free."
                },
                "q6": {
                    "question": "When will it be available?",
                    "answer": "We are working on the launch. Join the waiting list to be among the first to try the platform and get updates."
                }
            }
        },
        "waitingList": {
            "badge": "Coming Soon",
            "title": "Join the Waiting List",
            "description": "Be among the first to get access when we launch. Early users get exclusive benefits.",
            "placeholder": "Enter your email address",
            "submitButton": "Join the List",
            "submittedButton": "You're in!",
            "successTitle": "Welcome aboard!",
            "successMessage": "Thanks for signing up! We've sent you a confirmation email.",
            "successMessageNoEmail": "Thanks for signing up! We'll notify you as soon as we launch.",
            "alreadySubscribedTitle": "Already subscribed",
            "alreadySubscribedMessage": "This email is already on the waiting list. We'll notify you at launch!",
            "errorTitle": "Oops!",
            "errorMessage": "Something went wrong. Please try again later.",
            "privacyNote": "We respect your privacy. No spam, ever.",
            "validation": {
                "invalidEmail": "Enter a valid email address"
            },
            "features": {
                "earlyAccess": {
                    "title": "Early Access",
                    "description": "Be the first to test the platform"
                },
                "specialBenefits": {
                    "title": "Special Benefits",
                    "description": "Exclusive discounts for early users"
                },
                "updates": {
                    "title": "Priority Updates",
                    "description": "Stay informed on every milestone"
                }
            }
        },
        "contact": {
            "badge": "Contact us",
            "title": "Have questions? We're here to help",
            "description": "Fill out the form and we'll get back to you within 24 hours.",
            "nameLabel": "Name",
            "emailLabel": "Email",
            "subjectLabel": "Subject",
            "messageLabel": "Message",
            "namePlaceholder": "Your name",
            "emailPlaceholder": "Your email address",
            "subjectPlaceholder": "What do you want to talk about?",
            "messagePlaceholder": "Write your message here...",
            "submitButton": "Send message",
            "submittedButton": "Message sent!",
            "successTitle": "Message sent!",
            "successMessage": "Thanks for contacting us. We'll reply as soon as possible.",
            "errorTitle": "Oops!",
            "errorMessage": "Something went wrong. Please try again later.",
            "privacyNote": "Your data is safe. We only use it to reply to you.",
            "validation": {
                "requiredName": "Name is required",
                "requiredEmail": "Email is required",
                "requiredSubject": "Subject is required",
                "requiredMessage": "Message is required",
                "invalidName": "Name must be at least 2 characters",
                "invalidEmail": "Enter a valid email address",
                "invalidSubject": "Subject must be at least 3 characters",
                "invalidMessage": "Message must be at least 10 characters"
            },
            "info": {
                "email": {
                    "title": "Email",
                    "value": "hello{'@'}example.com"
                },
                "hours": {
                    "title": "Hours",
                    "value": "Mon-Fri, 9:00-18:00"
                },
                "response": {
                    "title": "Response time",
                    "value": "Within 24 business hours"
                }
            }
        },
        "newsletter": {
            "badge": "Stay Updated",
            "title": "Subscribe to the Newsletter",
            "description": "Get the latest news straight to your inbox.",
            "nameLabel": "Name",
            "emailLabel": "Email",
            "namePlaceholder": "Your name",
            "emailPlaceholder": "Your email address",
            "submitButton": "Subscribe",
            "submittedButton": "Subscribed!",
            "successTitle": "Welcome!",
            "successMessage": "Thanks for subscribing!",
            "errorTitle": "Oops!",
            "errorMessage": "Something went wrong. Please try again later.",
            "privacyNote": "We respect your privacy. No spam, ever.",
            "validation": {
                "invalidName": "Name must be at least 2 characters",
                "invalidEmail": "Enter a valid email address"
            },
            "features": {
                "exclusiveContent": {
                    "title": "Exclusive Content",
                    "description": "Access tips and reserved guides"
                },
                "specialOffers": {
                    "title": "Special Offers",
                    "description": "Be the first to know about promotions"
                },
                "updates": {
                    "title": "Latest Updates",
                    "description": "Stay informed on new features"
                }
            }
        }
    },
```

- [ ] Verificare che i JSON siano validi:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && node -e "JSON.parse(require('fs').readFileSync('i18n/locales/it-IT.json','utf8')); JSON.parse(require('fs').readFileSync('i18n/locales/en-US.json','utf8')); console.log('JSON OK')"
  ```
  Output atteso: `JSON OK`.

- [ ] Verificare assenza brand/vocabolario stale nel blocco landing (righe 2-366). Estrarre il blocco e controllare:
  ```bash
  sed -n '2,366p' /Users/airowlgasga/coding/project/boilerplate-saas/i18n/locales/it-IT.json | grep -inE 'ceremly|rsvp|matrimoni|wedding|invitati|evento privato|deep link whatsapp'
  sed -n '2,366p' /Users/airowlgasga/coding/project/boilerplate-saas/i18n/locales/en-US.json | grep -inE 'ceremly|rsvp|matrimoni|wedding|guest|deep link whatsapp'
  ```
  Output atteso: nessun match. (Le keys `whatsapp`/`waitlist`/`rsvpComplete` mockup sono ora valori generici; i NOMI delle keys non cambiano e non sono testo utente.)

- [ ] Commit:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add i18n/locales/it-IT.json i18n/locales/en-US.json && git commit -m "i18n: rewrite landing marketing copy as generic SaaS (it/en)"
  ```

---

## Task 10 — Rebrand email templates (env-driven) + index.ts + email.ts + verify contact

**Files:**
- Modify: `server/emailTemplates/VerificationEmail.ts`, `ResetPasswordEmail.ts`, `WaitingListEmail.ts`, `ContactConfirmationEmail.ts`, `ContactNotificationEmail.ts`, `index.ts`.
- Modify: `server/utils/email.ts` (chiamate a `emailSubjects`).
- Verify/Modify: `server/services/contact.service.ts`.
- Verify: `grep -ci ceremly server/emailTemplates/*.ts` → 0.

Strategia env-driven: ogni template riceve un prop `appName: string`; le `translations` diventano una **factory** `(appName) => ({...})` che interpola `${appName}` nelle stringhe brand-bearing; il render dell'header e del bold usa `appName`. `index.ts` legge `runtimeConfig.public.appName || ''` e lo passa; `emailSubjects` diventa funzioni `(appName) => ({it, en})`. `EventInviteEmail` è già rimosso da 1b: rimuovere ogni residuo import/export/render.

**Steps:**

- [ ] **VerificationEmail.ts** — convertire `translations` in factory e parametrizzare il render.

  Sostituire l'interfaccia props (righe 19-23). Cercare:
  ```ts
  interface VerificationEmailProps {
      language?: 'it' | 'en';
      verificationUrl: string;
      userName?: string;
  }
  ```
  Con:
  ```ts
  interface VerificationEmailProps {
      language?: 'it' | 'en';
      verificationUrl: string;
      userName?: string;
      appName: string;
  }
  ```

  Sostituire il blocco `const translations = { it: {...}, en: {...} };` (righe 25-67) con una factory:
  ```ts
  // Translations (factory: brand name injected via appName)
  const buildTranslations = (appName: string) => ({
      it: {
          preview: `Verifica il tuo indirizzo email per ${appName}`,
          title: 'Verifica il tuo indirizzo email',
          greeting: (name?: string) => name ? `Ciao ${name},` : 'Ciao,',
          intro: `Grazie per esserti registrato su ${appName}, il boilerplate SaaS multi-tenant.`,
          verifyTitle: 'Verifica il tuo account',
          verifyText: 'Clicca il pulsante qui sotto per verificare il tuo indirizzo email e attivare il tuo account.',
          ctaButton: 'Verifica Email',
          expiryNote: 'Questo link scadrà tra 24 ore.',
          alternativeText: 'Se il pulsante non funziona, copia e incolla questo link nel tuo browser:',
          ignoreText: `Se non hai creato un account su ${appName}, puoi ignorare questa email.`,
          signature: 'Cordiali saluti,',
          team: `Il Team di ${appName}`,
          copyright: `© ${new Date().getFullYear()} ${appName}. Tutti i diritti riservati.`,
          privacy: 'Privacy Policy',
          terms: 'Termini di Servizio',
          dpa: 'Data Processing Agreement',
          footer: `Hai ricevuto questa email perché hai creato un account su ${appName}.`,
      },
      en: {
          preview: `Verify your email address for ${appName}`,
          title: 'Verify your email address',
          greeting: (name?: string) => name ? `Hi ${name},` : 'Hi,',
          intro: `Thank you for signing up for ${appName}, the multi-tenant SaaS boilerplate.`,
          verifyTitle: 'Verify your account',
          verifyText: 'Click the button below to verify your email address and activate your account.',
          ctaButton: 'Verify Email',
          expiryNote: 'This link will expire in 24 hours.',
          alternativeText: "If the button doesn't work, copy and paste this link into your browser:",
          ignoreText: `If you didn't create an account on ${appName}, you can ignore this email.`,
          signature: 'Best regards,',
          team: `The ${appName} Team`,
          copyright: `© ${new Date().getFullYear()} ${appName}. All rights reserved.`,
          privacy: 'Privacy Policy',
          terms: 'Terms of Service',
          dpa: 'Data Processing Agreement',
          footer: `You received this email because you created an account on ${appName}.`,
      },
  });
  ```
  (Nota: la riga `address: 'Ceremly - Via Example 123, ...'` viene **rimossa**: indirizzo postale brand-specific non env-derivabile; il footer non lo renderizza più — vedi sotto.)

  Sostituire la firma e l'uso nella funzione. Cercare:
  ```ts
  export function VerificationEmail({
      language = 'it',
      verificationUrl,
      userName,
  }: VerificationEmailProps): React.ReactElement {
      const t = translations[language];
  ```
  Con:
  ```ts
  export function VerificationEmail({
      language = 'it',
      verificationUrl,
      userName,
      appName,
  }: VerificationEmailProps): React.ReactElement {
      const t = buildTranslations(appName)[language];
  ```

  Sostituire il render dell'header (riga ~227). Cercare:
  ```ts
  h(Text, { style: styles.headerBrand }, 'Ceremly')
  ```
  Con:
  ```ts
  h(Text, { style: styles.headerBrand }, appName)
  ```

  Sostituire il bold dell'intro (righe ~233-237). Cercare:
  ```ts
  h(Text, { style: styles.paragraph },
                      t.intro.split('Ceremly')[0],
                      h('strong', null, 'Ceremly'),
                      t.intro.split('Ceremly')[1]
                  ),
  ```
  Con:
  ```ts
  h(Text, { style: styles.paragraph },
                      ...t.intro.split(appName).flatMap((part, i) =>
                          i === 0 ? [part] : [h('strong', { key: i }, appName), part]
                      )
                  ),
  ```

  Sostituire il footer note che renderizzava `t.address` (righe ~269-273). Cercare:
  ```ts
  h(Text, { style: styles.footerNote },
                      t.footer,
                      h('br'),
                      t.address
                  )
  ```
  Con:
  ```ts
  h(Text, { style: styles.footerNote }, t.footer)
  ```

- [ ] **ResetPasswordEmail.ts** — stessa trasformazione. Sostituire l'interfaccia props (cercare `interface ResetPasswordEmailProps {`), aggiungere `appName: string;`. Sostituire il blocco `const translations = { it: {...}, en: {...} };` (righe 25-69) con:
  ```ts
  const buildTranslations = (appName: string) => ({
      it: {
          preview: `Reimposta la tua password di ${appName}`,
          title: 'Reimposta la tua password',
          greeting: (name?: string) => name ? `Ciao ${name},` : 'Ciao,',
          intro: `Abbiamo ricevuto una richiesta per reimpostare la password del tuo account ${appName}.`,
          resetTitle: 'Reimposta la tua password',
          resetText: 'Clicca il pulsante qui sotto per creare una nuova password per il tuo account.',
          ctaButton: 'Reimposta Password',
          expiryNote: 'Questo link scadrà tra 1 ora.',
          alternativeText: 'Se il pulsante non funziona, copia e incolla questo link nel tuo browser:',
          securityNote: 'Se non hai richiesto il reset della password, puoi ignorare questa email. La tua password rimarrà invariata.',
          securityTip: 'Per la tua sicurezza, non condividere mai questo link con nessuno.',
          signature: 'Cordiali saluti,',
          team: `Il Team di ${appName}`,
          copyright: `© ${new Date().getFullYear()} ${appName}. Tutti i diritti riservati.`,
          privacy: 'Privacy Policy',
          terms: 'Termini di Servizio',
          dpa: 'Data Processing Agreement',
          footer: `Hai ricevuto questa email perché hai richiesto il reset della password su ${appName}.`,
      },
      en: {
          preview: `Reset your ${appName} password`,
          title: 'Reset your password',
          greeting: (name?: string) => name ? `Hi ${name},` : 'Hi,',
          intro: `We received a request to reset the password for your ${appName} account.`,
          resetTitle: 'Reset your password',
          resetText: 'Click the button below to create a new password for your account.',
          ctaButton: 'Reset Password',
          expiryNote: 'This link will expire in 1 hour.',
          alternativeText: "If the button doesn't work, copy and paste this link into your browser:",
          securityNote: "If you didn't request a password reset, you can ignore this email. Your password will remain unchanged.",
          securityTip: 'For your security, never share this link with anyone.',
          signature: 'Best regards,',
          team: `The ${appName} Team`,
          copyright: `© ${new Date().getFullYear()} ${appName}. All rights reserved.`,
          privacy: 'Privacy Policy',
          terms: 'Terms of Service',
          dpa: 'Data Processing Agreement',
          footer: `You received this email because you requested a password reset on ${appName}.`,
      },
  });
  ```
  Aggiornare la firma della funzione: aggiungere `appName,` ai parametri destrutturati e cambiare `const t = translations[language];` in `const t = buildTranslations(appName)[language];`.
  Sostituire `h(Text, { style: styles.headerBrand }, 'Ceremly')` (riga ~239) con `h(Text, { style: styles.headerBrand }, appName)`.
  Sostituire il bold intro (righe ~245-249):
  ```ts
  t.intro.split('Ceremly')[0],
                          h('strong', null, 'Ceremly'),
                          t.intro.split('Ceremly')[1]
  ```
  con:
  ```ts
  ...t.intro.split(appName).flatMap((part, i) =>
                              i === 0 ? [part] : [h('strong', { key: i }, appName), part]
                          )
  ```
  Se il footer render usa `t.address`, sostituirlo come in VerificationEmail (renderizzare solo `t.footer`); altrimenti nessuna modifica al footer.

- [ ] **WaitingListEmail.ts** — sostituire l'interfaccia props (cercare `interface WaitingListEmailProps {`), aggiungere `appName: string;`. Sostituire il blocco `const translations = { it: {...}, en: {...} };` (righe 23-65) con:
  ```ts
  const buildTranslations = (appName: string) => ({
      it: {
          preview: `Benvenuto nella Waiting List di ${appName}!`,
          title: `Benvenuto nella Waiting List di ${appName}!`,
          greeting: 'Gentile utente,',
          intro: `Grazie per il tuo interesse in ${appName}, il boilerplate SaaS multi-tenant.`,
          successTitle: 'La tua email è stata registrata con successo!',
          successText: `Riceverai una notifica non appena la piattaforma sarà disponibile. Sarai tra i primi ad accedere a tutte le funzionalità di ${appName}.`,
          ctaIntro: 'Nel frattempo, puoi scoprire di più sul nostro progetto visitando il nostro sito:',
          ctaButton: 'Visita il Sito',
          contactText: 'Se hai domande o suggerimenti, non esitare a contattarci rispondendo a questa email.',
          signature: 'Cordiali saluti,',
          team: `Il Team di ${appName}`,
          copyright: `© ${new Date().getFullYear()} ${appName}. Tutti i diritti riservati.`,
          privacy: 'Privacy Policy',
          terms: 'Termini di Servizio',
          dpa: 'Data Processing Agreement',
          social: 'Seguici sui social:',
          footer: `Hai ricevuto questa email perché ti sei iscritto alla waiting list di ${appName}.`,
      },
      en: {
          preview: `Welcome to ${appName}'s Waiting List!`,
          title: `Welcome to ${appName}'s Waiting List!`,
          greeting: 'Dear User,',
          intro: `Thank you for your interest in ${appName}, the multi-tenant SaaS boilerplate.`,
          successTitle: 'Your email has been successfully registered!',
          successText: `You will receive a notification as soon as the platform is available. You'll be among the first to access all of ${appName}'s features.`,
          ctaIntro: 'In the meantime, you can learn more about our project by visiting our website:',
          ctaButton: 'Visit Website',
          contactText: "If you have any questions or suggestions, please don't hesitate to contact us by replying to this email.",
          signature: 'Best regards,',
          team: `The ${appName} Team`,
          copyright: `© ${new Date().getFullYear()} ${appName}. All rights reserved.`,
          privacy: 'Privacy Policy',
          terms: 'Terms of Service',
          dpa: 'Data Processing Agreement',
          social: 'Follow us on social media:',
          footer: `You received this email because you signed up for ${appName}'s waiting list.`,
      },
  });
  ```
  Aggiornare la firma della funzione: aggiungere `appName,` ai parametri (l'interfaccia attuale ha solo `language`), e cambiare `const t = translations[language];` in `const t = buildTranslations(appName)[language];`.
  Sostituire `h(Text, { style: styles.headerBrand }, 'Ceremly')` (riga ~198) con `h(Text, { style: styles.headerBrand }, appName)`.
  Sostituire il bold intro (righe ~204-207):
  ```ts
  t.intro.split('Ceremly')[0],
                          h('strong', null, 'Ceremly'),
                          t.intro.split('Ceremly')[1]
  ```
  con:
  ```ts
  ...t.intro.split(appName).flatMap((part, i) =>
                              i === 0 ? [part] : [h('strong', { key: i }, appName), part]
                          )
  ```
  Se il footer render usa `t.address`, sostituirlo come in VerificationEmail.

- [ ] **ContactConfirmationEmail.ts** — sostituire il commento header (riga 2) `// Sent to the user after submitting the contact form (Ceremly)` con `// Sent to the user after submitting the contact form`. Aggiungere `appName: string;` all'interfaccia props (cercare `interface ContactConfirmationEmailProps {`). Convertire `const translations = { it: {...}, en: {...} };` in factory `buildTranslations(appName)`: interpolare `${appName}` in `preview`, `ctaButton` (`Visita ${appName}` / `Visit ${appName}`), `ctaText` (sostituire "Ceremly" e "per la gestione dei tuoi eventi"/"for managing your events" con copy generico, es. IT: `Nel frattempo, scopri tutte le funzionalità che ${appName} ha da offrirti.`, EN: `In the meantime, discover all the features that ${appName} has to offer.`), `team`, `copyright` (con `new Date().getFullYear()`), `footer`; rimuovere `address`. Aggiornare la firma funzione con `appName,` e `const t = buildTranslations(appName)[language];`. Sostituire `h(Text, { style: styles.headerBrand }, 'Ceremly')` (riga ~214) con `h(Text, { style: styles.headerBrand }, appName)`. Se il footer renderizza `t.address`, renderizzare solo `t.footer`.

- [ ] **ContactNotificationEmail.ts** — sostituire il commento header (riga 2) `// Sent to admin when someone submits the contact form (Ceremly)` con `// Sent to admin when someone submits the contact form`. Aggiungere `appName: string;` all'interfaccia props. Aggiornare la firma funzione con `appName,`. Sostituire `h(Text, { style: styles.headerBrand }, 'Ceremly'),` (riga ~175) con `h(Text, { style: styles.headerBrand }, appName),`. Sostituire (riga ~214) `h(Text, null, 'Questa email è stata generata automaticamente dal modulo contatti di Ceremly.'),` con `h(Text, null, \`Questa email è stata generata automaticamente dal modulo contatti di ${appName}.\`),`.

- [ ] **index.ts** — threadare `appName` da runtimeConfig e rimuovere EventInvite. Sostituire l'intero file con:
  ```ts
  // Email Templates - React Email based templates
  // Export all email templates and render utility

  import { render } from '@react-email/render';
  import * as React from 'react';
  import { VerificationEmail } from './VerificationEmail';
  import { ResetPasswordEmail } from './ResetPasswordEmail';
  import { WaitingListEmail } from './WaitingListEmail';
  import { ContactConfirmationEmail } from './ContactConfirmationEmail';
  import { ContactNotificationEmail } from './ContactNotificationEmail';
  import { runtimeConfig } from '../utils/runtimeConfig';

  export type SupportedLanguage = 'it' | 'en';

  // Brand name from env (env-driven, fallback empty string)
  const appName = (): string => runtimeConfig.public.appName || '';

  // Re-export components
  export { VerificationEmail } from './VerificationEmail';
  export { ResetPasswordEmail } from './ResetPasswordEmail';
  export { WaitingListEmail } from './WaitingListEmail';
  export { ContactConfirmationEmail } from './ContactConfirmationEmail';
  export { ContactNotificationEmail } from './ContactNotificationEmail';

  /**
   * Render verification email to HTML
   */
  export async function renderVerificationEmail(options: {
      language?: SupportedLanguage;
      verificationUrl: string;
      userName?: string;
  }): Promise<string> {
      const element = React.createElement(VerificationEmail, {
          language: options.language || 'it',
          verificationUrl: options.verificationUrl,
          userName: options.userName,
          appName: appName(),
      });
      return await render(element);
  }

  /**
   * Render reset password email to HTML
   */
  export async function renderResetPasswordEmail(options: {
      language?: SupportedLanguage;
      resetUrl: string;
      userName?: string;
  }): Promise<string> {
      const element = React.createElement(ResetPasswordEmail, {
          language: options.language || 'it',
          resetUrl: options.resetUrl,
          userName: options.userName,
          appName: appName(),
      });
      return await render(element);
  }

  /**
   * Render waiting list email to HTML
   */
  export async function renderWaitingListEmail(options: {
      language?: SupportedLanguage;
  }): Promise<string> {
      const element = React.createElement(WaitingListEmail, {
          language: options.language || 'it',
          appName: appName(),
      });
      return await render(element);
  }

  /**
   * Render contact confirmation email to HTML (sent to user)
   */
  export async function renderContactConfirmationEmail(options: {
      language?: SupportedLanguage;
      userName: string;
      subject: string;
      siteUrl?: string;
  }): Promise<string> {
      const element = React.createElement(ContactConfirmationEmail, {
          language: options.language || 'it',
          userName: options.userName,
          subject: options.subject,
          siteUrl: options.siteUrl,
          appName: appName(),
      });
      return await render(element);
  }

  /**
   * Render contact notification email to HTML (sent to admin)
   */
  export async function renderContactNotificationEmail(options: {
      senderName: string;
      senderEmail: string;
      subject: string;
      message: string;
      language: string;
      submittedAt: string;
  }): Promise<string> {
      const element = React.createElement(ContactNotificationEmail, {
          senderName: options.senderName,
          senderEmail: options.senderEmail,
          subject: options.subject,
          message: options.message,
          language: options.language,
          submittedAt: options.submittedAt,
          appName: appName(),
      });
      return await render(element);
  }

  // Email subject lines by language (brand injected via appName)
  export const emailSubjects = {
      verification: {
          it: `Verifica il tuo indirizzo email - ${appName()}`,
          en: `Verify your email address - ${appName()}`,
      },
      resetPassword: {
          it: `Reimposta la tua password - ${appName()}`,
          en: `Reset your password - ${appName()}`,
      },
      waitingList: {
          it: `Benvenuto nella Waiting List di ${appName()}!`,
          en: `Welcome to ${appName()}'s Waiting List!`,
      },
      contactConfirmation: {
          it: `Abbiamo ricevuto il tuo messaggio - ${appName()}`,
          en: `We received your message - ${appName()}`,
      },
      contactNotification: (subject: string) => `[Contatto] ${subject}`,
  };
  ```
  (Nota: `emailSubjects` resta un oggetto con valori già risolti — `appName()` è chiamato al momento dell'import del modulo, coerente con come `runtimeConfig` è già un singleton risolto. Non cambia la firma per i consumer di `emailSubjects.X[language]`, quindi `server/utils/email.ts` NON va modificato per la verification/reset/waiting_list. `EventInviteEmail` e `eventInvite` sono rimossi.)

- [ ] Verificare che `server/utils/email.ts` non importi più `EventInviteEmail`/`eventInvite` e che le chiamate `emailSubjects.X[language]` restino valide (sono ancora oggetti `{it,en}`):
  ```bash
  grep -nE "EventInvite|eventInvite|emailSubjects" /Users/airowlgasga/coding/project/boilerplate-saas/server/utils/email.ts
  ```
  Atteso: solo riferimenti a `emailSubjects.verification[...]`, `emailSubjects.resetPassword[...]`, `emailSubjects.waitingList[...]` (oggetti `{it,en}`). Nessun `EventInvite`. Se compare un import/uso di `renderEventInviteEmail` o `eventInvite`, rimuoverlo (residuo che 1b dovrebbe aver già tolto).

- [ ] Verificare `server/services/contact.service.ts` (consumer di contact email). Controllare le chiamate:
  ```bash
  grep -nE "emailSubjects|renderContact" /Users/airowlgasga/coding/project/boilerplate-saas/server/services/contact.service.ts
  ```
  - `emailSubjects.contactConfirmation[language]` resta valido (oggetto `{it,en}`).
  - `emailSubjects.contactNotification(subject)` resta valido (funzione).
  - Se la firma è invariata, nessuna modifica. Annotare l'esito.

- [ ] Verificare assenza brand nei template:
  ```bash
  grep -rci ceremly /Users/airowlgasga/coding/project/boilerplate-saas/server/emailTemplates/*.ts
  ```
  Output atteso: `0` per ogni file.

- [ ] Verificare typecheck:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && pnpm typecheck 2>&1 | grep -iE "emailTemplates|email.ts|contact.service" | head -20
  ```
  Output atteso: nessun errore nei file email. (Errori `sharp-wasm32` pre-esistenti ignorabili.)

- [ ] Commit:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add server/emailTemplates server/utils/email.ts && git commit -m "refactor: env-driven app name in email templates; drop EventInvite residue"
  ```

---

## Task 11 — Rebrand-sweep `requirements.md` residui (email + pages)

**Files:**
- Modify: `server/emailTemplates/requirements.md:22,124`, `app/pages/requirements.md`.
- Verify: `grep -rci ceremly server/emailTemplates/requirements.md app/pages/requirements.md` → 0.

Nota: questi `requirements.md` sono doc di feature **sopravvissute** (email templates, landing page). Non sono event-scoped (quelli li ha rimossi 1c/1d). FASE 5 fa solo sweep brand/eventi.

**Steps:**

- [ ] In `server/emailTemplates/requirements.md`, sostituire (riga 22) `- Text-based header with Ceremly brand ✅` con `- Text-based header with env-driven app name ✅`.

- [ ] In `server/emailTemplates/requirements.md`, sostituire (riga 124) `- Header: Gradient `#19baf0` → `#0ea5d6` with text-based "Ceremly" brand logo` con `- Header: Gradient `#19baf0` → `#0ea5d6` with text-based app-name brand logo (env-driven)`.

- [ ] In `app/pages/requirements.md`, leggere il file e sostituire ogni occorrenza di "Ceremly" e di copy event-specific (RSVP, matrimoni, eventi privati) con descrizioni generiche della landing del boilerplate. Comando per individuare le righe:
  ```bash
  grep -inE 'ceremly|rsvp|matrimoni|evento|guest' /Users/airowlgasga/coding/project/boilerplate-saas/app/pages/requirements.md
  ```
  Per ogni riga trovata, riscrivere la frase in chiave SaaS generico (es. "landing page del prodotto SaaS con sezioni hero/features/pricing/faq e form waiting list"). Mantenere la struttura del documento; cambiare solo il contenuto brand/event.

- [ ] Verificare:
  ```bash
  grep -rciE 'ceremly|rsvp|matrimoni' /Users/airowlgasga/coding/project/boilerplate-saas/server/emailTemplates/requirements.md /Users/airowlgasga/coding/project/boilerplate-saas/app/pages/requirements.md
  ```
  Output atteso: `0` per entrambi (la parola "evento" nel senso di "event-driven serverless" è legittima se compare; valutare case-by-case, ma il copy della landing non deve parlare di eventi-prodotto).

- [ ] Commit:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add server/emailTemplates/requirements.md app/pages/requirements.md && git commit -m "docs: rebrand surviving requirements.md (email + landing)"
  ```

---

## Task 12 — Blog → placeholder + pulizia `public/og/` + `knownOgSlugs`

**Files:**
- Delete: i 6 file `content/blogs/*.md` evento (`gestione-rsvp-matrimonio.md`, `wedding-rsvp-management.md`, `errori-comuni-organizzazione-eventi.md`, `common-event-planning-mistakes.md`, `whatsapp-vs-email-inviti.md`, `whatsapp-vs-email-invitations.md`).
- Create: `content/blogs/getting-started.md` (en) + `content/blogs/come-iniziare.md` (it).
- Delete: `public/og/*` immagini evento dei blog rimossi.
- Verify: `grep -rci ceremly content/blogs/` → 0.

Il frontmatter deve rispettare lo schema in `content.config.ts` (`title`, `description`, `date`, `tags[]`, `author`, `locale`, opzionali `cover`, `featured`, `published`, `translationSlug`). I due post sono collegati via `translationSlug`. Author neutro generico.

**Steps:**

- [ ] Rimuovere i 6 post evento:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && rm content/blogs/gestione-rsvp-matrimonio.md content/blogs/wedding-rsvp-management.md content/blogs/errori-comuni-organizzazione-eventi.md content/blogs/common-event-planning-mistakes.md content/blogs/whatsapp-vs-email-inviti.md content/blogs/whatsapp-vs-email-invitations.md
  ```

- [ ] Creare `content/blogs/getting-started.md` (EN, featured):
  ```markdown
  ---
  title: "Getting Started with the SaaS Boilerplate"
  description: "A quick tour of what comes pre-wired in this multi-tenant SaaS boilerplate and how to ship your product faster."
  date: "2026-01-15"
  tags:
    - boilerplate
    - getting-started
  author: "The Team"
  featured: true
  published: true
  locale: "en"
  translationSlug: "getting-started"
  ---

  ## Welcome

  This SaaS boilerplate gives you a multi-tenant foundation out of the box: organizations, teams, role-based access, subscriptions and authentication. You focus on your product; the infrastructure is already wired.

  ## What's included

  - **Organizations & teams** — B2B-first tenancy with members, roles and invitations.
  - **Billing** — recurring subscriptions, plans and per-plan limits.
  - **Auth** — email/password, Google OAuth and two-factor authentication.
  - **Serverless by design** — Vercel deploy, Neon serverless database, HTTP work queues and managed cron.

  ## Next steps

  Clone the repository, set `NUXT_PUBLIC_APP_NAME` and the rest of your environment variables, run the migrations and start the dev server. From there, replicate the example `projects` entity to model your own org-scoped resources.

  Happy shipping.
  ```

- [ ] Creare `content/blogs/come-iniziare.md` (IT):
  ```markdown
  ---
  title: "Come iniziare con il boilerplate SaaS"
  description: "Un tour rapido di ciò che è già pronto in questo boilerplate SaaS multi-tenant e come lanciare il tuo prodotto più velocemente."
  date: "2026-01-15"
  tags:
    - boilerplate
    - guida
  author: "Il Team"
  featured: false
  published: true
  locale: "it"
  translationSlug: "getting-started"
  ---

  ## Benvenuto

  Questo boilerplate SaaS ti dà una base multi-tenant pronta all'uso: organizzazioni, team, controllo degli accessi per ruolo, abbonamenti e autenticazione. Tu ti concentri sul prodotto; l'infrastruttura è già cablata.

  ## Cosa include

  - **Organizzazioni & team** — multi-tenancy B2B-first con membri, ruoli e inviti.
  - **Billing** — abbonamenti ricorrenti, piani e limiti per piano.
  - **Auth** — email/password, Google OAuth e autenticazione a due fattori.
  - **Serverless by design** — deploy su Vercel, database Neon serverless, code di lavoro HTTP e cron gestiti.

  ## Prossimi passi

  Clona il repository, imposta `NUXT_PUBLIC_APP_NAME` e le altre variabili d'ambiente, esegui le migrazioni e avvia il server di sviluppo. Da lì, replica l'entità d'esempio `projects` per modellare le tue risorse org-scoped.

  Buon lancio.
  ```

- [ ] Rimuovere le OG immagini dei blog evento (i nuovi post non hanno OG dedicate; `knownOgSlugs` è già vuoto da Task 7):
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && rm -f public/og/gestione-rsvp-matrimonio.png public/og/wedding-rsvp-management.png public/og/errori-comuni-organizzazione-eventi.png public/og/common-event-planning-mistakes.png public/og/whatsapp-vs-email-inviti.png public/og/whatsapp-vs-email-invitations.png
  ```
  (Le OG generiche `blog-it.png` / `blog-en.png` per la lista blog restano.)

- [ ] Verificare assenza brand/eventi nei blog:
  ```bash
  grep -rciE 'ceremly|rsvp|matrimoni|wedding' /Users/airowlgasga/coding/project/boilerplate-saas/content/blogs/
  ```
  Output atteso: `0` (due file, nessun match).

- [ ] Verificare che i blog rimasti siano solo i due placeholder:
  ```bash
  ls /Users/airowlgasga/coding/project/boilerplate-saas/content/blogs/
  ```
  Output atteso: `come-iniziare.md  getting-started.md`.

- [ ] Commit:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add content/blogs public/og && git commit -m "content: replace event blog posts with generic SaaS placeholders"
  ```

---

## Task 13 — Move `base/` → `docs/guide/`

**Files:**
- Move: `base/` → `docs/guide/` (11 file).
- Verify: `test -d docs/guide && test ! -d base`.

`base/` è la fonte canonica del rewrite di CLAUDE.md/README.md (Task 2-3, già citata in `docs/guide/STACK-AND-CONVENTIONS.md`). Viene mantenuta come riferimento per cloni futuri ed esclusa dal gate (è dentro `docs/`).

**Steps:**

- [ ] Spostare la cartella con git (preserva la storia):
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git mv base docs/guide
  ```

- [ ] Verificare la struttura:
  ```bash
  test -d /Users/airowlgasga/coding/project/boilerplate-saas/docs/guide && test ! -d /Users/airowlgasga/coding/project/boilerplate-saas/base && echo "OK: base → docs/guide"
  ls /Users/airowlgasga/coding/project/boilerplate-saas/docs/guide/
  ```
  Output atteso: `OK: base → docs/guide` + lista degli 11 file (`00-START-HERE.md`, `STACK-AND-CONVENTIONS.md`, `PHASE-0..7`, più i 6 blog markdown di esempio che erano in `base/`).

- [ ] Nota: in `base/` esistevano anche copie markdown a tema evento (`gestione-rsvp-matrimonio.md` ecc.). Queste sono dentro `docs/guide/` e quindi **escluse dal brand gate** (path `docs/` escluso di proposito). Lasciarle: fanno parte della guida originale. Confermare che non siano referenziate da `content.config.ts` (lo è solo `content/blogs/*`).

- [ ] Commit:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add -A && git commit -m "docs: move base/ build guide to docs/guide/"
  ```

---

## Task 14 — Sweep `.env.example` (`NUXT_PUBLIC_PLAUSIBLE_DOMAIN` + coerenza)

**Files:**
- Modify: `.env.example` (Application Settings).
- Verify: `grep -c NUXT_PUBLIC_PLAUSIBLE_DOMAIN .env.example` → 1.

Le var infra (Neon `DATABASE_URL`, Upstash QStash/Redis, preset Vercel) sono di competenza FASE 2/3; FASE 5 aggiunge solo le var di branding analytics introdotte qui (Plausible) e fa coerenza. Non rimuovere/aggiungere var infra in questo task.

**Steps:**

- [ ] Aggiungere le var Plausible/Twitter nel blocco "Application Settings". Dopo la riga `NUXT_PUBLIC_APP_NAME=YourSaaSName` (riga 20), inserire:
  ```env
  NUXT_PUBLIC_TWITTER_HANDLE=                       # Optional: e.g. @yourhandle (twitter:site meta)
  NUXT_PUBLIC_PLAUSIBLE_DOMAIN=                     # Optional: analytics domain; if empty the script is not loaded
  NUXT_PUBLIC_PLAUSIBLE_WEBSITE_ID=                # Optional: DataFast/Plausible website id
  ```

- [ ] Verificare:
  ```bash
  grep -c NUXT_PUBLIC_PLAUSIBLE_DOMAIN /Users/airowlgasga/coding/project/boilerplate-saas/.env.example
  grep -ci ceremly /Users/airowlgasga/coding/project/boilerplate-saas/.env.example
  ```
  Output atteso: `1` e `0`.

- [ ] Se Task 1 ha rilevato `NUXT_CF_HYPERDRIVE_ID` / `NUXT_NITRO_PRESET=...cloudflare-module` ancora presenti (cioè 2/3 non hanno ripulito), **non** rimuoverli qui (sono di 2/3): annotare nel commit message che la coerenza infra resta a carico di 2/3.

- [ ] Commit:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add .env.example && git commit -m "chore: add env-driven analytics/twitter vars to .env.example"
  ```

---

## Task 15 — GATE FINALE (brand gate + vocabolario gate + typecheck + build) + commit finale

**Files:**
- Verify: brand gate, vocabolario gate, typecheck, build.

I due gate sono i "test" eseguibili di FASE 5. Vanno entrambi a 0 hit non-legittimo. Set di path esplicito che esclude `docs/` (storia migrazione + build guide) e `IMPLEMENTATION.md`.

**Steps:**

- [ ] **Brand gate** — nessun "ceremly" nei sorgenti (esclude `docs/` e `IMPLEMENTATION.md`):
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && grep -rIi ceremly app/ server/ shared/ i18n/ content/ public/ nuxt.config.ts README.md CLAUDE.md .env.example package.json 2>/dev/null
  ```
  Output atteso: **nessun output** (0 hit). Se compaiono hit, tornare al task del file colpito e correggere.

- [ ] **Vocabolario gate (staleness architetturale)** — nessun vocabolario evento-prodotto in docs/CLAUDE/README + sorgenti:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && grep -rInE 'rsvp|matrimoni|wedding|deep link whatsapp|reminder|guest' CLAUDE.md README.md app/ server/ shared/ i18n/ 2>/dev/null
  ```
  Output atteso: **nessun output** (0 hit). Nota su `guest`: se compare in codice auth/session legittimo (es. `redirectGuestTo`, `auth: { only: 'guest' }`, `shouldShowAuthLinks`) è **legittimo** — valutare case-by-case e non rimuovere. Se compare in copy/marketing/email è un residuo da correggere.

- [ ] **Vocabolario gate — termine `event` e `whatsapp` (case-by-case)** — questi termini hanno usi legittimi (`event.context`, `useState`, `addEventListener`, `event` di Nitro/h3, `shareOnWhatsApp` social share). Eseguire il check informativo e validare manualmente:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && grep -rInE 'whatsapp' app/ i18n/ 2>/dev/null
  ```
  Atteso: solo `app/pages/blogs/[slug].vue` (funzione/icona `shareOnWhatsApp` per la condivisione social, accanto a X/Facebook/LinkedIn) → **legittimo, non bloccare**. Nessun hit in `i18n/` (il copy landing non parla più di WhatsApp). Se in `i18n/` compare "whatsapp" come testo utente, è un residuo da correggere in Task 9.

- [ ] **JSON valido** (i18n):
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && node -e "JSON.parse(require('fs').readFileSync('i18n/locales/it-IT.json','utf8')); JSON.parse(require('fs').readFileSync('i18n/locales/en-US.json','utf8')); console.log('JSON OK')"
  ```
  Output atteso: `JSON OK`.

- [ ] **Typecheck**:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && pnpm typecheck 2>&1 | tail -30
  ```
  Output atteso: nessun nuovo errore introdotto da FASE 5 (i file toccati: nuxt.config.ts, app.vue, AppHeader/Footer, index.vue, blogs/*.vue, email templates, index.ts, runtimeConfig.ts). Errori `sharp-wasm32` pre-esistenti ignorabili.

- [ ] **Build** (sanity — il chunk grapesjs è stato rimosso):
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && pnpm build 2>&1 | tail -30
  ```
  Output atteso: build completata (eventuale errore `sharp-wasm32` durante Nitro build è pre-esistente e ignorabile per FASE 5). Nessun errore riconducibile a `grapesjs` mancante o a referenze brand.

- [ ] Verificare il checkpoint FASE 5 (tutti i punti soddisfatti):
  - CLAUDE.md / README.md / .env.example descrivono il boilerplate (org/Vercel/Neon/QStash), non Ceremly/eventi ✅
  - Branding env-driven; chunk grapesjs morto rimosso ✅
  - Brand gate → 0 hit; Vocabolario gate → 0 hit non-legittimo ✅
  - `base/` spostata in `docs/guide/`; storia migrazione tenuta ed esclusa dal gate ✅
  - Riferimento `docs/pattern/` di CLAUDE.md risolto (sostituito da `docs/guide/STACK-AND-CONVENTIONS.md`) ✅

- [ ] Commit finale (se restano modifiche non committate dai task precedenti):
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas && git add -A && git commit -m "docs: rewrite docs and branding for boilerplate" || echo "Niente da committare (già committato nei task)"
  ```

---

## Note finali per l'esecutore

- **Ordine vincolante:** Task 1 (pre-flight) prima di tutto; gate (Task 15) per ultimo. Se il pre-flight fallisce, FASE 5 non si esegue.
- **Push manuale:** non eseguire `git push` — lo fa l'utente.
- **`pnpm db:generate` interattivo:** non serve in FASE 5 (nessuna modifica schema).
- **Case-by-case sui gate:** `event` (h3/Nitro), `guest` (auth), `whatsapp` (social share `[slug].vue`), `landing` (landing page generica) hanno usi legittimi: non bloccare ciecamente, validare il contesto.
- **Env-driven, niente fallback brand:** in nessun file deve restare una stringa-brand hardcoded come fallback; il fallback è sempre `""` o `undefined`.
