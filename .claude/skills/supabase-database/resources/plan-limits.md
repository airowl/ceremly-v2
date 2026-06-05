# Plan Limits

## Table of Contents
- [Overview](#overview)
- [Core Tables](#core-tables)
- [Limit Functions](#limit-functions)
- [Usage Tracking](#usage-tracking)
- [Checking Limits](#checking-limits)

---

## Overview

YourSaaS enforces resource limits based on subscription plans:

- **Plan Defaults**: Base limits per plan (free, basic, pro)
- **User Overrides**: Custom limits for specific users
- **Workspace Overrides**: Custom limits for specific workspaces
- **Audit Logging**: Track limit changes

### Limit Types

| Limit | Scope | Description |
|-------|-------|-------------|
| `max_workspaces` | User | Max workspaces a user can create |
| `max_events_per_workspace` | Workspace | Max events in a workspace |
| `max_guests_per_event` | Workspace | Max guests per event |
| `max_templates_per_workspace` | Workspace | Max templates in a workspace |

---

## Core Tables

### Plan Limits

Default limits per subscription plan:

```sql
CREATE TABLE base.plan_limits (
    plan_name TEXT PRIMARY KEY,
    max_workspaces INTEGER NOT NULL DEFAULT 0,
    max_events_per_workspace INTEGER NOT NULL DEFAULT 0,
    max_guests_per_event INTEGER NOT NULL DEFAULT 0,
    max_templates_per_workspace INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Default values
INSERT INTO base.plan_limits (plan_name, max_workspaces, max_events_per_workspace, max_guests_per_event, max_templates_per_workspace)
VALUES
    ('free', 1, 3, 50, 2),
    ('basic', 3, 10, 200, 10),
    ('pro', 10, 50, 1000, 50);
```

### User Limit Overrides

Custom limits for specific users:

```sql
CREATE TABLE base.user_limit_overrides (
    user_id UUID PRIMARY KEY REFERENCES base.users(id),
    max_workspaces INTEGER,
    override_reason TEXT,
    created_by UUID REFERENCES base.users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Workspace Limit Overrides

Custom limits for specific workspaces:

```sql
CREATE TABLE base.workspace_limit_overrides (
    workspace_id UUID PRIMARY KEY REFERENCES base.workspaces(id),
    max_events_per_workspace INTEGER,
    max_guests_per_event INTEGER,
    max_templates_per_workspace INTEGER,
    override_reason TEXT,
    created_by UUID REFERENCES base.users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Audit Log

Track all limit changes:

```sql
CREATE TABLE base.limit_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL,  -- 'user' or 'workspace'
    entity_id UUID NOT NULL,
    action TEXT NOT NULL,       -- 'override_created', 'override_updated', 'override_removed'
    old_values JSONB,
    new_values JSONB,
    performed_by UUID REFERENCES base.users(id),
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Limit Functions

### Get Effective User Limit

Returns the effective limit considering overrides:

```sql
CREATE OR REPLACE FUNCTION base.get_effective_user_limit(
    p_user_id UUID,
    p_limit_field TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $
DECLARE
    override_value INTEGER;
    plan_value INTEGER;
    user_plan TEXT;
BEGIN
    -- Check for user override first
    EXECUTE format(
        'SELECT %I FROM base.user_limit_overrides WHERE user_id = $1',
        p_limit_field
    ) INTO override_value USING p_user_id;

    IF override_value IS NOT NULL THEN
        RETURN override_value;
    END IF;

    -- Get user's plan
    SELECT subscription_plan INTO user_plan
    FROM base.subscriptions
    WHERE user_id = p_user_id;

    -- Default to 'free' if no subscription
    user_plan := COALESCE(user_plan, 'free');

    -- Get plan limit
    EXECUTE format(
        'SELECT %I FROM base.plan_limits WHERE plan_name = $1',
        p_limit_field
    ) INTO plan_value USING user_plan;

    RETURN COALESCE(plan_value, 0);
END;
$;
```

### Get Effective Workspace Limit

```sql
CREATE OR REPLACE FUNCTION base.get_effective_workspace_limit(
    p_workspace_id UUID,
    p_limit_field TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $
DECLARE
    override_value INTEGER;
    plan_value INTEGER;
    owner_plan TEXT;
BEGIN
    -- Check for workspace override first
    EXECUTE format(
        'SELECT %I FROM base.workspace_limit_overrides WHERE workspace_id = $1',
        p_limit_field
    ) INTO override_value USING p_workspace_id;

    IF override_value IS NOT NULL THEN
        RETURN override_value;
    END IF;

    -- Get workspace owner's plan
    SELECT s.subscription_plan INTO owner_plan
    FROM base.workspaces w
    JOIN base.workspace_users wu ON w.id = wu.workspace_id
    JOIN base.workspace_roles wr ON wu.role_id = wr.id
    JOIN base.subscriptions s ON wu.user_id = s.user_id
    WHERE w.id = p_workspace_id
    AND wr.name = 'owner'
    AND w.deleted_at IS NULL;

    -- Default to 'free'
    owner_plan := COALESCE(owner_plan, 'free');

    -- Get plan limit
    EXECUTE format(
        'SELECT %I FROM base.plan_limits WHERE plan_name = $1',
        p_limit_field
    ) INTO plan_value USING owner_plan;

    RETURN COALESCE(plan_value, 0);
END;
$;
```

---

## Usage Tracking

### Resource Usage Table

```sql
CREATE TABLE base.workspace_resource_usage (
    workspace_id UUID PRIMARY KEY REFERENCES base.workspaces(id),
    events_count INTEGER NOT NULL DEFAULT 0,
    guests_count INTEGER NOT NULL DEFAULT 0,
    templates_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Update Usage Triggers

```sql
-- After event insert
CREATE OR REPLACE FUNCTION base.increment_events_count()
RETURNS TRIGGER AS $
BEGIN
    UPDATE base.workspace_resource_usage
    SET events_count = events_count + 1, updated_at = NOW()
    WHERE workspace_id = NEW.workspace_id;
    RETURN NEW;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_event_created
    AFTER INSERT ON base.events
    FOR EACH ROW EXECUTE FUNCTION base.increment_events_count();

-- After event soft delete
CREATE OR REPLACE FUNCTION base.decrement_events_count()
RETURNS TRIGGER AS $
BEGIN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        UPDATE base.workspace_resource_usage
        SET events_count = events_count - 1, updated_at = NOW()
        WHERE workspace_id = NEW.workspace_id;
    END IF;
    RETURN NEW;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_event_deleted
    AFTER UPDATE OF deleted_at ON base.events
    FOR EACH ROW EXECUTE FUNCTION base.decrement_events_count();
```

---

## Checking Limits

### In Edge Functions

```typescript
import { checkPlanLimit } from '../_shared/lib/plan-limits.ts';

// Check before creating event
const canCreate = await checkPlanLimit(supabase, {
    workspaceId: workspaceId,
    limitField: 'max_events_per_workspace',
    currentUsage: currentEventsCount,
});

if (!canCreate.allowed) {
    return new Response(JSON.stringify({
        error: 'Plan limit reached',
        limit: canCreate.limit,
        current: canCreate.current,
        upgrade_url: '/billing/upgrade'
    }), { status: 403 });
}
```

### Plan Limits Utility

```typescript
// _shared/lib/plan-limits.ts
interface LimitCheckResult {
    allowed: boolean;
    limit: number;
    current: number;
    remaining: number;
}

export async function checkPlanLimit(
    supabase: SupabaseClient,
    params: {
        workspaceId?: string;
        userId?: string;
        limitField: string;
        currentUsage: number;
    }
): Promise<LimitCheckResult> {
    let limit: number;

    if (params.workspaceId) {
        const { data } = await supabase.rpc('get_effective_workspace_limit', {
            p_workspace_id: params.workspaceId,
            p_limit_field: params.limitField
        });
        limit = data ?? 0;
    } else if (params.userId) {
        const { data } = await supabase.rpc('get_effective_user_limit', {
            p_user_id: params.userId,
            p_limit_field: params.limitField
        });
        limit = data ?? 0;
    } else {
        throw new Error('Must provide workspaceId or userId');
    }

    return {
        allowed: params.currentUsage < limit,
        limit,
        current: params.currentUsage,
        remaining: Math.max(0, limit - params.currentUsage)
    };
}
```

### SQL Query Example

```sql
-- Check if workspace can create more events
SELECT
    wru.events_count as current_usage,
    base.get_effective_workspace_limit(w.id, 'max_events_per_workspace') as limit,
    wru.events_count < base.get_effective_workspace_limit(w.id, 'max_events_per_workspace') as can_create
FROM base.workspaces w
JOIN base.workspace_resource_usage wru ON w.id = wru.workspace_id
WHERE w.id = 'workspace-uuid';
```

---

## Admin Operations

### Create Override

```sql
-- User override
INSERT INTO base.user_limit_overrides (user_id, max_workspaces, override_reason, created_by)
VALUES ('user-uuid', 20, 'Enterprise customer', 'admin-uuid');

-- Log it
INSERT INTO base.limit_audit_log (entity_type, entity_id, action, new_values, performed_by)
VALUES ('user', 'user-uuid', 'override_created', '{"max_workspaces": 20}'::jsonb, 'admin-uuid');
```

### Remove Override

```sql
DELETE FROM base.user_limit_overrides WHERE user_id = 'user-uuid';

INSERT INTO base.limit_audit_log (entity_type, entity_id, action, old_values, performed_by)
VALUES ('user', 'user-uuid', 'override_removed', '{"max_workspaces": 20}'::jsonb, 'admin-uuid');
```

---

## Best Practices

### Do's

- Always check limits before creating resources
- Use RPC functions for limit queries (caching friendly)
- Log all override changes to audit table
- Update resource counts via triggers
- Return upgrade URL when limit reached

### Don'ts

- Don't hardcode limit values in code
- Don't bypass limit checks in Edge Functions
- Don't modify resource counts directly (use triggers)
- Don't forget to handle 0 limits (feature disabled)
