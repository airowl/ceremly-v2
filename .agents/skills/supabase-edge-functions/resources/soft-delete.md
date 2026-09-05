# Soft Delete Patterns

## Table of Contents
- [Overview](#overview)
- [Supported Tables](#supported-tables)
- [Basic Operations](#basic-operations)
- [Active Views](#active-views)
- [Bulk Operations](#bulk-operations)
- [Permanent Delete](#permanent-delete)
- [Examples](#examples)

---

## Overview

YourSaaS uses soft delete to preserve data integrity and enable recovery:

- Records are never physically deleted immediately
- `deleted_at` timestamp marks deletion
- Active views filter out soft-deleted records
- RLS policies respect soft delete status

### Import

```typescript
import {
    softDelete,
    restore,
    listActive,
    getActive,
    isRecordDeleted,
    listAll,
    permanentDelete,
    bulkSoftDelete,
    bulkRestore,
} from '../_shared/lib/soft-delete.ts';
```

---

## Supported Tables

Soft delete is implemented for:

| Table | Active View |
|-------|-------------|
| `workspaces` | `active_workspaces` |
| `events` | `active_events` |
| `guests` | `active_guests` |
| `templates` | `active_templates` |

```typescript
type SoftDeleteTable = 'workspaces' | 'events' | 'guests' | 'templates';
```

---

## Basic Operations

### softDelete

Marks a record as deleted by setting `deleted_at`.

```typescript
async function softDelete(
    supabase: SupabaseClient,
    table: SoftDeleteTable,
    id: string
): Promise<{ error: Error | null }>
```

**Usage:**

```typescript
const { error } = await softDelete(supabase, 'events', eventId);

if (error) {
    console.error('Failed to delete:', error);
}
```

**What it does:**

```sql
UPDATE base.events
SET deleted_at = NOW(), updated_at = NOW()
WHERE id = $1;
```

### restore

Restores a soft-deleted record by clearing `deleted_at`.

```typescript
async function restore(
    supabase: SupabaseClient,
    table: SoftDeleteTable,
    id: string
): Promise<{ error: Error | null }>
```

**Usage:**

```typescript
const { error } = await restore(supabase, 'events', eventId);

if (error) {
    console.error('Failed to restore:', error);
}
```

**What it does:**

```sql
UPDATE base.events
SET deleted_at = NULL, updated_at = NOW()
WHERE id = $1;
```

### getActive

Gets a single active (non-deleted) record by ID.

```typescript
async function getActive<T>(
    supabase: SupabaseClient,
    table: SoftDeleteTable,
    id: string,
    select?: string
): Promise<{ data: T | null; error: Error | null }>
```

**Usage:**

```typescript
// Get event by ID (only if not deleted)
const { data: event, error } = await getActive<Event>(
    supabase,
    'events',
    eventId
);

if (!event) {
    throw new Error('Event not found');
}

// With specific fields
const { data } = await getActive<{ id: string; name: string }>(
    supabase,
    'events',
    eventId,
    'id, name'
);
```

### isRecordDeleted

Checks if a record is soft-deleted.

```typescript
async function isRecordDeleted(
    supabase: SupabaseClient,
    table: SoftDeleteTable,
    id: string
): Promise<boolean>
```

**Usage:**

```typescript
const isDeleted = await isRecordDeleted(supabase, 'events', eventId);

if (isDeleted) {
    throw new Error('Event has been deleted');
}
```

---

## Active Views

### How Views Work

Active views automatically filter out soft-deleted records:

```sql
CREATE VIEW base.active_events AS
    SELECT * FROM base.events WHERE deleted_at IS NULL;
```

### listActive

Lists only active (non-deleted) records with filtering, ordering, and pagination.

```typescript
async function listActive<T>(
    supabase: SupabaseClient,
    table: SoftDeleteTable,
    options?: {
        select?: string;
        filters?: Record<string, unknown>;
        orderBy?: { column: string; ascending?: boolean };
        limit?: number;
        offset?: number;
    }
): Promise<{ data: T[] | null; error: Error | null }>
```

**Usage:**

```typescript
// Basic list
const { data: events } = await listActive<Event>(supabase, 'events');

// With filters
const { data: workspaceEvents } = await listActive<Event>(
    supabase,
    'events',
    {
        filters: { workspace_id: workspaceId },
        orderBy: { column: 'created_at', ascending: false },
        limit: 10,
    }
);

// With pagination
const { data: page2 } = await listActive<Event>(
    supabase,
    'events',
    {
        filters: { workspace_id: workspaceId },
        limit: 10,
        offset: 10, // Second page
    }
);

// Specific fields
const { data: eventNames } = await listActive<{ id: string; name: string }>(
    supabase,
    'events',
    { select: 'id, name' }
);
```

### listAll

Lists all records including soft-deleted (for admin purposes).

```typescript
async function listAll<T>(
    supabase: SupabaseClient,
    table: SoftDeleteTable,
    options?: {
        select?: string;
        includeDeletedOnly?: boolean;
    }
): Promise<{ data: T[] | null; error: Error | null }>
```

**Usage:**

```typescript
// All records (including deleted)
const { data: allEvents } = await listAll<Event>(supabase, 'events');

// Only deleted records (for trash/recovery UI)
const { data: deletedEvents } = await listAll<Event>(
    supabase,
    'events',
    { includeDeletedOnly: true }
);
```

---

## Bulk Operations

### bulkSoftDelete

Soft delete multiple records at once.

```typescript
async function bulkSoftDelete(
    supabase: SupabaseClient,
    table: SoftDeleteTable,
    ids: string[]
): Promise<{ error: Error | null }>
```

**Usage:**

```typescript
// Delete multiple guests
const { error } = await bulkSoftDelete(
    supabase,
    'guests',
    ['uuid-1', 'uuid-2', 'uuid-3']
);
```

### bulkRestore

Restore multiple soft-deleted records at once.

```typescript
async function bulkRestore(
    supabase: SupabaseClient,
    table: SoftDeleteTable,
    ids: string[]
): Promise<{ error: Error | null }>
```

**Usage:**

```typescript
// Restore multiple guests
const { error } = await bulkRestore(
    supabase,
    'guests',
    ['uuid-1', 'uuid-2', 'uuid-3']
);
```

---

## Permanent Delete

### permanentDelete

Permanently removes a record (irreversible).

```typescript
async function permanentDelete(
    supabase: SupabaseClient,
    table: SoftDeleteTable,
    id: string
): Promise<{ error: Error | null }>
```

**Requirements:**
- Record must already be soft-deleted
- Calls database RPC function `hard_delete_{table}`

**Usage:**

```typescript
// First verify it's soft-deleted
const isDeleted = await isRecordDeleted(supabase, 'events', eventId);
if (!isDeleted) {
    throw new Error('Must soft-delete before permanent deletion');
}

// Then permanently delete
const { error } = await permanentDelete(supabase, 'events', eventId);

if (error) {
    console.error('Permanent delete failed:', error);
}
```

**Error if not soft-deleted:**
```
"Record must be soft-deleted before permanent deletion"
```

---

## Examples

### DELETE Endpoint with Soft Delete

```typescript
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
            .is('deleted_at', null)  // Only get active records
            .single();

        if (fetchError || !event) {
            throw new Error('Event not found or access denied');
        }

        // Soft delete (RLS enforces delete permission)
        const { error: deleteError } = await client
            .from('events')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', eventId);

        if (deleteError) {
            if (deleteError.code === '42501') {
                throw new Error('Permission denied');
            }
            throw new Error(deleteError.message);
        }

        // Update resource counter
        await updateResourceUsage(supabase, event.workspace_id, 'events_count', -1);

        return successResponse({ message: 'Event deleted successfully' });
    } catch (error) {
        return errorResponse(error);
    }
});
```

### Restore Endpoint

```typescript
app.post('/:id/restore', async (c) => {
    if (c.req.method === 'OPTIONS') return corsPreflightResponse();

    try {
        const { client } = await authenticateWithClient(
            c.req.header('Authorization')
        );

        const eventId = c.req.param('id');

        // Get the soft-deleted event
        const { data: event, error: fetchError } = await client
            .from('events')
            .select('id, workspace_id, deleted_at')
            .eq('id', eventId)
            .not('deleted_at', 'is', null)  // Only get deleted records
            .single();

        if (fetchError || !event) {
            throw new Error('Deleted event not found');
        }

        // Check plan limits before restore
        await checkPlanLimit(supabase, {
            scope: 'workspace',
            workspaceId: event.workspace_id,
            limitField: 'max_events_per_workspace',
            resourceType: 'events',
            resourceTable: 'events',
            filterField: 'workspace_id',
            filterValue: event.workspace_id,
        });

        // Restore the event
        const { error: restoreError } = await client
            .from('events')
            .update({ deleted_at: null })
            .eq('id', eventId);

        if (restoreError) {
            throw new Error(restoreError.message);
        }

        // Update resource counter
        await updateResourceUsage(supabase, event.workspace_id, 'events_count');

        return successResponse({ message: 'Event restored successfully' });
    } catch (error) {
        return errorResponse(error);
    }
});
```

### Using Soft Delete Utilities

```typescript
import { softDelete, restore, listActive } from '../_shared/lib/soft-delete.ts';

// In an Edge Function

// Soft delete with utility
const { error: deleteError } = await softDelete(supabase, 'events', eventId);

// Restore with utility
const { error: restoreError } = await restore(supabase, 'events', eventId);

// List active events
const { data: events } = await listActive<Event>(supabase, 'events', {
    filters: { workspace_id: workspaceId },
    orderBy: { column: 'created_at', ascending: false },
});

// Get single active event
const { data: event } = await getActive<Event>(supabase, 'events', eventId);
```

### Query Patterns

```typescript
// Always filter out soft-deleted in manual queries
const { data } = await client
    .from('events')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)  // Important!
    .order('created_at', { ascending: false });

// Use active view (automatically filters)
const { data } = await client
    .from('active_events')  // View, not table
    .select('*')
    .eq('workspace_id', workspaceId);

// Get only deleted records
const { data: deleted } = await client
    .from('events')
    .select('*')
    .not('deleted_at', 'is', null);
```
