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
- Scheduled tasks are **Vercel Cron** declared in `nuxt.config.ts` (`vercel.config.crons`, Vercel Build Output API — **not** a root `vercel.json`), hitting a `server/api/cron/...` route. Cron does no heavy work: it enqueues or processes small batches.
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
- `docs/base/` — Build guide (stack, conventions, phase-by-phase reference for clones)
- `docs/saas-prd/` — Ceremly PRD + implementation spec (`SPEC-Ceremly-MVP.md`)
- `docs/security/` — Per-secret reference docs (`NUXT_ADMIN_API_KEY.md`, `NUXT_CRON_SECRET.md`)
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
- Plans: `free`, `celebration` (one-time per evento), `atelier` (recurring mensile, per planner)
- Single provider, no branching logic
- `persistSubscriptions: true` auto-manages the `creem_subscription` table
- Webhook auto-registered at `/api/auth/creem/webhook` by the Better Auth plugin
- Product IDs via env: `NUXT_CREEM_PRODUCT_ID_{CELEBRATION|ATELIER}`
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
- Domain tables: `projects` (canonical org-scoped example entity), `file`, `email_suppressions`, `email_events`, `contact_messages`, `audit_log`, `waiting_list`, `data_exports`, `user_custom_limits`

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
- Admin endpoints (`/api/admin/*`) require the `X-Admin-API-Key` header (`NUXT_ADMIN_API_KEY`), enforced in `1.auth.ts` + per-handler; constant-time SHA-256 compare in `server/utils/requireAdminApiKey.ts`. See `docs/security/NUXT_ADMIN_API_KEY.md`.
- Cron endpoints (`/api/cron/*`) use 3-way auth: `x-vercel-cron` header (platform), `Authorization: Bearer ${CRON_SECRET}` (`NUXT_CRON_SECRET`, optional), or `X-Admin-API-Key` for manual triggers. See `docs/security/NUXT_CRON_SECRET.md`.
- Audit logging on all auth events (IP, User-Agent, success/failure)
- Magic bytes file validation (binary header check, not just MIME)

### Design System
- Defined in `app/assets/css/main.css`
- Background: Smoke White `#FAF9F6`
- Font: Manrope
- Landing page uses pure Tailwind (no Nuxt UI components) + custom CSS animations
- Google Material Symbols Outlined for landing page icons

## Backend conventions (MUST READ)

Before writing or modifying backend code, read `docs/base/STACK-AND-CONVENTIONS.md`. Key rules:

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

- **Environment files**: `.env` (dev), `.env.prod` (prod) — see `.env.example`
- **API pattern**: `server/api/[resource]/[action].[method].ts`
- **i18n**: Use `const { t } = useI18n()` and `useLocalePath()` for routes
- **Blog translations**: Linked via `translationSlug` field in content frontmatter
- **Plan limits**: Check via `/api/limits/*` endpoints before resource-creating operations
- **File uploads**: Two paths — direct upload or presigned URL flow (presign → upload → confirm)
- **Email templates**: React Email in `server/emailTemplates/`, env-driven app name, i18n via `user.locale`

## Known Issues
- `sharp-wasm32` error during Nitro build is pre-existing
- `pnpm db:generate` is interactive when creating new tables (needs TTY)

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
