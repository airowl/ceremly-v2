# Authentication Patterns

## Table of Contents
- [Overview](#overview)
- [authenticateUser vs authenticateWithClient](#authenticateuser-vs-authenticatewithclient)
- [RLS-Enabled Client](#rls-enabled-client)
- [Service Role Client](#service-role-client)
- [Error Handling](#error-handling)
- [Examples](#examples)

---

## Overview

YourSaaS uses Supabase Auth with JWT tokens and Row Level Security (RLS) for data isolation. The authentication pattern centers on two functions:

| Function | Returns | RLS | Use Case |
|----------|---------|-----|----------|
| `authenticateUser()` | `User` | No | Legacy, simple auth check |
| `authenticateWithClient()` | `{ user, client, token }` | Yes | **Recommended** - full RLS enforcement |

**Always prefer `authenticateWithClient()`** - it returns an RLS-enabled client that automatically enforces workspace isolation.

---

## authenticateUser vs authenticateWithClient

### authenticateUser (Legacy)

```typescript
import { authenticateUser } from '../_shared/lib/auth.ts';

// Returns only the user object
const user = await authenticateUser(c.req.header('Authorization'));
console.log(user.id); // User UUID

// Problem: No RLS client - must use service role or create client manually
```

### authenticateWithClient (Recommended)

```typescript
import { authenticateWithClient } from '../_shared/lib/auth.ts';

// Returns user, RLS-enabled client, and token
const { user, client, token } = await authenticateWithClient(
    c.req.header('Authorization')
);

// RLS policies apply automatically
const { data: events } = await client.from('events').select('*');
// Only returns events user has access to!
```

---

## RLS-Enabled Client

### How It Works

```typescript
export async function authenticateWithClient(
    authHeader: string | undefined,
): Promise<AuthResult> {
    const token = authHeader?.replace('Bearer ', '') ?? '';

    if (!token) {
        throw new Error('No authorization token provided');
    }

    // Client created with user's JWT token
    // RLS policies reference this token's claims
    const client = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        {
            global: {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            },
            db: {
                schema: 'base',  // Important: use base schema
            },
        },
    );

    // Verify token is valid
    const { data: { user }, error } = await client.auth.getUser();

    if (error || !user) {
        throw new Error(`Authentication failed: ${error?.message}`);
    }

    return { user, client, token };
}
```

### RLS Policy Enforcement

When using the RLS-enabled client:

```typescript
// This query is automatically filtered by RLS
const { data } = await client.from('events').select('*');

// Equivalent to:
// SELECT * FROM events
// WHERE workspace_id = JWT_CLAIM('workspace_id')
```

### JWT Claims Access in RLS

```sql
-- RLS policy accesses JWT claims
CREATE POLICY "events_workspace_isolation" ON base.events
    FOR SELECT
    USING (
        workspace_id = (
            (current_setting('request.jwt.claims', true)::jsonb
             -> 'app_metadata' ->> 'workspace_id')::uuid
        )
    );
```

---

## Service Role Client

### When to Use Service Role

The service role client bypasses RLS. Use it **only** for:

1. **Plan limit checks** - Need to query across workspaces
2. **Resource tracking** - Update counters after operations
3. **Admin operations** - Cross-workspace queries
4. **Stripe webhooks** - No user context available

### Service Role Client Setup

```typescript
// _shared/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    {
        db: {
            schema: 'base',
        },
    },
);
```

### Usage Pattern

```typescript
import { authenticateWithClient } from '../_shared/lib/auth.ts';
import { supabase } from '../_shared/lib/supabase.ts';
import { checkPlanLimit } from '../_shared/lib/plan-limits.ts';
import { updateResourceUsage } from '../_shared/lib/resource-tracking.ts';

app.post('/', async (c) => {
    // 1. Auth with RLS client for user operations
    const { user, client } = await authenticateWithClient(
        c.req.header('Authorization')
    );

    // 2. Plan limits use service role (cross-workspace query)
    await checkPlanLimit(supabase, {
        scope: 'workspace',
        workspaceId: workspace_id,
        limitField: 'max_events_per_workspace',
        resourceType: 'events',
        resourceTable: 'events',
        filterField: 'workspace_id',
        filterValue: workspace_id,
    });

    // 3. Create event with RLS client (permission enforced)
    const { data: event } = await client
        .from('events')
        .insert({ name, workspace_id })
        .select()
        .single();

    // 4. Update resource count with service role
    await updateResourceUsage(supabase, workspace_id, 'events_count');

    return successResponse(event, 201);
});
```

---

## Error Handling

### Authentication Errors

```typescript
try {
    const { user, client } = await authenticateWithClient(
        c.req.header('Authorization')
    );
} catch (error) {
    // Error messages from auth.ts:
    // - "No authorization token provided" → 401
    // - "Authentication failed: {message}" → 401
    // - "User not authenticated" → 401
    return errorResponse(error, 401);
}
```

### RLS Permission Errors

```typescript
const { data, error } = await client
    .from('events')
    .insert({ name, workspace_id })
    .select()
    .single();

if (error) {
    // RLS denial returns PostgreSQL error code 42501
    if (error.code === '42501') {
        throw new Error('Permission denied: Cannot create events');
    }
    throw new Error(error.message);
}
```

### Standard Error Pattern

```typescript
app.post('/', async (c) => {
    if (c.req.method === 'OPTIONS') {
        return corsPreflightResponse();
    }

    try {
        // Auth - throws on failure
        const { user, client } = await authenticateWithClient(
            c.req.header('Authorization')
        );

        // Validation - throws on failure
        const body = await c.req.json();
        validateRequired(body, ['name', 'workspace_id']);

        // Business logic
        const { data, error } = await client.from('events').insert({...});

        if (error) {
            if (error.code === '42501') {
                return errorResponse('Permission denied', 403);
            }
            throw new Error(error.message);
        }

        return successResponse(data, 201);
    } catch (error) {
        // Auth errors: 401
        if (error.message.includes('token') ||
            error.message.includes('Authentication')) {
            return errorResponse(error, 401);
        }
        // Other errors: 400
        return errorResponse(error);
    }
});
```

---

## Examples

### Complete CRUD with Auth

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

// CREATE - requires auth, plan limit check
app.post('/', async (c) => {
    if (c.req.method === 'OPTIONS') return corsPreflightResponse();

    try {
        const { user, client } = await authenticateWithClient(
            c.req.header('Authorization')
        );

        const body = await c.req.json();
        validateRequired(body, ['name', 'workspace_id']);

        // Check plan limits (service role)
        await checkPlanLimit(supabase, {
            scope: 'workspace',
            workspaceId: body.workspace_id,
            limitField: 'max_events_per_workspace',
            resourceType: 'events',
            resourceTable: 'events',
            filterField: 'workspace_id',
            filterValue: body.workspace_id,
        });

        // Create with RLS client
        const { data, error } = await client
            .from('events')
            .insert({
                name: body.name,
                workspace_id: body.workspace_id,
                created_by_id: user.id,
            })
            .select()
            .single();

        if (error) throw new Error(error.message);

        // Update usage counter (service role)
        await updateResourceUsage(supabase, body.workspace_id, 'events_count');

        return successResponse(data, 201);
    } catch (error) {
        return errorResponse(error);
    }
});

// READ - auth only, RLS filters results
app.get('/', async (c) => {
    if (c.req.method === 'OPTIONS') return corsPreflightResponse();

    try {
        const { client } = await authenticateWithClient(
            c.req.header('Authorization')
        );

        // RLS automatically filters to user's workspace
        const { data, error } = await client
            .from('events')
            .select('*')
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (error) throw new Error(error.message);

        return successResponse(data);
    } catch (error) {
        return errorResponse(error);
    }
});

// DELETE - auth, soft delete
app.delete('/:id', async (c) => {
    if (c.req.method === 'OPTIONS') return corsPreflightResponse();

    try {
        const { client } = await authenticateWithClient(
            c.req.header('Authorization')
        );

        const eventId = c.req.param('id');

        // Get event first (RLS enforces access)
        const { data: event, error: fetchError } = await client
            .from('events')
            .select('id, workspace_id')
            .eq('id', eventId)
            .is('deleted_at', null)
            .single();

        if (fetchError || !event) {
            throw new Error('Event not found or access denied');
        }

        // Soft delete (RLS enforces permission)
        const { error } = await client
            .from('events')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', eventId);

        if (error) throw new Error(error.message);

        // Decrement counter (service role)
        await updateResourceUsage(supabase, event.workspace_id, 'events_count', -1);

        return successResponse({ message: 'Event deleted' });
    } catch (error) {
        return errorResponse(error);
    }
});

Deno.serve(app.fetch);
```
