# Supabase Integration Patterns

## Table of Contents
- [Client Access](#client-access)
- [Query Patterns](#query-patterns)
- [Edge Function Calls](#edge-function-calls)
- [Real-time Subscriptions](#real-time-subscriptions)
- [Error Handling](#error-handling)
- [Optimistic Updates](#optimistic-updates)

---

## Client Access

### Correct Pattern

Always access Supabase via NuxtApp context:

```typescript
async function fetchData() {
    if (process.server) return;  // Server guard FIRST

    const { $supabase } = useNuxtApp();
    // Now use $supabase
}
```

### Why Not Direct Import?

```typescript
// DO NOT USE - breaks SSR and hydration
import { supabase } from '~/lib/supabase';

// CORRECT - uses Nuxt plugin with proper initialization
const { $supabase } = useNuxtApp();
```

The `$supabase` client is configured in `plugins/supabase.client.ts` with:
- `base` schema configured
- PKCE auth flow
- Auto session refresh

---

## Query Patterns

### Single Record

```typescript
const { data, error } = await $supabase
    .from('workspaces')
    .select('id, name, slug')
    .eq('id', workspaceId)
    .single();

if (error) throw error;
workspace.value = data;
```

### Multiple Records

```typescript
const { data, error } = await $supabase
    .from('events')
    .select('id, name, event_date')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

if (error) throw error;
events.value = data ?? [];
```

### Count Only

```typescript
const { count, error } = await $supabase
    .from('guests')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId);

if (error) throw error;
guestCount.value = count || 0;
```

### Pagination

```typescript
const pageSize = 20;
const page = 1;

const { data, error } = await $supabase
    .from('events')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

// Check if more pages exist
hasMore.value = (data?.length || 0) === pageSize;
```

### Nested Selects (Joins)

```typescript
// Get events with guest count
const { data, error } = await $supabase
    .from('events')
    .select(`
        id,
        name,
        event_date,
        guests(count)
    `)
    .eq('workspace_id', workspaceId);

// Access: data[0].guests[0].count
```

### Parallel Queries (Optimization)

```typescript
const [workspaces, subscription, usage] = await Promise.all([
    $supabase.from('workspaces').select('*').eq('created_by_id', userId),
    $supabase.from('subscriptions').select('*').eq('user_id', userId).single(),
    $supabase.from('workspace_resource_usage').select('*').eq('workspace_id', wsId).single(),
]);

// Handle errors individually
if (workspaces.error) throw workspaces.error;
// subscription and usage might be null, handle accordingly
```

---

## Edge Function Calls

### POST (Create)

```typescript
const { data, error } = await $supabase.functions.invoke('events', {
    body: {
        name: 'New Event',
        description: 'Description',
        workspace_id: workspaceId,
    }
});

if (error) throw error;
if (data.error) throw new Error(data.error);

return data.event;
```

### GET (Read)

```typescript
const { data, error } = await $supabase.functions.invoke('events', {
    body: { id: eventId },
    method: 'GET'
});
```

### PATCH (Update)

```typescript
const { data, error } = await $supabase.functions.invoke('events', {
    body: {
        id: eventId,
        name: 'Updated Name',
    },
    method: 'PATCH'
});
```

### DELETE

```typescript
const { error } = await $supabase.functions.invoke('events', {
    body: { id: eventId },
    method: 'DELETE'
});
```

### With Headers

```typescript
const { data, error } = await $supabase.functions.invoke('events', {
    body: { ... },
    headers: {
        'x-custom-header': 'value',
    }
});
```

---

## Real-time Subscriptions

### In Store (Pattern)

```typescript
export const useWorkspaceStore = defineStore('workspace', () => {
    const events = ref<Event[]>([]);
    let eventsChannel: RealtimeChannel | null = null;

    async function subscribeToEvents(workspaceId: string) {
        if (process.server) return;

        const { $supabase } = useNuxtApp();

        // Cleanup existing subscription
        if (eventsChannel) {
            await eventsChannel.unsubscribe();
        }

        eventsChannel = $supabase
            .channel(`events:${workspaceId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'base',
                table: 'events',
                filter: `workspace_id=eq.${workspaceId}`
            }, (payload) => {
                handleEventChange(payload);
            })
            .subscribe();
    }

    function handleEventChange(payload: any) {
        switch (payload.eventType) {
            case 'INSERT':
                events.value.unshift(payload.new);
                break;
            case 'UPDATE':
                const idx = events.value.findIndex(e => e.id === payload.new.id);
                if (idx !== -1) events.value[idx] = payload.new;
                break;
            case 'DELETE':
                events.value = events.value.filter(e => e.id !== payload.old.id);
                break;
        }
    }

    async function unsubscribeFromEvents() {
        if (eventsChannel) {
            await eventsChannel.unsubscribe();
            eventsChannel = null;
        }
    }

    function $reset() {
        unsubscribeFromEvents();
        events.value = [];
    }

    return {
        events,
        subscribeToEvents,
        unsubscribeFromEvents,
        $reset
    };
});
```

### Cleanup on Component Unmount

```typescript
<script setup lang="ts">
const workspaceStore = useWorkspaceStore();

onMounted(async () => {
    await workspaceStore.subscribeToEvents(workspaceId);
});

onUnmounted(async () => {
    await workspaceStore.unsubscribeFromEvents();
});
</script>
```

---

## Error Handling

### Basic Pattern

```typescript
async function fetchData() {
    if (process.server) return;

    isLoading.value = true;
    error.value = null;

    try {
        const { $supabase } = useNuxtApp();
        const { data, error: queryError } = await $supabase
            .from('table')
            .select('*');

        if (queryError) {
            throw new Error(queryError.message);
        }

        items.value = data ?? [];
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Errore sconosciuto';
        console.error('[Store] Fetch error:', e);
    } finally {
        isLoading.value = false;
    }
}
```

### Edge Function Error Handling

```typescript
async function createItem(input: Input) {
    try {
        const { $supabase } = useNuxtApp();
        const { data, error } = await $supabase.functions.invoke('items', {
            body: input
        });

        // Check for network/invocation error
        if (error) {
            throw new Error(`Network error: ${error.message}`);
        }

        // Check for application error from Edge Function
        if (data.error) {
            throw new Error(data.error);
        }

        return data.item;
    } catch (e) {
        // Re-throw with context
        throw new Error(`Failed to create item: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
}
```

### Error Types

```typescript
interface SupabaseError {
    message: string;
    code?: string;
    details?: string;
    hint?: string;
}

function handleSupabaseError(error: SupabaseError): string {
    // Common error codes
    switch (error.code) {
        case 'PGRST116':
            return 'Record not found';
        case '23505':
            return 'Duplicate record exists';
        case '42501':
            return 'Permission denied';
        default:
            return error.message || 'Unknown error';
    }
}
```

---

## Optimistic Updates

### Pattern

```typescript
async function toggleFavorite(eventId: string) {
    if (process.server) return;

    const event = events.value.find(e => e.id === eventId);
    if (!event) return;

    // Optimistic update
    const previousValue = event.is_favorite;
    event.is_favorite = !event.is_favorite;

    try {
        const { $supabase } = useNuxtApp();
        const { error } = await $supabase
            .from('events')
            .update({ is_favorite: event.is_favorite })
            .eq('id', eventId);

        if (error) throw error;
    } catch (e) {
        // Rollback on error
        event.is_favorite = previousValue;
        console.error('[Store] Toggle favorite failed:', e);
        throw e;
    }
}
```

### With Toast Notifications

```typescript
async function deleteGuest(guestId: string) {
    if (process.server) return;

    const toast = useToast();

    // Store for rollback
    const index = guests.value.findIndex(g => g.id === guestId);
    const guest = guests.value[index];

    // Optimistic removal
    guests.value.splice(index, 1);

    try {
        const { $supabase } = useNuxtApp();
        const { error } = await $supabase
            .from('guests')
            .delete()
            .eq('id', guestId);

        if (error) throw error;

        toast.add({ title: 'Ospite eliminato', color: 'success' });
    } catch (e) {
        // Rollback
        guests.value.splice(index, 0, guest);
        toast.add({ title: 'Errore eliminazione', color: 'error' });
        throw e;
    }
}
```

---

## Insert/Update/Delete Patterns

### Insert

```typescript
async function createWorkspace(input: CreateWorkspaceInput) {
    const { $supabase } = useNuxtApp();
    const { data, error } = await $supabase
        .from('workspaces')
        .insert({
            name: input.name,
            slug: input.slug,
            description: input.description,
            created_by_id: userId,
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}
```

### Update

```typescript
async function updateWorkspace(id: string, updates: Partial<Workspace>) {
    const { $supabase } = useNuxtApp();
    const { data, error } = await $supabase
        .from('workspaces')
        .update({
            ...updates,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}
```

### Soft Delete

```typescript
async function softDeleteEvent(id: string) {
    const { $supabase } = useNuxtApp();
    const { error } = await $supabase
        .from('events')
        .update({
            deleted_at: new Date().toISOString(),
        })
        .eq('id', id);

    if (error) throw error;
}
```

### Upsert

```typescript
async function upsertPreferences(userId: string, prefs: Preferences) {
    const { $supabase } = useNuxtApp();
    const { data, error } = await $supabase
        .from('user_preferences')
        .upsert({
            user_id: userId,
            ...prefs,
            updated_at: new Date().toISOString(),
        }, {
            onConflict: 'user_id'
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}
```

---

## Quick Reference

### Common Query Methods

| Method | Purpose |
|--------|---------|
| `.select('*')` | Fetch all columns |
| `.select('id, name')` | Fetch specific columns |
| `.single()` | Expect exactly one row |
| `.maybeSingle()` | Expect zero or one row |
| `.eq('col', val)` | WHERE col = val |
| `.neq('col', val)` | WHERE col != val |
| `.in('col', [])` | WHERE col IN (...) |
| `.is('col', null)` | WHERE col IS NULL |
| `.order('col', { ascending: false })` | ORDER BY col DESC |
| `.range(0, 9)` | LIMIT 10 OFFSET 0 |
| `.limit(10)` | LIMIT 10 |

### Edge Function Methods

| Method | HTTP Verb |
|--------|-----------|
| `invoke('name', { body })` | POST (default) |
| `invoke('name', { method: 'GET' })` | GET |
| `invoke('name', { method: 'PATCH' })` | PATCH |
| `invoke('name', { method: 'DELETE' })` | DELETE |
