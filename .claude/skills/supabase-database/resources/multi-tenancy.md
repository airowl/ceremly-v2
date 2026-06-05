# Multi-Tenancy

## Table of Contents
- [Overview](#overview)
- [Core Tables](#core-tables)
- [JWT Claims Pattern](#jwt-claims-pattern)
- [Workspace Context](#workspace-context)
- [User-Workspace Relationship](#user-workspace-relationship)

---

## Overview

YourSaaS uses workspace-based multi-tenancy with complete data isolation:

- **Isolation Level**: Workspace (not user)
- **Mechanism**: JWT claims + RLS policies
- **Schema**: All business tables in `base` schema
- **Key Column**: `workspace_id` on all tenant-scoped tables

### Two-Phase Authentication Flow

```
Login → JWT (workspace_id = NULL)
   ↓
Workspace Selection → refreshSession() → JWT (workspace_id = UUID)
   ↓
All queries auto-filtered by RLS using workspace_id
```

---

## Core Tables

### Workspaces

```sql
CREATE TABLE base.workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    deleted_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Users

```sql
CREATE TABLE base.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255),
    avatar_url TEXT,
    deleted_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Workspace Users (Junction Table)

```sql
CREATE TABLE base.workspace_users (
    workspace_id UUID NOT NULL REFERENCES base.workspaces(id),
    user_id UUID NOT NULL REFERENCES base.users(id),
    role_id UUID NOT NULL REFERENCES base.workspace_roles(id),
    deleted_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (workspace_id, user_id)
);
```

### Workspace Roles

```sql
CREATE TABLE base.workspace_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES base.workspaces(id),
    name VARCHAR(100) NOT NULL,
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_default BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(workspace_id, name)
);
```

### Resource Usage Tracking

```sql
CREATE TABLE base.workspace_resource_usage (
    workspace_id UUID PRIMARY KEY REFERENCES base.workspaces(id),
    events_count INTEGER NOT NULL DEFAULT 0,
    guests_count INTEGER NOT NULL DEFAULT 0,
    templates_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## JWT Claims Pattern

### JWT Structure After Workspace Selection

```json
{
  "sub": "user-uuid",
  "app_metadata": {
    "workspace_id": "workspace-uuid",
    "user_permissions": ["events:read", "events:write", "guests:read"]
  }
}
```

### Accessing JWT in SQL

```sql
-- Get user ID
auth.uid()

-- Get workspace ID
(((SELECT auth.jwt()) -> 'app_metadata')::jsonb ->> 'workspace_id')::uuid

-- Get permissions array
((SELECT auth.jwt()) -> 'app_metadata' -> 'user_permissions')::jsonb

-- Check specific permission
EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(
        ((SELECT auth.jwt()) -> 'app_metadata' -> 'user_permissions')::jsonb
    ) AS perm
    WHERE perm = 'events:read'
)
```

### Workspace ID Null Handling

When `workspace_id` is NULL (before workspace selection), RLS policies allow access to user-specific data only:

```sql
CREATE OR REPLACE FUNCTION base.user_has_permissions(requested_permissions TEXT[])
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $
DECLARE
    workspace_id_from_jwt TEXT;
BEGIN
    workspace_id_from_jwt := ((auth.jwt() -> 'app_metadata')::jsonb ->> 'workspace_id');

    -- If no workspace selected, allow (for workspace selection screen)
    IF workspace_id_from_jwt IS NULL THEN
        RETURN true;
    END IF;

    -- Check permissions
    RETURN EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(
            ((auth.jwt() -> 'app_metadata')::jsonb -> 'user_permissions')
        ) AS user_perm
        WHERE user_perm = ANY(requested_permissions)
    );
END;
$;
```

---

## Workspace Context

### Setting Workspace Context (Edge Function)

```typescript
// After user selects workspace, update JWT claims
const { error } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: {
        workspace_id: workspaceId,
        user_permissions: userPermissions
    }
});

// Client must refresh session to get new JWT
await supabase.auth.refreshSession();
```

### Clearing Workspace Context

```typescript
// When switching workspaces or logging out
const { error } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: {
        workspace_id: null,
        user_permissions: []
    }
});
```

---

## User-Workspace Relationship

### User Sync Trigger

Automatically creates `base.users` record when `auth.users` is created:

```sql
CREATE OR REPLACE FUNCTION base.handle_new_auth_user()
RETURNS TRIGGER AS $
BEGIN
    INSERT INTO base.users (id, email, name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(
            NEW.raw_user_meta_data->>'full_name',
            NEW.raw_user_meta_data->>'name',
            split_part(NEW.email, '@', 1)
        )
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE base.handle_new_auth_user();
```

### Getting User's Workspaces

```sql
-- All workspaces for current user
SELECT w.*, wu.role_id, wr.name as role_name, wr.permissions
FROM base.workspaces w
JOIN base.workspace_users wu ON w.id = wu.workspace_id
JOIN base.workspace_roles wr ON wu.role_id = wr.id
WHERE wu.user_id = auth.uid()
AND w.deleted_at IS NULL
AND wu.deleted_at IS NULL;
```

### Creating New Workspace with Owner

```sql
-- 1. Create workspace
INSERT INTO base.workspaces (name, slug) VALUES ('My Workspace', 'my-workspace');

-- 2. Create owner role
INSERT INTO base.workspace_roles (workspace_id, name, permissions, is_default)
VALUES (workspace_id, 'owner', '["*"]'::jsonb, false);

-- 3. Add user as owner
INSERT INTO base.workspace_users (workspace_id, user_id, role_id)
VALUES (workspace_id, auth.uid(), owner_role_id);

-- 4. Initialize resource usage
INSERT INTO base.workspace_resource_usage (workspace_id)
VALUES (workspace_id);
```

---

## Best Practices

### Do's

- Always include `workspace_id` column on tenant-scoped tables
- Use RESTRICTIVE RLS policy for workspace isolation
- Update JWT claims after workspace selection
- Call `refreshSession()` on client after workspace switch
- Track resource usage in `workspace_resource_usage`

### Don'ts

- Don't query without workspace context (except workspace selection)
- Don't bypass RLS without service role key
- Don't hardcode workspace IDs in queries
- Don't forget to handle NULL workspace_id state
- Don't create tables in `public` schema
