# Triggers & Functions

## Table of Contents
- [Overview](#overview)
- [User Sync Triggers](#user-sync-triggers)
- [Resource Count Triggers](#resource-count-triggers)
- [Soft Delete Cascade Triggers](#soft-delete-cascade-triggers)
- [Custom Claim Hook](#custom-claim-hook)
- [Utility Functions](#utility-functions)

---

## Overview

YourSaaS uses PostgreSQL triggers for automated data management:

- **User Sync**: Auto-create `base.users` from `auth.users`
- **Resource Counting**: Update usage stats on insert/delete
- **Soft Delete Cascade**: Propagate deletions to children
- **JWT Claims**: Inject workspace permissions into JWT

### Trigger Best Practices

- Always use `SECURITY DEFINER` for elevated privileges
- Use `AFTER` triggers for non-blocking operations
- Use `BEFORE` triggers only when modifying the row
- Keep trigger functions focused and fast

---

## User Sync Triggers

### New User Creation

Automatically creates `base.users` record when user signs up:

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

### User Email Update

Sync email changes from `auth.users` to `base.users`:

```sql
CREATE OR REPLACE FUNCTION base.handle_auth_user_updated()
RETURNS TRIGGER AS $
BEGIN
    UPDATE base.users
    SET
        email = NEW.email,
        name = COALESCE(
            NEW.raw_user_meta_data->>'full_name',
            NEW.raw_user_meta_data->>'name',
            base.users.name
        ),
        updated_at = NOW()
    WHERE id = NEW.id;
    RETURN NEW;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_updated
    AFTER UPDATE ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE base.handle_auth_user_updated();
```

---

## Resource Count Triggers

### Events Count

```sql
-- Increment on insert
CREATE OR REPLACE FUNCTION base.increment_events_count()
RETURNS TRIGGER AS $
BEGIN
    INSERT INTO base.workspace_resource_usage (workspace_id, events_count)
    VALUES (NEW.workspace_id, 1)
    ON CONFLICT (workspace_id)
    DO UPDATE SET
        events_count = base.workspace_resource_usage.events_count + 1,
        updated_at = NOW();
    RETURN NEW;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_event_created
    AFTER INSERT ON base.events
    FOR EACH ROW EXECUTE FUNCTION base.increment_events_count();

-- Decrement on soft delete
CREATE OR REPLACE FUNCTION base.decrement_events_count()
RETURNS TRIGGER AS $
BEGIN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        UPDATE base.workspace_resource_usage
        SET
            events_count = GREATEST(0, events_count - 1),
            updated_at = NOW()
        WHERE workspace_id = NEW.workspace_id;
    END IF;
    RETURN NEW;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_event_soft_deleted
    AFTER UPDATE OF deleted_at ON base.events
    FOR EACH ROW EXECUTE FUNCTION base.decrement_events_count();
```

### Guests Count

```sql
-- Increment on insert
CREATE OR REPLACE FUNCTION base.increment_guests_count()
RETURNS TRIGGER AS $
DECLARE
    ws_id UUID;
BEGIN
    SELECT workspace_id INTO ws_id FROM base.events WHERE id = NEW.event_id;

    UPDATE base.workspace_resource_usage
    SET
        guests_count = guests_count + 1,
        updated_at = NOW()
    WHERE workspace_id = ws_id;
    RETURN NEW;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_guest_created
    AFTER INSERT ON base.guests
    FOR EACH ROW EXECUTE FUNCTION base.increment_guests_count();

-- Decrement on soft delete
CREATE OR REPLACE FUNCTION base.decrement_guests_count()
RETURNS TRIGGER AS $
DECLARE
    ws_id UUID;
BEGIN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        SELECT workspace_id INTO ws_id FROM base.events WHERE id = NEW.event_id;

        UPDATE base.workspace_resource_usage
        SET
            guests_count = GREATEST(0, guests_count - 1),
            updated_at = NOW()
        WHERE workspace_id = ws_id;
    END IF;
    RETURN NEW;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_guest_soft_deleted
    AFTER UPDATE OF deleted_at ON base.guests
    FOR EACH ROW EXECUTE FUNCTION base.decrement_guests_count();
```

---

## Soft Delete Cascade Triggers

### Event → Guests Cascade

```sql
CREATE OR REPLACE FUNCTION base.cascade_soft_delete_event()
RETURNS TRIGGER AS $
BEGIN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        UPDATE base.guests
        SET deleted_at = NEW.deleted_at
        WHERE event_id = NEW.id
        AND deleted_at IS NULL;
    END IF;
    RETURN NEW;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER cascade_event_soft_delete
    AFTER UPDATE OF deleted_at ON base.events
    FOR EACH ROW
    EXECUTE FUNCTION base.cascade_soft_delete_event();
```

### Workspace → All Children Cascade

```sql
CREATE OR REPLACE FUNCTION base.cascade_soft_delete_workspace()
RETURNS TRIGGER AS $
BEGIN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        -- Cascade to workspace_users
        UPDATE base.workspace_users
        SET deleted_at = NEW.deleted_at
        WHERE workspace_id = NEW.id AND deleted_at IS NULL;

        -- Cascade to workspace_roles
        UPDATE base.workspace_roles
        SET deleted_at = NEW.deleted_at
        WHERE workspace_id = NEW.id AND deleted_at IS NULL;

        -- Cascade to events (which cascades to guests)
        UPDATE base.events
        SET deleted_at = NEW.deleted_at
        WHERE workspace_id = NEW.id AND deleted_at IS NULL;

        -- Cascade to templates
        UPDATE base.templates
        SET deleted_at = NEW.deleted_at
        WHERE workspace_id = NEW.id AND deleted_at IS NULL;
    END IF;
    RETURN NEW;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER cascade_workspace_soft_delete
    AFTER UPDATE OF deleted_at ON base.workspaces
    FOR EACH ROW
    EXECUTE FUNCTION base.cascade_soft_delete_workspace();
```

---

## Custom Claim Hook

### JWT Claims Injection

Supabase hook to add workspace context to JWT:

```sql
CREATE OR REPLACE FUNCTION base.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $
DECLARE
    claims JSONB;
    user_id UUID;
    workspace_id UUID;
    user_permissions JSONB;
BEGIN
    user_id := (event->>'user_id')::UUID;
    claims := event->'claims';

    -- Get workspace_id from existing app_metadata
    workspace_id := (claims->'app_metadata'->>'workspace_id')::UUID;

    -- If workspace selected, get permissions
    IF workspace_id IS NOT NULL THEN
        SELECT wr.permissions INTO user_permissions
        FROM base.workspace_users wu
        JOIN base.workspace_roles wr ON wu.role_id = wr.id
        WHERE wu.user_id = user_id
        AND wu.workspace_id = workspace_id
        AND wu.deleted_at IS NULL;

        -- Update claims with permissions
        claims := jsonb_set(
            claims,
            '{app_metadata, user_permissions}',
            COALESCE(user_permissions, '[]'::JSONB)
        );
    END IF;

    RETURN jsonb_set(event, '{claims}', claims);
END;
$;

-- Grant execute to supabase_auth_admin
GRANT EXECUTE ON FUNCTION base.custom_access_token_hook TO supabase_auth_admin;
```

### Enable Hook

In Supabase Dashboard → Authentication → Hooks:

1. Enable "Customize Access Token" hook
2. Select function: `base.custom_access_token_hook`

---

## Utility Functions

### Update Timestamp Trigger

Generic function for `updated_at` column:

```sql
CREATE OR REPLACE FUNCTION base.update_updated_at()
RETURNS TRIGGER AS $
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$ LANGUAGE plpgsql;

-- Apply to tables
CREATE TRIGGER update_events_updated_at
    BEFORE UPDATE ON base.events
    FOR EACH ROW EXECUTE FUNCTION base.update_updated_at();

CREATE TRIGGER update_workspaces_updated_at
    BEFORE UPDATE ON base.workspaces
    FOR EACH ROW EXECUTE FUNCTION base.update_updated_at();
```

### Generate Slug

```sql
CREATE OR REPLACE FUNCTION base.generate_slug(name TEXT)
RETURNS TEXT AS $
BEGIN
    RETURN lower(
        regexp_replace(
            regexp_replace(name, '[^a-zA-Z0-9\s-]', '', 'g'),
            '\s+', '-', 'g'
        )
    );
END;
$ LANGUAGE plpgsql IMMUTABLE;

-- Auto-generate slug on workspace insert
CREATE OR REPLACE FUNCTION base.auto_generate_workspace_slug()
RETURNS TRIGGER AS $
BEGIN
    IF NEW.slug IS NULL OR NEW.slug = '' THEN
        NEW.slug = base.generate_slug(NEW.name) || '-' || substr(gen_random_uuid()::text, 1, 8);
    END IF;
    RETURN NEW;
END;
$ LANGUAGE plpgsql;

CREATE TRIGGER auto_workspace_slug
    BEFORE INSERT ON base.workspaces
    FOR EACH ROW EXECUTE FUNCTION base.auto_generate_workspace_slug();
```

### Validate JSON Schema

```sql
CREATE OR REPLACE FUNCTION base.validate_permissions_array(permissions JSONB)
RETURNS BOOLEAN AS $
BEGIN
    -- Must be an array
    IF jsonb_typeof(permissions) != 'array' THEN
        RETURN FALSE;
    END IF;

    -- Each element must be a string
    RETURN NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(permissions) elem
        WHERE jsonb_typeof(elem) != 'string'
    );
END;
$ LANGUAGE plpgsql IMMUTABLE;

-- Add check constraint
ALTER TABLE base.workspace_roles
ADD CONSTRAINT valid_permissions
CHECK (base.validate_permissions_array(permissions));
```

---

## Debug & Monitoring

### List All Triggers

```sql
SELECT
    trigger_schema,
    trigger_name,
    event_manipulation,
    event_object_schema,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'base'
ORDER BY event_object_table, trigger_name;
```

### List All Functions

```sql
SELECT
    routine_name,
    routine_type,
    data_type
FROM information_schema.routines
WHERE routine_schema = 'base'
ORDER BY routine_name;
```

### Test Trigger

```sql
-- Insert test data
INSERT INTO base.events (workspace_id, name) VALUES ('ws-uuid', 'Test Event');

-- Check if trigger fired
SELECT * FROM base.workspace_resource_usage WHERE workspace_id = 'ws-uuid';
```

---

## Best Practices

### Do's

- Use `SECURITY DEFINER` for triggers needing elevated access
- Use `AFTER` triggers for non-blocking side effects
- Keep trigger logic minimal and fast
- Use `COALESCE` and `GREATEST` for null safety
- Log errors to a debug table for troubleshooting

### Don'ts

- Don't call external services from triggers
- Don't use recursive triggers without guards
- Don't modify the same table in an AFTER trigger
- Don't forget to grant execute permissions
- Don't use SELECT * in trigger functions
