# Soft Delete

## Table of Contents
- [Overview](#overview)
- [Implementation Pattern](#implementation-pattern)
- [Active Views](#active-views)
- [Cascade Soft Delete](#cascade-soft-delete)
- [Hard Delete](#hard-delete)

---

## Overview

YourSaaS uses soft delete for all business tables:

- **Column**: `deleted_at TIMESTAMP DEFAULT NULL`
- **Pattern**: DELETE → UPDATE with timestamp
- **Views**: `active_*` views exclude soft-deleted
- **Cascade**: Parent deletion cascades to children

### Why Soft Delete?

- Data recovery capability
- Audit trail preservation
- Referential integrity maintenance
- Compliance requirements

---

## Implementation Pattern

### Table Column

Every business table includes:

```sql
CREATE TABLE base.table_name (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- other columns
    deleted_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Soft Delete Rule

Converts DELETE to UPDATE:

```sql
CREATE OR REPLACE RULE soft_delete_table_name AS
    ON DELETE TO base.table_name
    DO INSTEAD UPDATE base.table_name
    SET deleted_at = NOW()
    WHERE id = OLD.id AND deleted_at IS NULL;
```

### Complete Setup

```sql
-- 1. Table with deleted_at
CREATE TABLE base.new_table (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    deleted_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Active view
CREATE OR REPLACE VIEW base.active_new_table AS
SELECT * FROM base.new_table WHERE deleted_at IS NULL;

-- 3. Soft delete rule
CREATE OR REPLACE RULE soft_delete_new_table AS
    ON DELETE TO base.new_table
    DO INSTEAD UPDATE base.new_table
    SET deleted_at = NOW()
    WHERE id = OLD.id AND deleted_at IS NULL;

-- 4. Grants on view
GRANT SELECT ON base.active_new_table TO authenticated;
GRANT SELECT ON base.active_new_table TO service_role;
```

---

## Active Views

### Purpose

Active views automatically filter out soft-deleted records:

```sql
-- Instead of
SELECT * FROM base.events WHERE deleted_at IS NULL;

-- Use
SELECT * FROM base.active_events;
```

### Existing Active Views

```sql
-- Events
CREATE OR REPLACE VIEW base.active_events AS
SELECT * FROM base.events WHERE deleted_at IS NULL;

-- Guests
CREATE OR REPLACE VIEW base.active_guests AS
SELECT * FROM base.guests WHERE deleted_at IS NULL;

-- Templates
CREATE OR REPLACE VIEW base.active_templates AS
SELECT * FROM base.templates WHERE deleted_at IS NULL;

-- Workspaces
CREATE OR REPLACE VIEW base.active_workspaces AS
SELECT * FROM base.workspaces WHERE deleted_at IS NULL;

-- Workspace Users
CREATE OR REPLACE VIEW base.active_workspace_users AS
SELECT * FROM base.workspace_users WHERE deleted_at IS NULL;
```

### Using Views in Edge Functions

```typescript
// Recommended: Use active views
const { data } = await supabase
    .from('active_events')
    .select('*');

// If you need soft-deleted records (admin/audit)
const { data: allData } = await supabase
    .from('events')
    .select('*');
```

---

## Cascade Soft Delete

### Parent-Child Relationships

When parent is soft-deleted, children are also soft-deleted:

```
Event (soft deleted) → Guests (auto soft deleted)
Workspace (soft deleted) → Events, Users, Roles (auto soft deleted)
```

### Cascade Trigger

```sql
CREATE OR REPLACE FUNCTION base.cascade_soft_delete_event()
RETURNS TRIGGER AS $
BEGIN
    -- Only trigger when deleted_at changes from NULL to a value
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        -- Soft delete all related guests
        UPDATE base.guests
        SET deleted_at = NEW.deleted_at
        WHERE event_id = NEW.id AND deleted_at IS NULL;
    END IF;
    RETURN NEW;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER cascade_event_soft_delete
    AFTER UPDATE OF deleted_at ON base.events
    FOR EACH ROW
    EXECUTE FUNCTION base.cascade_soft_delete_event();
```

### Workspace Cascade

```sql
CREATE OR REPLACE FUNCTION base.cascade_soft_delete_workspace()
RETURNS TRIGGER AS $
BEGIN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        -- Soft delete all workspace users
        UPDATE base.workspace_users
        SET deleted_at = NEW.deleted_at
        WHERE workspace_id = NEW.id AND deleted_at IS NULL;

        -- Soft delete all workspace roles
        UPDATE base.workspace_roles
        SET deleted_at = NEW.deleted_at
        WHERE workspace_id = NEW.id AND deleted_at IS NULL;

        -- Soft delete all events (which cascades to guests)
        UPDATE base.events
        SET deleted_at = NEW.deleted_at
        WHERE workspace_id = NEW.id AND deleted_at IS NULL;
    END IF;
    RETURN NEW;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Hard Delete

### When to Hard Delete

- GDPR data deletion requests
- Test data cleanup
- Storage optimization (after retention period)

### Hard Delete Function

```sql
-- Permanently delete soft-deleted records older than retention period
CREATE OR REPLACE FUNCTION base.hard_delete_old_records(
    retention_days INTEGER DEFAULT 90
)
RETURNS void AS $
BEGIN
    -- Delete old guests first (child)
    DELETE FROM base.guests
    WHERE deleted_at IS NOT NULL
    AND deleted_at < NOW() - (retention_days || ' days')::INTERVAL;

    -- Delete old events (parent)
    DELETE FROM base.events
    WHERE deleted_at IS NOT NULL
    AND deleted_at < NOW() - (retention_days || ' days')::INTERVAL;

    -- Note: Use direct DELETE bypassing soft delete rule
END;
$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Bypassing Soft Delete Rule

For actual deletion, disable the rule temporarily:

```sql
-- Disable rule
ALTER TABLE base.events DISABLE RULE soft_delete_events;

-- Hard delete
DELETE FROM base.events WHERE id = 'uuid';

-- Re-enable rule
ALTER TABLE base.events ENABLE RULE soft_delete_events;
```

---

## Restore Soft-Deleted Records

### Single Record

```sql
UPDATE base.events
SET deleted_at = NULL
WHERE id = 'event-uuid';
```

### With Children

```sql
-- Restore event and its guests
UPDATE base.events SET deleted_at = NULL WHERE id = 'event-uuid';
UPDATE base.guests SET deleted_at = NULL WHERE event_id = 'event-uuid';
```

### Restore Function

```sql
CREATE OR REPLACE FUNCTION base.restore_event(event_id UUID)
RETURNS void AS $
BEGIN
    -- Restore event
    UPDATE base.events SET deleted_at = NULL WHERE id = event_id;

    -- Restore related guests
    UPDATE base.guests SET deleted_at = NULL WHERE event_id = event_id;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Best Practices

### Do's

- Always include `deleted_at` column on business tables
- Create active views for all soft-delete tables
- Use active views in normal queries
- Implement cascade triggers for parent-child relationships
- Consider retention policy for hard deletes

### Don'ts

- Don't query base tables without filtering `deleted_at IS NULL`
- Don't forget to update resource counts when soft deleting
- Don't hard delete without proper authorization
- Don't cascade to tables that should preserve history independently
