# Ceremly

[![Nuxt UI](https://img.shields.io/badge/Made%20with-Nuxt%20UI-00DC82?logo=nuxt&labelColor=020420)](https://ui.nuxt.com)

Piattaforma automatica per gestire gli RSVP di eventi privati via Email e WhatsApp. Multi-tenant SaaS built with Nuxt 4, Vue 3, TypeScript, Better Auth, and Drizzle ORM.

## Tech Stack

- **Framework**: Nuxt 4 + Vue 3 + TypeScript
- **UI**: Nuxt UI v4 + Tailwind CSS
- **State Management**: Pinia
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Better Auth (Google OAuth + Email/Password + 2FA)
- **Payments**: Creem (`@creem_io/better-auth`)
- **Storage**: Cloudflare R2 (S3-compatible)
- **Email**: Resend with React Email templates
- **AI**: Mastra with OpenAI (`gpt-4o-mini`) for landing page generation
- **Security**: nuxt-security + CSP + Rate Limiting
- **Internationalization**: Nuxt i18n (Italian default, English)
- **SEO**: @nuxtjs/seo (sitemap, robots, schema.org)
- **Blog**: @nuxt/content (Markdown)

## Features

- **Event Management**: Create and manage private events with RSVP tracking
- **Guest Management**: Import guests via CSV, track RSVPs, bulk operations
- **Landing Page Editor**: Custom drag-and-drop editor with 9 section types and AI generation
- **Reminders**: Email and WhatsApp reminder templates with variable interpolation
- **Registration Pages**: Public event registration with custom forms
- **Team Collaboration**: Invite members with role-based access (owner/editor/viewer)
- **Subscription Plans**: Starter, Premium, Agency with plan limit enforcement
- **Waiting List**: Pre-launch mode with email collection
- **Contact Form**: Built-in contact form with spam protection
- **Audit Logging**: Track auth and system events
- **GDPR Data Export**: User data export functionality
- **Event Templates**: Reusable and AI-generated landing page templates

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 10+
- PostgreSQL database
- Redis (optional, for session caching)

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
# App
NUXT_NITRO_PRESET=node-server              # node-server | cloudflare-module
NUXT_PUBLIC_BASE_URL=http://localhost:3000
NUXT_PUBLIC_SITE_MODE=active                # active | waitinglist | maintenance

# Auth
NUXT_BETTER_AUTH_SECRET=your-secret-key
NUXT_GOOGLE_CLIENT_ID=...
NUXT_GOOGLE_CLIENT_SECRET=...

# Database
NUXT_DATABASE_URL=postgresql://...
NUXT_REDIS_URL=redis://localhost:6379       # Optional

# Payments (Creem)
NUXT_CREEM_API_KEY=...
NUXT_CREEM_WEBHOOK_SECRET=...
NUXT_CREEM_PRODUCT_ID_STARTER_MONTH=...
NUXT_CREEM_PRODUCT_ID_PREMIUM_MONTH=...
NUXT_CREEM_PRODUCT_ID_AGENCY_MONTH=...

# Storage (Cloudflare R2)
NUXT_CF_ACCOUNT_ID=...
NUXT_CF_R2_BUCKET_NAME=...

# Email
NUXT_RESEND_API_KEY=...

# AI (optional)
NUXT_OPENAI_API_KEY=...

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
│   ├── components/         # UI components (admin/, landing/, event/, reminder/)
│   ├── composables/        # Vue composables (useAuth, useGuests, useReminders, etc.)
│   ├── layouts/            # Auth, dashboard, public layouts
│   ├── middleware/          # Client middleware (auth, site-mode)
│   ├── pages/              # File-based routing
│   ├── stores/             # Pinia stores (user, event, profile, feedback)
│   └── assets/css/         # Global styles + design system
├── server/
│   ├── api/                # API routes (thin controllers)
│   ├── services/           # Business logic layer
│   ├── database/schema/    # Drizzle schema files
│   ├── emailTemplates/     # React Email templates (i18n)
│   ├── middleware/          # Server middleware (auth, rate-limit, bot-block)
│   └── utils/              # Server utilities (auth, db, permissions, audit)
├── shared/
│   ├── schemas/            # Zod validation schemas
│   ├── constants/          # Enums, pricing plans
│   └── utils/              # Shared utilities
├── i18n/locales/           # Translation files (it-IT, en-US)
├── content/blogs/          # Blog posts (Markdown)
├── docs/                   # Feature requirements + backend patterns
└── drizzle/migrations/     # Generated migration files
```

## Subscription Plans

Configured in `shared/constants/pricing.ts`:

| Plan | Events | Guests/Event | Emails/Month | Storage | Team Members |
|------|--------|--------------|--------------|---------|--------------|
| Starter | 2 | 50 | 200 | 500 MB | 1 |
| Premium | 5 | 350 | 2,000 | 2 GB | 5 |
| Agency | Unlimited | Unlimited | Unlimited | 10 GB | Unlimited |

## Deployment

The project supports two deployment targets:

- **Node.js**: `NUXT_NITRO_PRESET=node-server`
- **Cloudflare Workers**: `NUXT_NITRO_PRESET=cloudflare-module` (requires Hyperdrive for DB connection)

## License

MIT
