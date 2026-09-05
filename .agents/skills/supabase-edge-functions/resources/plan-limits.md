# Plan Limits

## Table of Contents
- [Overview](#overview)
- [Limit Scopes](#limit-scopes)
- [Usage](#usage)
- [Limit Fields](#limit-fields)
- [Override System](#override-system)
- [Examples](#examples)

---

## Overview

YourSaaS enforces subscription-based resource limits at two scopes:
- **User-scoped**: Limits per user (e.g., max workspaces)
- **Workspace-scoped**: Limits per workspace (e.g., max events)

### Import

```typescript
import {
    checkPlanLimit,
    getEffectiveUserLimit,
    getEffectiveWorkspaceLimit,
} from '../_shared/lib/plan-limits.ts';
```

### Key Concepts

1. **Plan defaults** - Each subscription plan has default limits
2. **Per-entity overrides** - Individual users/workspaces can have custom limits
3. **Effective limit** - Override value if set, otherwise plan default
4. **Soft-deleted exclusion** - Counts exclude soft-deleted records

---

## Limit Scopes

### User-Scoped Limits

Limits that apply to a user across all their workspaces:

| Field | Description | Typical Values |
|-------|-------------|----------------|
| `max_workspaces` | Workspaces user can create | Free: 1, Basic: 3, Pro: 10 |

### Workspace-Scoped Limits

Limits that apply within a single workspace:

| Field | Description | Typical Values |
|-------|-------------|----------------|
| `max_events_per_workspace` | Events in workspace | Free: 5, Basic: 20, Pro: 100 |
| `max_guests_per_event` | Guests per event | Free: 50, Basic: 200, Pro: 1000 |
| `max_users_per_workspace` | Team members | Free: 1, Basic: 5, Pro: 20 |
| `max_images_per_event` | Images per event | Free: 5, Basic: 20, Pro: 50 |

---

## Usage

### checkPlanLimit Function

```typescript
async function checkPlanLimit(
    supabase: SupabaseClient,
    options: CheckUserLimitOptions | CheckWorkspaceLimitOptions
): Promise<void>

// Throws error if limit exceeded
// Returns void if within limits
```

### User-Scoped Check

```typescript
import { checkPlanLimit } from '../_shared/lib/plan-limits.ts';
import { supabase } from '../_shared/lib/supabase.ts';

// Before creating a workspace
await checkPlanLimit(supabase, {
    scope: 'user',
    userId: user.id,
    limitField: 'max_workspaces',
    resourceType: 'workspaces',
    resourceTable: 'workspaces',
    filterField: 'created_by_id',
    filterValue: user.id,
    skipForPlans: ['free'], // Optional: block certain plans entirely
});
```

### Workspace-Scoped Check

```typescript
// Before creating an event
await checkPlanLimit(supabase, {
    scope: 'workspace',
    workspaceId: body.workspace_id,
    limitField: 'max_events_per_workspace',
    resourceType: 'events',
    resourceTable: 'events',
    filterField: 'workspace_id',
    filterValue: body.workspace_id,
});
```

### Options Interface

```typescript
interface CheckUserLimitOptions {
    scope: 'user';
    userId: string;
    limitField: UserLimitField;
    resourceType: ResourceType;
    resourceTable: string;
    filterField?: string;
    filterValue?: string;
    skipForPlans?: string[];  // Plans blocked from creating this resource
}

interface CheckWorkspaceLimitOptions {
    scope: 'workspace';
    workspaceId: string;
    limitField: WorkspaceLimitField;
    resourceType: ResourceType;
    resourceTable: string;
    filterField?: string;
    filterValue?: string;
}
```

---

## Limit Fields

### UserLimitField

```typescript
type UserLimitField = 'max_workspaces';
```

### WorkspaceLimitField

```typescript
type WorkspaceLimitField =
    | 'max_events_per_workspace'
    | 'max_guests_per_event'
    | 'max_users_per_workspace'
    | 'max_images_per_event';
```

### ResourceType

```typescript
type ResourceType =
    | 'workspaces'
    | 'users'
    | 'events'
    | 'guests'
    | 'images';
```

---

## Override System

### How Overrides Work

1. Check for per-entity override in `user_limit_overrides` or `workspace_limit_overrides`
2. If override exists, use override value
3. Otherwise, get plan default from `plan_limits` table

### Getting Effective Limits

```typescript
import {
    getEffectiveUserLimit,
    getEffectiveWorkspaceLimit,
    getAllUserEffectiveLimits,
    getAllWorkspaceEffectiveLimits,
} from '../_shared/lib/plan-limits.ts';

// Single limit
const maxWorkspaces = await getEffectiveUserLimit(
    supabase,
    userId,
    'max_workspaces'
);
console.log(maxWorkspaces);
// { value: 10, source: 'override' } or
// { value: 3, source: 'plan_default' }

// All limits for display
const allLimits = await getAllWorkspaceEffectiveLimits(
    supabase,
    workspaceId
);
// { max_events_per_workspace: 20, max_guests_per_event: 200, ... }
```

### Database Tables

```sql
-- Plan defaults
CREATE TABLE base.plan_limits (
    id UUID PRIMARY KEY,
    plan_name TEXT UNIQUE NOT NULL,  -- 'free', 'basic', 'pro'
    max_workspaces INTEGER,
    max_events_per_workspace INTEGER,
    max_guests_per_event INTEGER,
    max_users_per_workspace INTEGER,
    max_images_per_event INTEGER
);

-- User overrides
CREATE TABLE base.user_limit_overrides (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    max_workspaces INTEGER,
    -- Other fields can be added
    UNIQUE(user_id)
);

-- Workspace overrides
CREATE TABLE base.workspace_limit_overrides (
    id UUID PRIMARY KEY,
    workspace_id UUID REFERENCES base.workspaces(id),
    max_events_per_workspace INTEGER,
    max_guests_per_event INTEGER,
    max_users_per_workspace INTEGER,
    max_images_per_event INTEGER,
    UNIQUE(workspace_id)
);
```

---

## Examples

### Complete Event Creation with Limit Check

```typescript
import { Hono } from '@hono/hono';
import { authenticateWithClient } from '../_shared/lib/auth.ts';
import { supabase } from '../_shared/lib/supabase.ts';
import { checkPlanLimit } from '../_shared/lib/plan-limits.ts';
import { updateResourceUsage } from '../_shared/lib/resource-tracking.ts';
import { validateRequired } from '../_shared/lib/validation.ts';
import {
    corsPreflightResponse,
    errorResponse,
    successResponse,
} from '../_shared/lib/responses.ts';

const app = new Hono().basePath('/events');

app.post('/', async (c) => {
    if (c.req.method === 'OPTIONS') return corsPreflightResponse();

    try {
        // 1. Authenticate
        const { user, client } = await authenticateWithClient(
            c.req.header('Authorization')
        );

        const body = await c.req.json();
        validateRequired(body, ['name', 'workspace_id'], 'Event');

        // 2. Verify workspace access (RLS enforces)
        const { data: workspace, error: wsError } = await client
            .from('workspaces')
            .select('id')
            .eq('id', body.workspace_id)
            .single();

        if (wsError || !workspace) {
            throw new Error('Workspace not found or access denied');
        }

        // 3. Check plan limits (uses service role)
        await checkPlanLimit(supabase, {
            scope: 'workspace',
            workspaceId: body.workspace_id,
            limitField: 'max_events_per_workspace',
            resourceType: 'events',
            resourceTable: 'events',
            filterField: 'workspace_id',
            filterValue: body.workspace_id,
        });

        // 4. Create event (RLS enforces create permission)
        const { data: event, error: createError } = await client
            .from('events')
            .insert({
                name: body.name,
                description: body.description,
                workspace_id: body.workspace_id,
                created_by_id: user.id,
            })
            .select()
            .single();

        if (createError) {
            if (createError.code === '42501') {
                throw new Error('Permission denied: Cannot create events');
            }
            throw new Error(createError.message);
        }

        // 5. Update resource counter
        await updateResourceUsage(supabase, body.workspace_id, 'events_count');

        return successResponse(event, 201);
    } catch (error) {
        // Plan limit error message: "Events limit reached (20/20). Please upgrade..."
        return errorResponse(error);
    }
});
```

### Workspace Creation with User Limit

```typescript
app.post('/', async (c) => {
    if (c.req.method === 'OPTIONS') return corsPreflightResponse();

    try {
        const { user, client } = await authenticateWithClient(
            c.req.header('Authorization')
        );

        const body = await c.req.json();
        validateRequired(body, ['name'], 'Workspace');

        // Check user's workspace limit
        await checkPlanLimit(supabase, {
            scope: 'user',
            userId: user.id,
            limitField: 'max_workspaces',
            resourceType: 'workspaces',
            resourceTable: 'workspaces',
            filterField: 'created_by_id',
            filterValue: user.id,
            skipForPlans: ['free'], // Free users can't create workspaces
        });

        // Create workspace...
        const { data, error } = await client
            .from('workspaces')
            .insert({
                name: body.name,
                created_by_id: user.id,
            })
            .select()
            .single();

        if (error) throw new Error(error.message);

        return successResponse(data, 201);
    } catch (error) {
        // Errors:
        // - "Free plan does not allow creating workspaces. Please upgrade."
        // - "Workspaces limit reached (3/3). Please upgrade..."
        return errorResponse(error);
    }
});
```

### Displaying Limits to User

```typescript
app.get('/limits', async (c) => {
    if (c.req.method === 'OPTIONS') return corsPreflightResponse();

    try {
        const { client } = await authenticateWithClient(
            c.req.header('Authorization')
        );

        const workspaceId = c.req.query('workspace_id');
        if (!workspaceId) {
            throw new Error('workspace_id required');
        }

        // Get all effective limits
        const limits = await getAllWorkspaceEffectiveLimits(
            supabase,
            workspaceId
        );

        // Get current usage
        const { data: workspace } = await client
            .from('workspaces')
            .select('events_count, guests_count, users_count')
            .eq('id', workspaceId)
            .single();

        return successResponse({
            limits,
            usage: workspace,
        });
    } catch (error) {
        return errorResponse(error);
    }
});
```

---

## Error Messages

When limits are exceeded, descriptive errors are thrown:

```typescript
// Plan blocked
"Free plan does not allow creating workspaces. Please upgrade your plan."

// Limit reached
"Events limit reached (20/20). Please upgrade your plan or contact support."
"Guests limit reached (200/200). Please upgrade your plan or contact support."

// Validation errors
"Unable to verify subscription"
"Unable to verify events count"
"No limits found for plan: free"
```
