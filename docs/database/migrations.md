# Database Migrations & Seed Guide
<!-- Last updated: 2026-01-24 by Claude Code -->

## Overview

This project uses **Drizzle ORM** with **Neon** (serverless PostgreSQL) for database management.

### Current Setup
- **ORM**: Drizzle ORM v0.45+
- **Database**: Neon Serverless Postgres (PostgreSQL 17)
- **Migrations**: `supabase/migrations/`
- **Schema**: `server/database/schema/`

---

## Migration Workflow

### 1. Modify Schema

Edit files in `server/database/schema/*.ts`:

```typescript
// server/database/schema/event.ts
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const events = pgTable("events", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),  // ← Add new field
    createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

### 2. Export New Schema (if new file)

Add to `server/database/schema/index.ts`:

```typescript
export * from './newSchema'
```

### 3. Generate Migration

```bash
pnpm db:generate
```

Creates SQL file in `supabase/migrations/XXXX_migration_name.sql`

### 4. Review Migration

Check the generated SQL before applying:

```bash
cat supabase/migrations/$(ls -t supabase/migrations | head -1)
```

### 5. Apply Migration

```bash
# Development (Neon)
pnpm db:migrate

# Production
pnpm db:migrate:prod
```

### 6. Verify

```bash
# Open Drizzle Studio GUI
pnpm db:studio
```

---

## Quick Development (Skip Migrations)

For rapid prototyping, push schema directly without migration files:

```bash
pnpm db:push
```

⚠️ **Warning**: Only use in development. Creates no migration history.

---

## Seed Commands

### Populate Demo Data

```bash
pnpm db:seed
```

Creates:
- 6 users (admin, pro, basic, free, team members)
- 4 subscriptions (pro, basic, free plans)
- 5 events
- Event team members

### Reset Database

```bash
pnpm db:reset
```

⚠️ **Warning**: Deletes ALL data. Only works in dev environment.

### Full Reset + Seed

```bash
pnpm db:reset && pnpm db:seed
```

---

## Login Credentials (After Seed)

| Email | Password | Plan |
|-------|----------|------|
| admin@example.com | password123 | Pro (Admin) |
| pro@example.com | password123 | Pro |
| basic@example.com | password123 | Basic |
| free@example.com | password123 | Free |
| team1@example.com | password123 | - |
| team2@example.com | password123 | - |

---

## Commands Reference

| Command | Description |
|---------|-------------|
| `pnpm db:generate` | Generate migration from schema changes |
| `pnpm db:migrate` | Apply migrations (development) |
| `pnpm db:migrate:prod` | Apply migrations (production) |
| `pnpm db:push` | Push schema directly (no migration file) |
| `pnpm db:studio` | Open Drizzle Studio GUI |
| `pnpm db:seed` | Populate demo data |
| `pnpm db:reset` | Truncate all tables (dev only) |

---

## Neon-Specific Notes

### Connection String Format

```
postgresql://[user]:[password]@[endpoint].neon.tech/[database]?sslmode=require
```

### Branching (Advanced)

Neon supports database branching for isolated environments:

```bash
# Create branch via Neon MCP or Console
# Update .env with branch connection string
NUXT_DATABASE_URL=postgresql://...@ep-branch-name.neon.tech/neondb?sslmode=require
```

### Best Practices

1. **Always generate migrations** for production changes
2. **Review SQL** before applying to production
3. **Use branches** for testing schema changes
4. **Backup** before major migrations (Neon has point-in-time recovery)

---

## Schema Files Structure

```
server/database/schema/
├── index.ts          # Re-exports all schemas
├── auth.ts           # Better Auth tables (user, account, subscription)
├── event.ts          # Events, event_users, invitations
├── page.ts           # Pages, page_versions, page_assets
├── file.ts           # File uploads
├── notification.ts   # Notifications, preferences
├── auditLog.ts       # Audit logging
├── suggestion.ts     # Feature suggestions, votes
├── onboarding.ts     # User onboarding state
├── dataExport.ts     # GDPR data exports
├── contactMessage.ts # Contact form messages
└── waitingList.ts    # Waiting list entries
```

---

## Troubleshooting

### Migration Fails

```bash
# Check migration status
pnpm db:studio

# Manual SQL fix via Neon Console
# Or connect with psql and run migration manually
```

### Schema Drift

If schema differs from migrations:

```bash
# Option 1: Generate new migration to sync
pnpm db:generate

# Option 2: Push current schema (dev only)
pnpm db:push
```

### Connection Issues

```bash
# Test connection
psql "$NUXT_DATABASE_URL" -c "SELECT version();"

# Check Neon status
# https://neon.tech/status
```

### Seed Fails with Duplicate Key

Data already exists. Reset first:

```bash
pnpm db:reset && pnpm db:seed
```

---

## Legacy: Supabase CLI Commands

If using Supabase instead of Neon:

| Command | Description |
|---------|-------------|
| `supabase start` | Start local Supabase |
| `supabase db push` | Apply migrations to remote |
| `supabase migration list` | Check migration status |
| `supabase db dump` | Export database schema |
