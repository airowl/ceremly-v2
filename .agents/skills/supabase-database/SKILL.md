# Supabase Database Skill

## Overview

This skill provides patterns and conventions for working with YourSaaS's PostgreSQL database via Supabase. It covers the base schema architecture, multi-tenancy, RLS policies, soft delete, plan limits, and migration conventions.

## When to Use

- Creating or modifying database migrations
- Implementing RLS policies for new tables
- Adding soft delete to tables
- Working with plan limits and subscriptions
- Understanding multi-tenancy patterns
- Writing database functions and triggers

## Key Concepts

### Base Schema

All business tables live in the `base` schema (not `public`):

```sql
-- Always use base schema for business tables
CREATE TABLE base.table_name (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    deleted_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Multi-Tenancy Pattern

Workspace-based isolation using JWT claims:

```sql
-- Workspace isolation via JWT
workspace_id = (((SELECT auth.jwt()) -> 'app_metadata')::jsonb ->> 'workspace_id')::uuid
```

### RLS Policy Pattern

Two-layer RLS: RESTRICTIVE for workspace isolation + PERMISSIVE for permissions:

```sql
-- 1. RESTRICTIVE: Workspace isolation (always required)
CREATE POLICY "workspace isolation policy"
ON base.table_name AS RESTRICTIVE TO authenticated
USING (workspace_id = (((SELECT auth.jwt()) -> 'app_metadata')::jsonb ->> 'workspace_id')::uuid);

-- 2. PERMISSIVE: Permission-based access
CREATE POLICY "read policy"
ON base.table_name AS PERMISSIVE FOR SELECT TO authenticated
USING (base.user_has_permissions(ARRAY['table:read']));
```

### Soft Delete Pattern

All business tables use soft delete with `deleted_at` column:

```sql
-- Active view (excludes soft-deleted)
CREATE OR REPLACE VIEW base.active_table_name AS
SELECT * FROM base.table_name WHERE deleted_at IS NULL;

-- Soft delete rule (DELETE → UPDATE deleted_at)
CREATE OR REPLACE RULE soft_delete_table_name AS
    ON DELETE TO base.table_name
    DO INSTEAD UPDATE base.table_name SET deleted_at = NOW() WHERE id = OLD.id;
```

### Plan Limits

Check limits before creating resources:

```sql
-- Get effective limit (considers overrides)
SELECT base.get_effective_workspace_limit(workspace_id, 'max_events_per_workspace');
SELECT base.get_effective_user_limit(user_id, 'max_workspaces');
```

## Resources

- [Multi-Tenancy](resources/multi-tenancy.md) - Workspace isolation patterns
- [RLS Policies](resources/rls-policies.md) - Row Level Security patterns
- [Soft Delete](resources/soft-delete.md) - Soft delete implementation
- [Plan Limits](resources/plan-limits.md) - Plan limits system
- [Triggers](resources/triggers.md) - Database triggers and functions
- [Migrations](resources/migrations.md) - Migration file conventions

## MCP Integration

Use the Supabase MCP server for database operations:

```typescript
// List tables
mcp__supabase__list_tables({ schemas: ['base'] })

// Execute SQL queries
mcp__supabase__execute_sql({ query: 'SELECT * FROM base.active_events' })

// Apply migrations
mcp__supabase__apply_migration({ name: 'create_table_name', query: '...' })

// List migrations
mcp__supabase__list_migrations()

// Get logs for debugging
mcp__supabase__get_logs({ service: 'postgres' })
```

## Quick Reference

### Standard Table Template

```sql
CREATE TABLE base.new_table (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    -- business columns
    deleted_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_workspace FOREIGN KEY (workspace_id)
        REFERENCES base.workspaces(id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE base.new_table ENABLE ROW LEVEL SECURITY;

-- Workspace isolation (RESTRICTIVE)
CREATE POLICY "workspace isolation policy for new_table"
ON base.new_table AS RESTRICTIVE TO authenticated
USING (workspace_id = (((SELECT auth.jwt()) -> 'app_metadata')::jsonb ->> 'workspace_id')::uuid);

-- Permission policies (PERMISSIVE)
CREATE POLICY "new_table read policy"
ON base.new_table AS PERMISSIVE FOR SELECT TO authenticated
USING (base.user_has_permissions(ARRAY['new_table:read']));

CREATE POLICY "new_table write policy"
ON base.new_table AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (base.user_has_permissions(ARRAY['new_table:write']));

CREATE POLICY "new_table update policy"
ON base.new_table AS PERMISSIVE FOR UPDATE TO authenticated
USING (base.user_has_permissions(ARRAY['new_table:write']));

CREATE POLICY "new_table delete policy"
ON base.new_table AS PERMISSIVE FOR DELETE TO authenticated
USING (base.user_has_permissions(ARRAY['new_table:delete']));

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON base.new_table TO authenticated;
GRANT ALL ON base.new_table TO service_role;
```

### Permission Naming Convention

```
{table}:read    - SELECT permission
{table}:write   - INSERT/UPDATE permission
{table}:delete  - DELETE permission
{table}:manage  - Full admin access
```

### Common JWT Access Patterns

```sql
-- Get current user ID
auth.uid()

-- Get workspace ID from JWT
(((SELECT auth.jwt()) -> 'app_metadata')::jsonb ->> 'workspace_id')::uuid

-- Get user permissions from JWT
((SELECT auth.jwt()) -> 'app_metadata' -> 'user_permissions')::jsonb
```
