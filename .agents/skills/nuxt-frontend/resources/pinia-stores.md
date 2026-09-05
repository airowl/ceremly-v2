# Pinia Stores

## Table of Contents
- [Overview](#overview)
- [Store Structure](#store-structure)
- [userStore](#userstore)
- [workspaceStore](#workspacestore)
- [Best Practices](#best-practices)

---

## Overview

YourSaaS uses Pinia with Composition API (setup syntax) for state management:

- **Setup Syntax**: `defineStore('name', () => { ... })`
- **Server Guard**: Always add `if (process.server) return;` for client-only operations
- **Supabase Access**: Via `useNuxtApp().$supabase`

### Import Pattern

```typescript
import { defineStore } from 'pinia';

export const useMyStore = defineStore('myStore', () => {
    // State
    const data = ref<Type | null>(null);
    const isLoading = ref(false);
    const error = ref<string | null>(null);

    // Getters (computed)
    const isEmpty = computed(() => data.value === null);

    // Actions
    async function fetchData() {
        if (process.server) return;  // Critical!

        const { $supabase } = useNuxtApp();
        // ...
    }

    // Expose
    return { data, isLoading, error, isEmpty, fetchData };
});
```

---

## Store Structure

### State Declaration

```typescript
// Primitive state
const count = ref(0);
const name = ref<string>('');

// Nullable objects
const user = ref<User | null>(null);
const workspace = ref<Workspace | null>(null);

// Arrays
const items = ref<Item[]>([]);

// Complex state
const subscription = ref<{
    plan_name: string;
    status: string;
    current_period_end: string;
} | null>(null);
```

### Computed Getters

```typescript
// Simple getter
const isLoggedIn = computed(() => user.value !== null);

// Derived value
const fullName = computed(() =>
    `${user.value?.first_name} ${user.value?.last_name}`
);

// Boolean checks
const hasActiveSubscription = computed(() =>
    subscription.value?.status === 'active'
);

// Array filtering
const activeEvents = computed(() =>
    events.value.filter(e => e.deleted_at === null)
);
```

### Actions

```typescript
// Async action with loading state
async function fetchItems() {
    if (process.server) return;

    isLoading.value = true;
    error.value = null;

    try {
        const { $supabase } = useNuxtApp();
        const { data, error: fetchError } = await $supabase
            .from('items')
            .select('*');

        if (fetchError) throw fetchError;
        items.value = data ?? [];
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Unknown error';
    } finally {
        isLoading.value = false;
    }
}

// Sync action
function clearError() {
    error.value = null;
}

// Reset action
function $reset() {
    user.value = null;
    items.value = [];
    isLoading.value = false;
    error.value = null;
}
```

---

## userStore

The main authentication and user state store.

### Location
`fe/app/stores/userStore.ts`

### Key State

```typescript
const user = ref<User | null>(null);
const subscription = ref<Subscription | null>(null);
const planLimits = ref<PlanLimits | null>(null);
const resourceUsage = ref<ResourceUsage | null>(null);
const isInitialized = ref(false);
```

### Key Actions

#### Authentication

```typescript
// Initialize auth state
await userStore.initializeAuth();

// Email/password login
const { error } = await userStore.login(email, password);

// OAuth login
await userStore.loginOAuth('google');

// Logout
await userStore.logout();
```

#### Subscription Management

```typescript
// Fetch subscription data
await userStore.fetchSubscription();

// Get current plan
const plan = userStore.subscription?.plan_name;

// Check plan status
const isActive = userStore.subscription?.status === 'active';
```

#### Plan Limit Checks

```typescript
// Check if user can create event
const result = await userStore.checkEventCreationLimit(workspaceId);
if (!result.allowed) {
    toast.add({
        title: 'Limite raggiunto',
        description: result.message,
        color: 'warning'
    });
    return;
}

// Check guest limit
const guestResult = await userStore.checkGuestCreationLimit(eventId);

// Check read-only status
if (userStore.isReadOnlyPlan()) {
    // Show upgrade prompt
}
```

### Usage in Components

```typescript
<script setup lang="ts">
import { useUserStore } from '~/stores/userStore';

const userStore = useUserStore();

// Access state
const isLoggedIn = computed(() => userStore.user !== null);
const planName = computed(() => userStore.subscription?.plan_name ?? 'free');

// Use actions
onMounted(async () => {
    if (!userStore.isInitialized) {
        await userStore.initializeAuth();
    }
});
</script>
```

---

## workspaceStore

Workspace and event state management.

### Location
`fe/app/stores/workspaceStore.ts`

### Key State

```typescript
const workspace = ref<Workspace | null>(null);
const events = ref<Event[]>([]);
const limits = ref<WorkspaceLimits | null>(null);
const isLoading = ref(false);
const hasMoreEvents = ref(false);
```

### Key Actions

#### Load Workspace

```typescript
// Load workspace with all related data
await workspaceStore.loadWorkspace(workspaceId);

// This loads in parallel:
// - Workspace details
// - Events list
// - Resource usage
// - Workspace limits
```

#### Events Management

```typescript
// Load more events (pagination)
await workspaceStore.loadMoreEvents();

// Refresh events and usage after changes
await workspaceStore.refreshEventsAndUsage();

// Reset store state
workspaceStore.$reset();
```

### Optimized Queries

The store uses `Promise.all()` for parallel data fetching:

```typescript
async function loadWorkspace(id: string) {
    if (process.server) return;

    isLoading.value = true;
    const { $supabase } = useNuxtApp();

    try {
        const [
            workspaceResult,
            eventsResult,
            usageResult,
            limitsResult
        ] = await Promise.all([
            $supabase.from('workspaces').select('*').eq('id', id).single(),
            $supabase.from('events').select('*').eq('workspace_id', id).limit(20),
            $supabase.from('workspace_resource_usage').select('*').eq('workspace_id', id).single(),
            $supabase.from('workspace_limits').select('*').eq('workspace_id', id).single(),
        ]);

        // Process results...
    } finally {
        isLoading.value = false;
    }
}
```

### Usage in Components

```typescript
<script setup lang="ts">
import { useWorkspaceStore } from '~/stores/workspaceStore';

const workspaceStore = useWorkspaceStore();
const route = useRoute();

// Load workspace on mount
onMounted(async () => {
    const workspaceId = route.params.id as string;
    await workspaceStore.loadWorkspace(workspaceId);
});

// Access state
const events = computed(() => workspaceStore.events);
const canCreateEvent = computed(() => {
    const usage = workspaceStore.limits;
    return (usage?.events_count ?? 0) < (usage?.max_events ?? 0);
});
</script>
```

---

## Best Practices

### Do's

✅ Always use `if (process.server) return;` guard
✅ Access Supabase via `useNuxtApp().$supabase`
✅ Use setup syntax with `defineStore('name', () => {})`
✅ Implement `$reset()` for cleanup
✅ Use `Promise.all()` for parallel queries
✅ Handle loading and error states
✅ Use TypeScript for state typing

### Don'ts

❌ Import Supabase directly
❌ Skip server-side guards
❌ Use Options API syntax
❌ Mutate state directly from components
❌ Forget to handle errors
❌ Make sequential queries when parallel is possible

### Error Handling Pattern

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

### Store Reset Pattern

```typescript
// In store
function $reset() {
    workspace.value = null;
    events.value = [];
    limits.value = null;
    isLoading.value = false;
    error.value = null;
}

// In component (on unmount or route change)
onUnmounted(() => {
    workspaceStore.$reset();
});

// Or on logout
async function logout() {
    await userStore.logout();
    workspaceStore.$reset();
    navigateTo('/login');
}
```
