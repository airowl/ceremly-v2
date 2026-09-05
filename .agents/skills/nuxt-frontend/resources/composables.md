# Composables

## Table of Contents
- [Overview](#overview)
- [Core Composables](#core-composables)
- [Creating Composables](#creating-composables)
- [Shared Composables](#shared-composables)
- [Best Practices](#best-practices)

---

## Overview

Composables are reusable logic functions following Vue 3's Composition API:

- **Location**: `fe/app/composables/`
- **Naming**: `use*.ts` (e.g., `useSiteMode.ts`)
- **Auto-import**: Nuxt auto-imports all composables

### Basic Pattern

```typescript
// composables/useCounter.ts
export function useCounter(initial = 0) {
    const count = ref(initial);

    function increment() {
        count.value++;
    }

    function decrement() {
        count.value--;
    }

    return { count, increment, decrement };
}
```

---

## Core Composables

### useSiteMode

Controls app operational mode (waitinglist/active/maintenance).

**Location**: `fe/app/composables/useSiteMode.ts`

```typescript
export function useSiteMode() {
    const config = useRuntimeConfig();

    const siteMode = computed(() =>
        config.public.siteMode as SiteMode
    );

    const isWaitingListMode = computed(() =>
        siteMode.value === 'waitinglist'
    );

    const isActiveMode = computed(() =>
        siteMode.value === 'active'
    );

    const isMaintenanceMode = computed(() =>
        siteMode.value === 'maintenance'
    );

    return {
        siteMode,
        isWaitingListMode,
        isActiveMode,
        isMaintenanceMode,
    };
}
```

**Usage**:

```typescript
<script setup lang="ts">
const { siteMode, isActiveMode, isWaitingListMode } = useSiteMode();
</script>

<template>
    <WaitingListCTA v-if="isWaitingListMode" />
    <DashboardNav v-else-if="isActiveMode" />
</template>
```

### useWorkspace

Simple workspace access from URL params.

**Location**: `fe/app/composables/useWorkspace.ts`

```typescript
export function useWorkspace() {
    const route = useRoute();

    const workspaceId = computed(() =>
        route.params.workspaceId as string | undefined
    );

    return { workspaceId };
}
```

**Usage**:

```typescript
<script setup lang="ts">
const { workspaceId } = useWorkspace();

// Use in API calls
const loadData = async () => {
    if (!workspaceId.value) return;
    await fetchEvents(workspaceId.value);
};
</script>
```

### useSubscription

Stripe subscription management.

**Location**: `fe/app/composables/useSubscription.ts`

```typescript
export function useSubscription() {
    const userStore = useUserStore();
    const isLoading = ref(false);

    async function createCheckoutSession(priceId: string) {
        if (process.server) return;

        isLoading.value = true;
        try {
            const { $supabase } = useNuxtApp();
            const { data, error } = await $supabase.functions.invoke(
                'create-checkout-session',
                { body: { priceId } }
            );

            if (error) throw error;

            // Redirect to Stripe
            window.location.href = data.url;
        } finally {
            isLoading.value = false;
        }
    }

    async function createPortalSession() {
        if (process.server) return;

        const { $supabase } = useNuxtApp();
        const { data, error } = await $supabase.functions.invoke(
            'create-portal-session'
        );

        if (error) throw error;
        window.location.href = data.url;
    }

    return {
        subscription: computed(() => userStore.subscription),
        isLoading,
        createCheckoutSession,
        createPortalSession,
    };
}
```

### useDashboard

Shared dashboard state using VueUse's `createSharedComposable`.

**Location**: `fe/app/composables/useDashboard.ts`

```typescript
import { createSharedComposable } from '@vueuse/core';

function _useDashboard() {
    const isSidebarOpen = ref(true);
    const isMobileMenuOpen = ref(false);

    function toggleSidebar() {
        isSidebarOpen.value = !isSidebarOpen.value;
    }

    function toggleMobileMenu() {
        isMobileMenuOpen.value = !isMobileMenuOpen.value;
    }

    return {
        isSidebarOpen,
        isMobileMenuOpen,
        toggleSidebar,
        toggleMobileMenu,
    };
}

// Share state across all component instances
export const useDashboard = createSharedComposable(_useDashboard);
```

**Usage**:

```typescript
<script setup lang="ts">
// Same state instance everywhere
const { isSidebarOpen, toggleSidebar } = useDashboard();
</script>
```

---

## Creating Composables

### State + Actions Pattern

```typescript
// composables/useEventForm.ts
export function useEventForm(workspaceId: Ref<string>) {
    const { $supabase } = useNuxtApp();
    const toast = useToast();

    const isSubmitting = ref(false);
    const error = ref<string | null>(null);

    const formState = reactive({
        name: '',
        description: '',
        date: null as Date | null,
    });

    async function submit() {
        if (process.server) return;

        isSubmitting.value = true;
        error.value = null;

        try {
            const { data, error: createError } = await $supabase.functions.invoke(
                'events',
                {
                    body: {
                        ...formState,
                        workspace_id: workspaceId.value,
                    }
                }
            );

            if (createError) throw createError;

            toast.add({
                title: 'Successo',
                description: 'Evento creato',
                color: 'success',
            });

            return data;
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Errore';
            toast.add({
                title: 'Errore',
                description: error.value,
                color: 'error',
            });
        } finally {
            isSubmitting.value = false;
        }
    }

    function reset() {
        formState.name = '';
        formState.description = '';
        formState.date = null;
        error.value = null;
    }

    return {
        formState,
        isSubmitting,
        error,
        submit,
        reset,
    };
}
```

### Data Fetching Pattern

```typescript
// composables/useGuests.ts
export function useGuests(eventId: Ref<string>) {
    const { $supabase } = useNuxtApp();

    const guests = ref<Guest[]>([]);
    const isLoading = ref(false);
    const error = ref<string | null>(null);

    async function fetchGuests() {
        if (process.server) return;
        if (!eventId.value) return;

        isLoading.value = true;

        try {
            const { data, error: fetchError } = await $supabase
                .from('guests')
                .select('*')
                .eq('event_id', eventId.value)
                .is('deleted_at', null)
                .order('created_at', { ascending: false });

            if (fetchError) throw fetchError;
            guests.value = data ?? [];
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Errore';
        } finally {
            isLoading.value = false;
        }
    }

    // Auto-fetch when eventId changes
    watch(eventId, () => {
        if (eventId.value) {
            fetchGuests();
        }
    }, { immediate: true });

    return {
        guests,
        isLoading,
        error,
        refresh: fetchGuests,
    };
}
```

---

## Shared Composables

Use VueUse's `createSharedComposable` when you need singleton state:

```typescript
import { createSharedComposable } from '@vueuse/core';

// Private implementation
function _useAppState() {
    const isOnline = ref(true);
    const notifications = ref<Notification[]>([]);

    return { isOnline, notifications };
}

// Shared export - same instance everywhere
export const useAppState = createSharedComposable(_useAppState);
```

### When to Use Shared Composables

| Use Case | Pattern |
|----------|---------|
| UI state (sidebar, modals) | `createSharedComposable` |
| Form state | Regular composable (new per usage) |
| Feature flags | `createSharedComposable` |
| Data fetching | Regular composable |
| Notification system | `createSharedComposable` |

---

## Best Practices

### Do's

✅ Start name with `use` prefix
✅ Return refs and computed for reactivity
✅ Handle loading and error states
✅ Add `if (process.server) return;` for client-only logic
✅ Use TypeScript for parameter and return types
✅ Clean up watchers and listeners

### Don'ts

❌ Mutate props directly
❌ Return non-reactive values that should be reactive
❌ Forget server-side guards
❌ Create side effects without cleanup
❌ Import Supabase directly

### TypeScript Pattern

```typescript
// composables/useResource.ts
interface UseResourceOptions {
    immediate?: boolean;
}

interface UseResourceReturn<T> {
    data: Ref<T | null>;
    isLoading: Ref<boolean>;
    error: Ref<string | null>;
    refresh: () => Promise<void>;
}

export function useResource<T>(
    fetcher: () => Promise<T>,
    options: UseResourceOptions = {}
): UseResourceReturn<T> {
    const { immediate = true } = options;

    const data = ref<T | null>(null) as Ref<T | null>;
    const isLoading = ref(false);
    const error = ref<string | null>(null);

    async function refresh() {
        if (process.server) return;

        isLoading.value = true;
        error.value = null;

        try {
            data.value = await fetcher();
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Error';
        } finally {
            isLoading.value = false;
        }
    }

    if (immediate) {
        refresh();
    }

    return { data, isLoading, error, refresh };
}
```

### Cleanup Pattern

```typescript
export function useEventListener(
    target: EventTarget,
    event: string,
    handler: EventListener
) {
    onMounted(() => {
        target.addEventListener(event, handler);
    });

    onUnmounted(() => {
        target.removeEventListener(event, handler);
    });
}
```
