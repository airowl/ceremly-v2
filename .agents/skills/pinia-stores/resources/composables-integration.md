# Composables Integration

## Table of Contents
- [When to Use Composables vs Stores](#when-to-use-composables-vs-stores)
- [API Composables Pattern](#api-composables-pattern)
- [Store + Composable Integration](#store--composable-integration)
- [Shared Composables](#shared-composables)
- [Real Examples](#real-examples)

---

## When to Use Composables vs Stores

### Use Pinia Stores When:

- **Global state** shared across components
- **Persistent data** that survives navigation
- **Auth/session state** that needs to be reactive globally
- **Multi-component coordination** (workspace context, user data)
- **Caching** data that shouldn't be refetched

### Use Composables When:

- **Reusable logic** without global state
- **API abstraction** to simplify store actions
- **Component-local state** that doesn't need sharing
- **Utility functions** with reactive features
- **Encapsulating complexity** from stores

### Decision Matrix

| Scenario | Use |
|----------|-----|
| User authentication state | Store |
| Current workspace context | Store |
| Events list for dashboard | Store |
| API call wrapper with retry | Composable |
| Form validation logic | Composable |
| Debounced search input | Composable |
| Date formatting utilities | Composable |
| Toast notifications trigger | Composable |

---

## API Composables Pattern

### Basic API Composable

```typescript
// composables/useEventsApi.ts
export function useEventsApi() {
    const { $supabase } = useNuxtApp();
    const toast = useToast();

    async function createEvent(input: CreateEventInput) {
        const { data, error } = await $supabase.functions.invoke('events', {
            body: input
        });

        if (error) {
            toast.add({ title: 'Errore creazione evento', color: 'error' });
            throw error;
        }

        if (data.error) {
            toast.add({ title: data.error, color: 'error' });
            throw new Error(data.error);
        }

        toast.add({ title: 'Evento creato', color: 'success' });
        return data.event;
    }

    async function updateEvent(id: string, input: Partial<Event>) {
        const { data, error } = await $supabase.functions.invoke('events', {
            body: { id, ...input },
            method: 'PATCH'
        });

        if (error) throw error;
        if (data.error) throw new Error(data.error);

        return data.event;
    }

    async function deleteEvent(id: string) {
        const { error } = await $supabase.functions.invoke('events', {
            body: { id },
            method: 'DELETE'
        });

        if (error) throw error;
    }

    return {
        createEvent,
        updateEvent,
        deleteEvent
    };
}
```

### Using API Composable in Store

```typescript
// stores/eventsStore.ts
import { useEventsApi } from '~/composables/useEventsApi';

export const useEventsStore = defineStore('events', () => {
    const events = ref<Event[]>([]);
    const isCreating = ref(false);

    async function addEvent(input: CreateEventInput) {
        if (process.server) return;

        const eventsApi = useEventsApi();  // Use composable for API logic

        isCreating.value = true;

        try {
            const event = await eventsApi.createEvent(input);

            // Store just manages state
            events.value.unshift(event);

            return event;
        } finally {
            isCreating.value = false;
        }
    }

    return { events, isCreating, addEvent };
});
```

---

## Store + Composable Integration

### Pattern: Store for State, Composable for Logic

```typescript
// composables/useEventManagement.ts
import { useEventsStore } from '~/stores/eventsStore';
import { useWorkspaceStore } from '~/stores/workspaceStore';
import { useUserStore } from '~/stores/userStore';

export function useEventManagement() {
    const eventsStore = useEventsStore();
    const workspaceStore = useWorkspaceStore();
    const userStore = useUserStore();
    const toast = useToast();

    // Computed from stores
    const events = computed(() => eventsStore.events);
    const canCreate = computed(() => workspaceStore.eventLimit?.allowed ?? false);
    const isReadOnly = computed(() => userStore.isReadOnlyPlan());

    // Business logic combining multiple stores
    async function createEventWithValidation(input: CreateEventInput) {
        // Check plan
        if (isReadOnly.value) {
            toast.add({
                title: 'Piano gratuito',
                description: 'Effettua l\'upgrade per creare eventi',
                color: 'warning'
            });
            return null;
        }

        // Check limit
        if (!canCreate.value) {
            const limit = workspaceStore.eventLimit;
            toast.add({
                title: 'Limite raggiunto',
                description: `Hai raggiunto ${limit?.current}/${limit?.limit} eventi`,
                color: 'warning'
            });
            return null;
        }

        // Create via store
        return await eventsStore.addEvent(input);
    }

    async function deleteEventWithConfirmation(eventId: string) {
        const confirmed = await useConfirmDialog({
            title: 'Conferma eliminazione',
            message: 'Sei sicuro di voler eliminare questo evento?'
        });

        if (!confirmed) return false;

        await eventsStore.removeEvent(eventId);
        return true;
    }

    return {
        events,
        canCreate,
        isReadOnly,
        createEventWithValidation,
        deleteEventWithConfirmation
    };
}
```

### Using in Component

```typescript
<script setup lang="ts">
const {
    events,
    canCreate,
    createEventWithValidation
} = useEventManagement();

async function handleSubmit(formData: CreateEventInput) {
    const event = await createEventWithValidation(formData);
    if (event) {
        closeModal();
    }
}
</script>
```

---

## Shared Composables

### createSharedComposable Pattern

For composables that should share state across components:

```typescript
// composables/useDashboard.ts
import { createSharedComposable } from '@vueuse/core';

function _useDashboard() {
    const workspaceStore = useWorkspaceStore();
    const userStore = useUserStore();

    const isLoading = ref(false);
    const lastRefresh = ref<Date | null>(null);

    async function refresh() {
        if (process.server) return;
        if (!workspaceStore.currentWorkspace) return;

        isLoading.value = true;

        try {
            await workspaceStore.refreshEventsAndUsage();
            lastRefresh.value = new Date();
        } finally {
            isLoading.value = false;
        }
    }

    // Auto-refresh every 5 minutes
    let refreshInterval: NodeJS.Timeout | null = null;

    function startAutoRefresh() {
        if (refreshInterval) return;
        refreshInterval = setInterval(refresh, 5 * 60 * 1000);
    }

    function stopAutoRefresh() {
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    }

    return {
        isLoading,
        lastRefresh,
        refresh,
        startAutoRefresh,
        stopAutoRefresh
    };
}

// Export shared version - same instance across all components
export const useDashboard = createSharedComposable(_useDashboard);
```

### Usage

```typescript
// In any component - same instance
<script setup lang="ts">
const { isLoading, refresh, startAutoRefresh, stopAutoRefresh } = useDashboard();

onMounted(() => {
    startAutoRefresh();
});

onUnmounted(() => {
    stopAutoRefresh();
});
</script>
```

---

## Real Examples

### useSubscription Composable

```typescript
// composables/useSubscription.ts
import { useUserStore } from '~/stores/userStore';

export function useSubscription() {
    const userStore = useUserStore();
    const toast = useToast();

    const subscription = computed(() => userStore.subscription);
    const planName = computed(() => subscription.value?.subscription_plan || 'free');

    const isPro = computed(() => planName.value === 'pro');
    const isBasic = computed(() => planName.value === 'basic');
    const isFree = computed(() => planName.value === 'free');

    const isActive = computed(() =>
        subscription.value?.status === 'active'
    );

    const daysUntilRenewal = computed(() => {
        if (!subscription.value?.current_period_end) return null;
        const end = new Date(subscription.value.current_period_end);
        const now = new Date();
        return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    });

    async function upgrade(priceId: string) {
        const { $supabase } = useNuxtApp();

        try {
            const { data, error } = await $supabase.functions.invoke('create-checkout', {
                body: {
                    price_id: priceId,
                    success_url: window.location.origin + '/dashboard/billing?success=true',
                    cancel_url: window.location.origin + '/dashboard/billing'
                }
            });

            if (error) throw error;

            // Redirect to Stripe Checkout
            window.location.href = data.checkout_url;
        } catch (e) {
            toast.add({
                title: 'Errore upgrade',
                description: e instanceof Error ? e.message : 'Errore sconosciuto',
                color: 'error'
            });
        }
    }

    async function openPortal() {
        const { $supabase } = useNuxtApp();

        const { data, error } = await $supabase.functions.invoke('customer-portal', {
            body: {
                return_url: window.location.origin + '/dashboard/billing'
            }
        });

        if (error) throw error;

        window.location.href = data.portal_url;
    }

    return {
        subscription,
        planName,
        isPro,
        isBasic,
        isFree,
        isActive,
        daysUntilRenewal,
        upgrade,
        openPortal
    };
}
```

### useUsageNotifications Composable

```typescript
// composables/useUsageNotifications.ts
import { useWorkspaceStore } from '~/stores/workspaceStore';

export function useUsageNotifications() {
    const workspaceStore = useWorkspaceStore();
    const toast = useToast();

    const eventUsagePercent = computed(() => {
        const limit = workspaceStore.eventLimit;
        if (!limit || limit.limit === 0) return 0;
        return Math.round((limit.current / limit.limit) * 100);
    });

    const isNearEventLimit = computed(() => eventUsagePercent.value >= 80);
    const isAtEventLimit = computed(() => eventUsagePercent.value >= 100);

    function checkAndNotify() {
        if (isAtEventLimit.value) {
            toast.add({
                title: 'Limite eventi raggiunto',
                description: 'Effettua l\'upgrade per creare altri eventi',
                color: 'error',
                timeout: 10000
            });
        } else if (isNearEventLimit.value) {
            toast.add({
                title: 'Prossimo al limite',
                description: `Hai usato ${eventUsagePercent.value}% degli eventi disponibili`,
                color: 'warning',
                timeout: 5000
            });
        }
    }

    // Watch for limit changes
    watch(
        () => workspaceStore.eventLimit,
        () => {
            if (isNearEventLimit.value || isAtEventLimit.value) {
                checkAndNotify();
            }
        }
    );

    return {
        eventUsagePercent,
        isNearEventLimit,
        isAtEventLimit,
        checkAndNotify
    };
}
```

### useSiteMode Composable

```typescript
// composables/useSiteMode.ts
export function useSiteMode() {
    const config = useRuntimeConfig();

    const siteMode = computed(() =>
        config.public.siteMode as 'waitinglist' | 'active' | 'maintenance'
    );

    const isActiveMode = computed(() => siteMode.value === 'active');
    const isWaitingListMode = computed(() => siteMode.value === 'waitinglist');
    const isMaintenanceMode = computed(() => siteMode.value === 'maintenance');

    const shouldShowWaitingListCTA = computed(() =>
        isWaitingListMode.value && !isActiveMode.value
    );

    const shouldShowNewsletterCTA = computed(() =>
        isActiveMode.value
    );

    return {
        siteMode,
        isActiveMode,
        isWaitingListMode,
        isMaintenanceMode,
        shouldShowWaitingListCTA,
        shouldShowNewsletterCTA
    };
}
```

---

## Summary

### Best Practices

1. **Separate concerns**: Stores = state, Composables = logic
2. **API composables**: Encapsulate Supabase calls with error handling
3. **Business logic composables**: Combine multiple stores for complex operations
4. **Shared composables**: Use `createSharedComposable` for singleton state
5. **Keep stores thin**: Delegate complex logic to composables

### File Organization

```
fe/app/
├── stores/
│   ├── userStore.ts       # Auth state
│   ├── workspaceStore.ts  # Workspace state
│   └── eventsStore.ts     # Events state
└── composables/
    ├── useEventsApi.ts       # API abstraction
    ├── useEventManagement.ts # Business logic
    ├── useSubscription.ts    # Billing logic
    ├── useDashboard.ts       # Dashboard coordination
    └── useSiteMode.ts        # Config-based logic
```

### Pattern Summary

| Pattern | Store | Composable |
|---------|-------|------------|
| Global reactive state | ✅ | ❌ |
| API call abstraction | ❌ | ✅ |
| Business logic | Light | Heavy |
| Component-local state | ❌ | ✅ |
| Cross-store coordination | ❌ | ✅ |
| Caching | ✅ | Limited |
| SSR considerations | ✅ | ✅ |
