# Ceremly

[![Nuxt UI](https://img.shields.io/badge/Made%20with-Nuxt%20UI-00DC82?logo=nuxt&labelColor=020420)](https://ui.nuxt.com)

Smart digital invitations and RSVP management for the events that matter — personalized digital invitations, guest management and RSVP for weddings, graduations, christenings and birthdays. Multi-tenant (organizations with owner/admin/member roles); branding is fully env-driven via `NUXT_PUBLIC_APP_NAME`.

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

- **Events**: create and manage events per organization
- **Guests & RSVP**: guest list management with RSVP collection
- **Public invitations**: customizable public invitation pages per event
- **Invitation emails**: send event invitations via email
- **Scheduled reminders**: programmed reminder emails (QStash + Vercel Cron)
- **Checkout & billing**: Creem checkout, customer portal, webhooks
- **Organizations, members & roles**: B2B-first multi-tenancy (owner/admin/member); B2C as single-member organization
- **File storage**: R2 uploads with SHA-256 deduplication and magic-bytes validation
- **Background jobs**: HTTP queue (QStash) consumers + Vercel Cron, fully serverless
- **Transactional email**: Resend + React Email templates, env-driven app name
- **Waiting List**: pre-launch mode with email collection
- **Contact Form**: built-in contact form with spam protection
- **Audit Logging**: track auth and system events
- **GDPR Data Export**: user data export functionality
- **Blog**: Markdown blog via @nuxt/content with i18n translations

> Note: the `/api/projects` routes remain in the repository as legacy/example code. They are not a Ceremly product feature.

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 10+
- A Neon Postgres database
- An Upstash account (Redis + QStash)
- For full functionality: Cloudflare R2, Resend, and Creem accounts configured

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

See [.env.example](.env.example) for the full list (authoritative reference, no real values committed). Key variables:

```env
# Runtime
NUXT_NITRO_PRESET=vercel
NUXT_ENV=dev

# App (branding is env-driven) — public
NUXT_PUBLIC_BASE_URL=http://localhost:3000
NUXT_PUBLIC_APP_NAME=YourSaaSName
NUXT_PUBLIC_SITE_MODE=active                # active | waitinglist | maintenance
NUXT_PUBLIC_TWITTER_HANDLE=                 # optional, public

# Optional integrations / error tracking — public, optional
NUXT_PUBLIC_DATAFAST_WEBSITE_ID=            # optional, public
NUXT_PUBLIC_DATAFAST_DOMAIN=                # optional, public
NUXT_PUBLIC_SENTRY_DSN=                     # optional, public

# Email display addresses — public
NUXT_PUBLIC_APP_NOTIFY_EMAIL=noreply@example.com
NUXT_PUBLIC_APP_EVENTS_NOTIFY_EMAIL=...
NUXT_PUBLIC_APP_CONTACT_EMAIL=contact@example.com
NUXT_PUBLIC_PRIVACY_EMAIL=privacy@example.com
NUXT_PUBLIC_LEGAL_EMAIL=legal@example.com
NUXT_CONTACT_ADMIN_EMAIL=admin@example.com  # secret, required in production

# Auth — secret, required in production
NUXT_BETTER_AUTH_SECRET=your-secret-key
NUXT_GOOGLE_CLIENT_ID=...
NUXT_GOOGLE_CLIENT_SECRET=...

# Database (Neon) — secret, required in production
NUXT_DATABASE_URL=postgresql://...          # pooled (serverless runtime)
NUXT_DATABASE_URL_DIRECT=postgresql://...   # unpooled (migrations/DDL)

# Payments (Creem) — secret, required in production for billing
NUXT_CREEM_API_KEY=...
NUXT_CREEM_WEBHOOK_SECRET=...
NUXT_CREEM_PRODUCT_ID_CELEBRATION=...
NUXT_CREEM_PRODUCT_ID_ATELIER=...

# Storage (Cloudflare R2) — secret, required in production for uploads
NUXT_CF_ACCOUNT_ID=...
NUXT_CF_ACCESS_KEY_ID=...
NUXT_CF_SECRET_ACCESS_KEY=...
NUXT_CF_R2_BUCKET_NAME=...
NUXT_CF_R2_PUBLIC_URL=...

# Email (Resend) — secret, required in production
NUXT_RESEND_API_KEY=...
NUXT_RESEND_WEBHOOK_SECRET=...

# Admin — secret, required in production for /api/admin/*
NUXT_ADMIN_API_KEY=...

# Background jobs / Cron — secret
NUXT_QSTASH_TOKEN=                          # empty in local dev → in-process fallback
NUXT_QSTASH_CURRENT_SIGNING_KEY=...
NUXT_QSTASH_NEXT_SIGNING_KEY=...
NUXT_QSTASH_URL=                            # optional override
NUXT_CRON_SECRET=...                        # Bearer auth for /api/cron/* (optional)

# Cache (Upstash Redis) — secret, required in production on Vercel
NUXT_UPSTASH_REDIS_REST_URL=...
NUXT_UPSTASH_REDIS_REST_TOKEN=...
```

Classification: `NUXT_PUBLIC_*` variables are public (exposed to the client); all others are secret. Required in production: auth, database, admin key, Redis (on Vercel), plus Resend/R2/Creem/QStash/Cron secrets when the corresponding feature is used. Optional: DataFast, Sentry, Twitter handle, QStash URL override. Never commit real values.

> Security secrets are documented per-file in [docs/security/](docs/security/) — see [`NUXT_ADMIN_API_KEY`](docs/security/NUXT_ADMIN_API_KEY.md) and [`NUXT_CRON_SECRET`](docs/security/NUXT_CRON_SECRET.md).

## Development

```bash
pnpm dev                    # Development server (localhost:3000)
pnpm build                  # Production build
pnpm preview                # Preview production build

# Quality
pnpm lint                   # ESLint
pnpm test                   # Vitest (single run)
pnpm test:watch             # Vitest (watch mode)
pnpm typecheck              # Type checking (vue-tsc)

# Database (requires a configured database)
pnpm db:generate            # Generate migrations
pnpm db:migrate             # Run migrations (dev)
pnpm db:migrate:prod        # Run migrations (production ONLY)
pnpm db:push                # Push schema directly
pnpm db:studio              # Drizzle Studio GUI
pnpm db:seed                # Seed database
pnpm db:reset               # Reset database
pnpm auth:schema            # Regenerate Better Auth schema

# Verification (may require dedicated data/database; verify:account-purge can modify or delete data — never run on real data without prior verification)
pnpm verify:rbac
pnpm verify:isolation-api
pnpm verify:plan-limit
pnpm verify:rate-limit
pnpm verify:account-purge

# Docs & assets
pnpm openapi:generate       # Generate OpenAPI spec
pnpm og:generate            # Generate OG images
```

## Project Structure

```
├── app/
│   ├── components/         # UI components (incl. Ceremly event/guest/invitation components)
│   ├── composables/        # Vue composables
│   ├── layouts/            # Auth, dashboard, public layouts
│   ├── middleware/         # Client middleware (auth, site-mode)
│   ├── pages/              # File-based routing
│   ├── plugins/            # Client plugins
│   ├── stores/             # Pinia stores
│   ├── types/              # Client types
│   ├── utils/              # Client utilities
│   └── assets/css/         # Global styles + design system
├── server/
│   ├── api/                # API routes (thin controllers); jobs/ + cron/ for serverless work
│   ├── services/           # Business logic layer (events, guests, RSVP, invitations, reminders, billing)
│   ├── repositories/       # Drizzle queries per entity (org-scoped)
│   ├── database/schema/    # Drizzle schema files
│   ├── database/seed/      # Seed, reset and verify:* scripts
│   ├── emailTemplates/     # React Email templates (i18n, env-driven brand)
│   ├── middleware/         # Server middleware (auth, organization, rate-limit, bot-block)
│   ├── queue/              # QStash queue abstraction
│   ├── plugins/            # Server plugins
│   ├── types/              # Server types
│   └── utils/              # Server utilities (auth, db, permissions, audit)
├── shared/
│   ├── schemas/            # Zod validation schemas
│   ├── constants/          # Enums, pricing plans
│   ├── types/              # Shared types
│   └── utils/              # Shared utilities
├── scripts/                # OpenAPI + OG generation, smoke tests
├── i18n/locales/           # Translation files (it-IT, en-US)
├── content/blogs/          # Blog posts (Markdown)
├── docs/base/              # Build guide (stack, conventions, phases)
├── docs/security/          # Per-secret reference (admin API key, cron secret)
└── drizzle/migrations/     # Generated migration files
```

## Subscription Plans

Configured in `shared/constants/pricing.ts` (source of truth). `-1` means unlimited.

| Plan | Guests per event | Reminders per event | Active events per organization | Price |
|---|---:|---:|---|---|
| Free | 30 | 3 | 1 | Free |
| Celebration | 250 | 3 | N/A: per-event plan | €39 one-time |
| Atelier | Unlimited | Unlimited | Unlimited | €24/month |

Note:

- Free and Celebration are **per-event** tiers (`events.tier`).
- Atelier is an **organization/owner subscription** (recurring), resolved at runtime — it is not a value of `events.tier`.
- `maxActiveEvents` is an **organizational** limit (Free: 1, Atelier: unlimited). The Celebration `maxActiveEvents` value (`-1`) is an unused placeholder and must not be interpreted as a Celebration tier limit.

## Deployment

Deploy to **Vercel** (Nitro `vercel` preset). The database is **Neon** (serverless Postgres via the HTTP driver), background jobs run on **Upstash QStash** + **Vercel Cron**, and cache/rate-limiting use **Upstash Redis** (HTTP). No persistent process is required. QStash and Cron require a publicly reachable endpoint (`NUXT_PUBLIC_BASE_URL` with no trailing slash, signed into QStash job URLs).

## License

UNLICENSED (proprietary). See `package.json`.
