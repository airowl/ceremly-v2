# RLS Policies

## Table of Contents
- [Overview](#overview)
- [Policy Types](#policy-types)
- [Permission Function](#permission-function)
- [Standard Patterns](#standard-patterns)
- [Policy Examples](#policy-examples)

---

## Overview

YourSaaS uses PostgreSQL Row Level Security (RLS) for data access control:

- **Two-Layer System**: RESTRICTIVE (workspace) + PERMISSIVE (permissions)
- **JWT-Based**: Permissions stored in `app_metadata.user_permissions`
- **Permission Function**: `base.user_has_permissions()` for checking

### How RLS Works

```
Query → RESTRICTIVE policies (all must pass) → PERMISSIVE policies (any must pass) → Result
```

---

## Policy Types

### RESTRICTIVE Policies

**Must ALL pass** for row access. Used for workspace isolation:

```sql
CREATE POLICY "workspace isolation"
ON base.table_name AS RESTRICTIVE TO authenticated
USING (workspace_id = (((SELECT auth.jwt()) -> 'app_metadata')::jsonb ->> 'workspace_id')::uuid);
```

### PERMISSIVE Policies

**At least ONE must pass** for row access. Used for permission-based access:

```sql
CREATE POLICY "read permission"
ON base.table_name AS PERMISSIVE FOR SELECT TO authenticated
USING (base.user_has_permissions(ARRAY['table:read']));
```

### Policy Combination Logic

```
Access = (ALL RESTRICTIVE pass) AND (ANY PERMISSIVE pass)
```

---

## Permission Function

### Core Function

```sql
CREATE OR REPLACE FUNCTION base.user_has_permissions(requested_permissions TEXT[])
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $
DECLARE
    workspace_id_from_jwt TEXT;
    user_permissions JSONB;
BEGIN
    -- Get workspace ID from JWT
    workspace_id_from_jwt := ((auth.jwt() -> 'app_metadata')::jsonb ->> 'workspace_id');

    -- If no workspace selected, allow (for workspace selection screen)
    IF workspace_id_from_jwt IS NULL THEN
        RETURN true;
    END IF;

    -- Get user permissions from JWT
    user_permissions := ((auth.jwt() -> 'app_metadata')::jsonb -> 'user_permissions');

    -- Check if user has any of the requested permissions
    RETURN EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(user_permissions) AS user_perm
        WHERE user_perm = ANY(requested_permissions)
    );
END;
$;
```

### Permission Naming Convention

```
{resource}:read    - SELECT access
{resource}:write   - INSERT/UPDATE access
{resource}:delete  - DELETE access
{resource}:manage  - Full admin access (implies all)
*                  - Superuser/owner (all permissions)
```

### Example Permissions

```json
{
  "user_permissions": [
    "events:read",
    "events:write",
    "guests:read",
    "guests:write",
    "templates:read"
  ]
}
```

---

## Standard Patterns

### Complete Table RLS Setup

```sql
-- 1. Enable RLS
ALTER TABLE base.new_table ENABLE ROW LEVEL SECURITY;

-- 2. RESTRICTIVE: Workspace isolation
CREATE POLICY "workspace isolation policy for new_table"
ON base.new_table AS RESTRICTIVE TO authenticated
USING (workspace_id = (((SELECT auth.jwt()) -> 'app_metadata')::jsonb ->> 'workspace_id')::uuid);

-- 3. PERMISSIVE: Read permission
CREATE POLICY "new_table read policy"
ON base.new_table AS PERMISSIVE FOR SELECT TO authenticated
USING (base.user_has_permissions(ARRAY['new_table:read']));

-- 4. PERMISSIVE: Write permission (INSERT)
CREATE POLICY "new_table insert policy"
ON base.new_table AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (base.user_has_permissions(ARRAY['new_table:write']));

-- 5. PERMISSIVE: Write permission (UPDATE)
CREATE POLICY "new_table update policy"
ON base.new_table AS PERMISSIVE FOR UPDATE TO authenticated
USING (base.user_has_permissions(ARRAY['new_table:write']));

-- 6. PERMISSIVE: Delete permission
CREATE POLICY "new_table delete policy"
ON base.new_table AS PERMISSIVE FOR DELETE TO authenticated
USING (base.user_has_permissions(ARRAY['new_table:delete']));
```

### User-Owned Resources (No Workspace)

For tables without workspace scope (e.g., user preferences):

```sql
-- User can only access their own data
CREATE POLICY "user owns data"
ON base.user_preferences AS RESTRICTIVE TO authenticated
USING (user_id = auth.uid());
```

### Public Read, Authenticated Write

```sql
-- Anyone can read
CREATE POLICY "public read"
ON base.public_content FOR SELECT TO anon, authenticated
USING (true);

-- Only authenticated with permission can write
CREATE POLICY "authenticated write"
ON base.public_content FOR INSERT TO authenticated
WITH CHECK (base.user_has_permissions(ARRAY['content:write']));
```

---

## Policy Examples

### Events Table

```sql
-- Enable RLS
ALTER TABLE base.events ENABLE ROW LEVEL SECURITY;

-- Workspace isolation
CREATE POLICY "workspace isolation policy for events"
ON base.events AS RESTRICTIVE TO authenticated
USING (workspace_id = (((SELECT auth.jwt()) -> 'app_metadata')::jsonb ->> 'workspace_id')::uuid);

-- Read events
CREATE POLICY "events read policy"
ON base.events AS PERMISSIVE FOR SELECT TO authenticated
USING (base.user_has_permissions(ARRAY['events:read']));

-- Create events
CREATE POLICY "events insert policy"
ON base.events AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (base.user_has_permissions(ARRAY['events:write']));

-- Update events
CREATE POLICY "events update policy"
ON base.events AS PERMISSIVE FOR UPDATE TO authenticated
USING (base.user_has_permissions(ARRAY['events:write']));

-- Delete events (soft delete via rule)
CREATE POLICY "events delete policy"
ON base.events AS PERMISSIVE FOR DELETE TO authenticated
USING (base.user_has_permissions(ARRAY['events:delete']));
```

### Guests Table (Child of Events)

```sql
-- Enable RLS
ALTER TABLE base.guests ENABLE ROW LEVEL SECURITY;

-- Workspace isolation via event relationship
CREATE POLICY "workspace isolation policy for guests"
ON base.guests AS RESTRICTIVE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM base.events e
        WHERE e.id = base.guests.event_id
        AND e.workspace_id = (((SELECT auth.jwt()) -> 'app_metadata')::jsonb ->> 'workspace_id')::uuid
    )
);

-- Permission policies
CREATE POLICY "guests read policy"
ON base.guests AS PERMISSIVE FOR SELECT TO authenticated
USING (base.user_has_permissions(ARRAY['guests:read']));
```

### Workspaces Table (Special Case)

```sql
-- Users can see workspaces they belong to
CREATE POLICY "workspace access policy"
ON base.workspaces AS PERMISSIVE FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM base.workspace_users wu
        WHERE wu.workspace_id = base.workspaces.id
        AND wu.user_id = auth.uid()
        AND wu.deleted_at IS NULL
    )
);
```

---

## Service Role Bypass

Service role key bypasses RLS. Use only in Edge Functions after authentication:

```typescript
// Edge Function - always authenticate first!
const { user } = await authenticateUser(req);

// Then use service role client for admin operations
const { data } = await supabaseAdmin
    .from('events')
    .select('*')
    .eq('workspace_id', workspaceId);
```

---

## Debugging RLS

### Check Policy Status

```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'base';
```

### Test Policy as User

```sql
-- Set role to test
SET ROLE authenticated;
SET request.jwt.claims = '{"sub": "user-id", "app_metadata": {"workspace_id": "ws-id"}}';

-- Try query
SELECT * FROM base.events;

-- Reset
RESET ROLE;
```

### Common Issues

1. **No rows returned**: Check workspace_id in JWT matches data
2. **Permission denied**: Check user_permissions array in JWT
3. **Policy not applying**: Ensure RLS is enabled on table
4. **Service role failing**: Check you're using correct key
