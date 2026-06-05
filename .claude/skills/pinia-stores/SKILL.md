---
name: pinia-stores
description: Pinia store development patterns for Nuxt 4 + TypeScript + Supabase multi-tenant SaaS. Use when creating stores, implementing state management, working with Pinia, integrating Supabase in stores, managing workspace context, handling auth state, implementing plan limits, or organizing store architecture. Covers setup syntax, TypeScript typing, server guards, parallel queries, error handling, store composition, and SSR considerations.
---

# Pinia Stores Development Skill

## Purpose

Comprehensive guide for implementing Pinia stores in the YourSaaS Nuxt 4 + TypeScript + Supabase multi-tenant SaaS application. Covers architecture, patterns, and best practices.

## When to Use

Automatically activates when you mention:
- Creating or modifying Pinia stores
- State management patterns
- Store architecture or structure
- Supabase integration in stores
- Multi-tenancy state management
- Auth state handling
- Plan limits or resource usage tracking
- Workspace context management
- SSR/persistence considerations

---

## Store Architecture Overview

### Directory Structure

```
fe/app/stores/
├── userStore.ts           # Auth, user profile, subscription, plan limits
├── workspaceStore.ts      # Current workspace, events, resource usage
├── eventsStore.ts         # (Future) Event-specific operations
├── guestsStore.ts         # (Future) Guest management
├── billingStore.ts        # (Future) Subscription management
└── uiStore.ts             # (Future) UI preferences, filters
```

### Store Responsibilities

| Store | Responsibility |
|-------|---------------|
| `userStore` | Auth session, subscription, plan limits, resource checks |
| `workspaceStore` | Current workspace context, events list, usage |
| `eventsStore` | Event CRUD, event-specific data |
| `guestsStore` | Guest CRUD, RSVP management |
| `billingStore` | Subscription, invoices, payment methods |
| `uiStore` | Filters, preferences, UI state (persistable) |

---

## Core Patterns

### 1. Setup Syntax (Composition API)

```typescript
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useMyStore = defineStore('myStore', () => {
    // State
    const data = ref<DataType | null>(null);
    const isLoading = ref(false);
    const error = ref<string | null>(null);

    // Getters (computed)
    const isEmpty = computed(() => data.value === null);
    const hasError = computed(() => error.value !== null);

    // Actions
    async function fetchData() {
        if (process.server) return;
        // ...implementation
    }

    function $reset() {
        data.value = null;
        isLoading.value = false;
        error.value = null;
    }

    return {
        // State
        data,
        isLoading,
        error,
        // Getters
        isEmpty,
        hasError,
        // Actions
        fetchData,
        $reset
    };
});
```

### 2. Server Guard (Critical)

```typescript
async function fetchData() {
    if (process.server) return;  // Always first line!

    const { $supabase } = useNuxtApp();
    // ...rest of implementation
}
```

### 3. Supabase Access

```typescript
// Correct - via NuxtApp
const { $supabase } = useNuxtApp();
const { data, error } = await $supabase.from('table').select('*');

// Never import directly
// import { supabase } from '~/lib/supabase';  // WRONG
```

### 4. TypeScript State Typing

```typescript
// Interfaces at file top
interface User {
    id: string;
    email: string;
    created_at: string;
}

interface Workspace {
    id: string;
    name: string;
    slug: string;
}

// Typed state
const user = ref<User | null>(null);
const workspaces = ref<Workspace[]>([]);
const selectedId = ref<string | null>(null);
```

### 5. Error Handling Pattern

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

        if (queryError) throw queryError;
        items.value = data ?? [];
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Errore sconosciuto';
        console.error('[Store] Fetch error:', e);
    } finally {
        isLoading.value = false;
    }
}
```

### 6. Parallel Queries (Optimization)

```typescript
async function loadWorkspace(workspaceId: string) {
    if (process.server) return;

    isLoading.value = true;

    try {
        const { $supabase } = useNuxtApp();

        const [workspaceResult, eventsResult, usageResult] = await Promise.all([
            $supabase.from('workspaces').select('*').eq('id', workspaceId).single(),
            $supabase.from('events').select('*').eq('workspace_id', workspaceId),
            $supabase.from('workspace_resource_usage').select('*').eq('workspace_id', workspaceId).single()
        ]);

        if (workspaceResult.error) throw workspaceResult.error;

        workspace.value = workspaceResult.data;
        events.value = eventsResult.data ?? [];
        usage.value = usageResult.data;
    } finally {
        isLoading.value = false;
    }
}
```

---

## Multi-Tenancy Pattern

### Workspace Context

The `workspaceStore` manages current workspace context:

```typescript
export const useWorkspaceStore = defineStore('workspace', () => {
    const currentWorkspace = ref<Workspace | null>(null);

    // All queries filter by workspace automatically via RLS
    // Just need to store current context for UI/navigation

    async function switchWorkspace(workspaceId: string) {
        if (process.server) return;

        // 1. Load new workspace
        await loadWorkspace(workspaceId);

        // 2. Refresh session to update JWT with workspace_id
        const { $supabase } = useNuxtApp();
        await $supabase.auth.refreshSession();
    }

    return { currentWorkspace, switchWorkspace };
});
```

### Store Composition

Stores can reference each other:

```typescript
// In eventsStore.ts
import { useWorkspaceStore } from '~/stores/workspaceStore';

export const useEventsStore = defineStore('events', () => {
    async function createEvent(eventData: CreateEventInput) {
        if (process.server) return;

        const workspaceStore = useWorkspaceStore();
        const workspaceId = workspaceStore.currentWorkspace?.id;

        if (!workspaceId) throw new Error('No workspace selected');

        // Create event with workspace_id
        const { $supabase } = useNuxtApp();
        const { data, error } = await $supabase.functions.invoke('events', {
            body: { ...eventData, workspace_id: workspaceId }
        });

        if (error) throw error;
        return data;
    }

    return { createEvent };
});
```

---

## Plan Limits Pattern

### Limit Check Actions

```typescript
// In userStore.ts
async function checkEventCreationLimit(workspaceId: string): Promise<LimitResult> {
    if (process.server) return { allowed: false, current: 0, limit: 0 };

    const planName = subscription.value?.subscription_plan || 'free';
    const limits = await getPlanLimits(planName);  // Uses cache
    const usage = await getResourceUsage(workspaceId);

    return {
        allowed: (usage?.events_count || 0) < (limits?.max_events_per_workspace || 0),
        current: usage?.events_count || 0,
        limit: limits?.max_events_per_workspace || 0
    };
}

// Usage in component
const userStore = useUserStore();
const result = await userStore.checkEventCreationLimit(workspaceId);
if (!result.allowed) {
    toast.add({ title: 'Limite raggiunto', color: 'warning' });
    return;
}
```

### Permission Helpers

```typescript
function hasWritePermissions(): boolean {
    if (!subscription.value) return false;
    const plan = subscription.value.subscription_plan;
    return plan === 'basic' || plan === 'pro';
}

function isReadOnlyPlan(): boolean {
    if (!subscription.value) return true;
    return subscription.value.subscription_plan === 'free';
}
```

---

## Store Reset Pattern

```typescript
// Define reset function in store
function $reset() {
    currentWorkspace.value = null;
    events.value = [];
    resourceUsage.value = null;
    isLoading.value = false;
    error.value = null;
}

// Call on logout
async function logout() {
    const workspaceStore = useWorkspaceStore();
    await userStore.logout();
    workspaceStore.$reset();
    navigateTo('/login');
}

// Call on unmount if needed
onUnmounted(() => {
    workspaceStore.$reset();
});
```

---

## Component Usage

```typescript
<script setup lang="ts">
import { useUserStore } from '~/stores/userStore';
import { useWorkspaceStore } from '~/stores/workspaceStore';

const userStore = useUserStore();
const workspaceStore = useWorkspaceStore();
const route = useRoute();

// Initialize on mount
onMounted(async () => {
    const workspaceId = route.params.id as string;
    await workspaceStore.loadWorkspace(workspaceId);
});

// Reactive state access
const events = computed(() => workspaceStore.events);
const isLoading = computed(() => workspaceStore.isLoading);
const canCreateEvent = computed(() => workspaceStore.eventLimit?.allowed ?? false);
</script>
```

---

## Quick Reference

### Do's

- Use `if (process.server) return;` as first line in async actions
- Access Supabase via `useNuxtApp().$supabase`
- Use setup syntax with `defineStore('name', () => {})`
- Implement `$reset()` for cleanup
- Use `Promise.all()` for parallel queries
- Type all state with interfaces
- Handle loading/error states consistently

### Don'ts

- Import Supabase directly
- Skip server-side guards
- Use Options API syntax
- Mutate state directly from components
- Forget to handle errors
- Make sequential queries when parallel is possible
- Duplicate workspace_id across stores

---

## Reference Files

For detailed patterns, see:

- **[Store Structure](resources/store-structure.md)** - Complete store templates
- **[Supabase Integration](resources/supabase-integration.md)** - Query patterns
- **[Multi-Tenancy](resources/multi-tenancy.md)** - Workspace context management
- **[Composables Integration](resources/composables-integration.md)** - Store + composable patterns
- **[SSR Considerations](resources/ssr-considerations.md)** - Server guards, hydration safety, client-only patterns
- **[Testing Patterns](resources/testing-patterns.md)** - Vitest setup, Supabase mocking, store testing
- **[TypeScript Patterns](resources/typescript-patterns.md)** - Advanced typing, generics, type guards

---

**Skill Status**: ACTIVE
**Line Count**: < 500 (following 500-line rule)
**Progressive Disclosure**: Reference files for detailed information
