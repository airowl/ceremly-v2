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

# Background jobs / Cron (optional Bearer auth for /api/cron/*)
NUXT_CRON_SECRET=...
```

> Security secrets are documented per-file in [docs/security/](docs/security/) — see [`NUXT_ADMIN_API_KEY`](docs/security/NUXT_ADMIN_API_KEY.md) and [`NUXT_CRON_SECRET`](docs/security/NUXT_CRON_SECRET.md).

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
├── docs/base/              # Build guide (stack, conventions, phases)
├── docs/security/          # Per-secret reference (admin API key, cron secret)
└── drizzle/migrations/     # Generated migration files
```

## Subscription Plans

Configured in `shared/constants/pricing.ts`. Limits are enforced per organization; `-1` means unlimited.

## Deployment

Deploy to **Vercel** (Nitro `vercel` preset). The database is **Neon** (serverless Postgres via the HTTP driver), background jobs run on **Upstash QStash** + **Vercel Cron**, and cache/rate-limiting use **Upstash Redis** (HTTP). No persistent process is required.

## License

MIT
