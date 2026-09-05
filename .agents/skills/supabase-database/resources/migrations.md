# Migrations

## Table of Contents
- [Overview](#overview)
- [File Conventions](#file-conventions)
- [Migration Structure](#migration-structure)
- [Common Patterns](#common-patterns)
- [Commands](#commands)

---

## Overview

YourSaaS uses Supabase migrations for database schema management:

- **Location**: `be/supabase/migrations/`
- **Format**: `{timestamp}_{description}.sql`
- **Schema**: All business tables in `base` schema
- **Order**: Migrations run in timestamp order

### Current Migrations

```
20251103140947_create_remote_schema_tables.sql
20251103142149_create_base_schema_tables.sql
20251103142226_create_multi_tenancy_workspace_tables.sql
20251103150118_create_multi_custom_claim_hook_tables.sql
20251103150706_create_rls_policies_tables.sql
20251103152134_create_waiting_list_tables.sql
20251103152749_create_subscriptions_tables.sql
20251103152750_create_plan_limits_tables.sql
20251103154132_create_stripe_tables.sql
20251103163801_create_events_tables.sql
20251103175737_create_guests_tables.sql
20251103181947_create_templates_tables.sql
20251123100000_create_email_system_tables.sql
20251129100000_create_soft_delete_system.sql
20251202120000_remove_exposed_stripe_key.sql
```

---

## File Conventions

### Naming

```
{YYYYMMDDHHMMSS}_{action}_{description}.sql
```

Examples:
- `20251103163801_create_events_tables.sql`
- `20251129100000_add_deleted_at_to_users.sql`
- `20251202120000_remove_exposed_stripe_key.sql`

### Actions

| Prefix | Usage |
|--------|-------|
| `create_` | New tables, schemas, types |
| `add_` | New columns, indexes, constraints |
| `remove_` | Drop columns, tables, constraints |
| `alter_` | Modify existing structures |
| `update_` | Data migrations, fixes |
| `fix_` | Bug fixes, corrections |

---

## Migration Structure

### Standard Table Migration

```sql
-- Migration: create_new_feature_tables
-- Description: Add new feature tables with RLS

-- ============================================
-- 1. Create Table
-- ============================================

CREATE TABLE base.new_feature (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    data JSONB DEFAULT '{}'::jsonb,
    deleted_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_workspace FOREIGN KEY (workspace_id)
        REFERENCES base.workspaces(id) ON DELETE CASCADE
);

-- ============================================
-- 2. Create Indexes
-- ============================================

CREATE INDEX idx_new_feature_workspace ON base.new_feature(workspace_id);
CREATE INDEX idx_new_feature_deleted ON base.new_feature(deleted_at) WHERE deleted_at IS NULL;

-- ============================================
-- 3. Enable RLS
-- ============================================

ALTER TABLE base.new_feature ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. RLS Policies
-- ============================================

-- Workspace isolation (RESTRICTIVE)
CREATE POLICY "workspace isolation policy for new_feature"
ON base.new_feature AS RESTRICTIVE TO authenticated
USING (workspace_id = (((SELECT auth.jwt()) -> 'app_metadata')::jsonb ->> 'workspace_id')::uuid);

-- Read permission
CREATE POLICY "new_feature read policy"
ON base.new_feature AS PERMISSIVE FOR SELECT TO authenticated
USING (base.user_has_permissions(ARRAY['new_feature:read']));

-- Write permission
CREATE POLICY "new_feature write policy"
ON base.new_feature AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (base.user_has_permissions(ARRAY['new_feature:write']));

-- Update permission
CREATE POLICY "new_feature update policy"
ON base.new_feature AS PERMISSIVE FOR UPDATE TO authenticated
USING (base.user_has_permissions(ARRAY['new_feature:write']));

-- Delete permission
CREATE POLICY "new_feature delete policy"
ON base.new_feature AS PERMISSIVE FOR DELETE TO authenticated
USING (base.user_has_permissions(ARRAY['new_feature:delete']));

-- ============================================
-- 5. Grants
-- ============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON base.new_feature TO authenticated;
GRANT ALL ON base.new_feature TO service_role;

-- ============================================
-- 6. Active View
-- ============================================

CREATE OR REPLACE VIEW base.active_new_feature AS
SELECT * FROM base.new_feature WHERE deleted_at IS NULL;

GRANT SELECT ON base.active_new_feature TO authenticated;
GRANT SELECT ON base.active_new_feature TO service_role;

-- ============================================
-- 7. Soft Delete Rule
-- ============================================

CREATE OR REPLACE RULE soft_delete_new_feature AS
    ON DELETE TO base.new_feature
    DO INSTEAD UPDATE base.new_feature
    SET deleted_at = NOW()
    WHERE id = OLD.id AND deleted_at IS NULL;
```

### Add Column Migration

```sql
-- Migration: add_status_to_events
-- Description: Add status column to events table

-- Add column
ALTER TABLE base.events
ADD COLUMN status VARCHAR(50) DEFAULT 'draft'
CHECK (status IN ('draft', 'published', 'cancelled', 'completed'));

-- Add index if needed
CREATE INDEX idx_events_status ON base.events(status);

-- Backfill existing data
UPDATE base.events SET status = 'published' WHERE status IS NULL;
```

### Remove Column Migration

```sql
-- Migration: remove_deprecated_field
-- Description: Remove deprecated field from table

-- Drop constraints first
ALTER TABLE base.table_name DROP CONSTRAINT IF EXISTS constraint_name;

-- Drop index if exists
DROP INDEX IF EXISTS idx_table_field;

-- Drop column
ALTER TABLE base.table_name DROP COLUMN deprecated_field;
```

---

## Common Patterns

### Foreign Key with Cascade

```sql
CONSTRAINT fk_workspace FOREIGN KEY (workspace_id)
    REFERENCES base.workspaces(id) ON DELETE CASCADE
```

### Check Constraint

```sql
CONSTRAINT valid_status CHECK (status IN ('active', 'inactive', 'pending'))
```

### Unique Constraint

```sql
CONSTRAINT unique_workspace_slug UNIQUE (workspace_id, slug)
```

### Partial Index

```sql
-- Index only active records
CREATE INDEX idx_active_events ON base.events(workspace_id)
WHERE deleted_at IS NULL;
```

### JSONB Index

```sql
-- GIN index for JSONB queries
CREATE INDEX idx_event_metadata ON base.events USING GIN (metadata);

-- Partial index on specific key
CREATE INDEX idx_event_type ON base.events ((metadata->>'type'));
```

---

## Commands

### Local Development

```bash
# Start Supabase locally
cd be/
supabase start

# Create new migration
supabase migration new create_new_feature_tables

# Apply migrations (reset DB)
supabase db reset

# Push to remote
supabase db push
```

### Via MCP

```typescript
// List current migrations
mcp__supabase__list_migrations()

// Apply new migration
mcp__supabase__apply_migration({
    name: 'create_new_feature_tables',
    query: `
        CREATE TABLE base.new_feature (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            ...
        );
    `
})

// Execute SQL (non-DDL)
mcp__supabase__execute_sql({
    query: 'SELECT * FROM base.events LIMIT 10'
})
```

### Rollback Pattern

Migrations don't auto-rollback. Create reverse migration:

```sql
-- Original: 20251201000000_add_feature.sql
ALTER TABLE base.events ADD COLUMN new_field TEXT;

-- Rollback: 20251201000001_remove_feature.sql
ALTER TABLE base.events DROP COLUMN new_field;
```

---

## Schema Reference

### Base Schema Setup

```sql
-- Create schema (from create_base_schema_tables.sql)
CREATE SCHEMA IF NOT EXISTS base;

-- Grant access
GRANT USAGE ON SCHEMA base TO postgres;
GRANT USAGE ON SCHEMA base TO authenticated;
GRANT USAGE ON SCHEMA base TO service_role;
GRANT USAGE ON SCHEMA base TO anon;

-- Default privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA base
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA base
GRANT ALL ON TABLES TO service_role;
```

### Standard Column Types

| Column | Type | Default |
|--------|------|---------|
| `id` | `UUID PRIMARY KEY` | `gen_random_uuid()` |
| `workspace_id` | `UUID NOT NULL` | - |
| `user_id` | `UUID` | - |
| `name` | `VARCHAR(255)` | - |
| `email` | `VARCHAR(255)` | - |
| `slug` | `VARCHAR(255)` | - |
| `status` | `VARCHAR(50)` | - |
| `data` | `JSONB` | `'{}'::jsonb` |
| `deleted_at` | `TIMESTAMP` | `NULL` |
| `created_at` | `TIMESTAMP` | `NOW()` |
| `updated_at` | `TIMESTAMP` | `NOW()` |

---

## Best Practices

### Do's

- Use descriptive migration names
- Include comments explaining purpose
- Add indexes for frequently queried columns
- Always set up RLS for new tables
- Test migrations locally first with `db reset`
- Create active views for soft-delete tables

### Don'ts

- Don't modify existing migrations after pushing
- Don't use `public` schema for business tables
- Don't forget RLS policies
- Don't hardcode IDs in migrations
- Don't create large data migrations in DDL files
