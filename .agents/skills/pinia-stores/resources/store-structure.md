# Store Structure Reference

## Table of Contents
- [Complete Store Templates](#complete-store-templates)
- [Auth Store Template](#auth-store-template)
- [Workspace Context Store Template](#workspace-context-store-template)
- [Events Store Template](#events-store-template)
- [Guests Store Template](#guests-store-template)
- [Billing Store Template](#billing-store-template)
- [UI Store Template](#ui-store-template)

---

## Complete Store Templates

### File Organization

```
fe/app/stores/
├── userStore.ts           # Auth, subscription, plan limits
├── workspaceStore.ts      # Workspace context, events, usage
├── eventsStore.ts         # Event CRUD operations
├── guestsStore.ts         # Guest management
├── billingStore.ts        # Subscription management
└── uiStore.ts             # UI preferences (persistable)
```

---

## Auth Store Template

```typescript
// stores/userStore.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

interface User {
    id: string;
    email: string;
    created_at: string;
    user_metadata?: Record<string, any>;
}

interface Subscription {
    id: string;
    user_id: string;
    subscription_plan: 'free' | 'basic' | 'pro';
    status: 'active' | 'canceled' | 'past_due';
    current_period_end: string;
    stripe_customer_id?: string;
}

interface PlanLimits {
    plan_name: string;
    max_workspaces: number;
    max_events_per_workspace: number;
    max_guests_per_event: number;
    max_images_per_event: number;
    storage_limit_mb: number;
}

export const useUserStore = defineStore('user', () => {
    // ============================================================================
    // STATE
    // ============================================================================
    const user = ref<User | null>(null);
    const isAuthenticated = ref(false);
    const subscription = ref<Subscription | null>(null);
    const planLimitsCache = ref<Map<string, PlanLimits>>(new Map());

    // ============================================================================
    // GETTERS
    // ============================================================================
    const getUser = computed(() => user.value);
    const getIsAuthenticated = computed(() => isAuthenticated.value);
    const getSubscription = computed(() => subscription.value);
    const currentPlan = computed(() => subscription.value?.subscription_plan || 'free');

    // ============================================================================
    // AUTH ACTIONS
    // ============================================================================
    async function initializeAuth() {
        if (process.server) return;

        const { $supabase } = useNuxtApp();
        const { data: { session } } = await $supabase.auth.getSession();

        if (session) {
            user.value = session.user as User;
            isAuthenticated.value = true;
            await fetchSubscription();
        }

        // Listen to auth changes
        $supabase.auth.onAuthStateChange((event, session) => {
            if (session) {
                user.value = session.user as User;
                isAuthenticated.value = true;
            } else {
                $reset();
            }
        });
    }

    async function login(email: string, password: string) {
        if (process.server) throw new Error('Login not available on server');

        const { $supabase } = useNuxtApp();
        const { data, error } = await $supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) throw error;

        user.value = data.user as User;
        isAuthenticated.value = true;
        await fetchSubscription();

        return data;
    }

    async function loginOAuth(provider: 'google' | 'github') {
        if (process.server) throw new Error('OAuth not available on server');

        const { $supabase } = useNuxtApp();
        const { data, error } = await $supabase.auth.signInWithOAuth({
            provider,
            options: {
                redirectTo: window.location.origin + '/auth/callback',
            },
        });

        if (error) throw error;
        return data;
    }

    async function signup(email: string, password: string) {
        if (process.server) throw new Error('Signup not available on server');

        const { $supabase } = useNuxtApp();
        const { data, error } = await $supabase.auth.signUp({
            email,
            password,
        });

        if (error) throw error;
        return data;
    }

    async function logout() {
        if (process.server) throw new Error('Logout not available on server');

        const { $supabase } = useNuxtApp();
        const { error } = await $supabase.auth.signOut();
        if (error) throw error;

        $reset();
    }

    // ============================================================================
    // SUBSCRIPTION ACTIONS
    // ============================================================================
    async function fetchSubscription() {
        if (process.server) return null;
        if (!user.value) return null;

        const { $supabase } = useNuxtApp();
        const { data, error } = await $supabase
            .from('subscriptions')
            .select('*')
            .eq('user_id', user.value.id)
            .single();

        if (error) {
            console.error('[UserStore] Subscription fetch error:', error);
            return null;
        }

        subscription.value = data;
        return data;
    }

    // ============================================================================
    // PLAN LIMITS ACTIONS
    // ============================================================================
    async function getPlanLimits(planName: string): Promise<PlanLimits | null> {
        if (process.server) return null;

        // Check cache first
        if (planLimitsCache.value.has(planName)) {
            return planLimitsCache.value.get(planName)!;
        }

        const { $supabase } = useNuxtApp();
        const { data, error } = await $supabase
            .from('plan_limits')
            .select('*')
            .eq('plan_name', planName)
            .single();

        if (error) throw error;

        planLimitsCache.value.set(planName, data);
        return data;
    }

    function invalidatePlanLimitsCache() {
        planLimitsCache.value.clear();
    }

    // ============================================================================
    // PERMISSION HELPERS
    // ============================================================================
    function hasWritePermissions(): boolean {
        if (!subscription.value) return false;
        return ['basic', 'pro'].includes(subscription.value.subscription_plan);
    }

    function isReadOnlyPlan(): boolean {
        if (!subscription.value) return true;
        return subscription.value.subscription_plan === 'free';
    }

    // ============================================================================
    // RESET
    // ============================================================================
    function $reset() {
        user.value = null;
        isAuthenticated.value = false;
        subscription.value = null;
        planLimitsCache.value.clear();
    }

    return {
        // State
        user,
        isAuthenticated,
        subscription,
        // Getters
        getUser,
        getIsAuthenticated,
        getSubscription,
        currentPlan,
        // Auth
        initializeAuth,
        login,
        loginOAuth,
        signup,
        logout,
        // Subscription
        fetchSubscription,
        // Plan Limits
        getPlanLimits,
        invalidatePlanLimitsCache,
        // Permissions
        hasWritePermissions,
        isReadOnlyPlan,
        // Reset
        $reset,
    };
});
```

---

## Workspace Context Store Template

```typescript
// stores/workspaceStore.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useUserStore } from '~/stores/userStore';

interface Workspace {
    id: string;
    name: string;
    description: string | null;
    slug: string;
    created_at: string;
}

interface Event {
    id: string;
    name: string;
    description: string | null;
    event_date: string;
    created_at: string;
    guests: { count: number }[];
}

interface ResourceUsage {
    events_count: number;
    guests_count: number;
    images_count: number;
    storage_used: number;
}

interface LimitInfo {
    allowed: boolean;
    current: number;
    limit: number;
}

export const useWorkspaceStore = defineStore('workspace', () => {
    // ============================================================================
    // STATE
    // ============================================================================
    const currentWorkspace = ref<Workspace | null>(null);
    const events = ref<Event[]>([]);
    const membersCount = ref(0);
    const resourceUsage = ref<ResourceUsage | null>(null);
    const eventLimit = ref<LimitInfo | null>(null);
    const imageLimit = ref<LimitInfo | null>(null);
    const isLoading = ref(false);
    const error = ref<string | null>(null);

    // Pagination
    const eventsPage = ref(1);
    const eventsPerPage = 20;
    const hasMoreEvents = ref(false);
    const isLoadingMore = ref(false);

    // ============================================================================
    // GETTERS
    // ============================================================================
    const workspaceId = computed(() => currentWorkspace.value?.id);
    const canCreateEvent = computed(() => eventLimit.value?.allowed ?? false);
    const canUploadImage = computed(() => imageLimit.value?.allowed ?? false);

    // ============================================================================
    // ACTIONS
    // ============================================================================
    async function loadWorkspace(workspaceId: string) {
        if (process.server) return;

        try {
            isLoading.value = true;
            error.value = null;

            const { $supabase } = useNuxtApp();
            const userStore = useUserStore();

            // Get plan limits first (needed for calculations)
            const planName = userStore.subscription?.subscription_plan || 'free';
            const limits = await userStore.getPlanLimits(planName);

            // Execute all queries in parallel
            const [workspaceResult, eventsResult, membersResult, usageResult] = await Promise.all([
                $supabase
                    .from('workspaces')
                    .select('id, name, description, slug, created_at')
                    .eq('id', workspaceId)
                    .single(),
                $supabase
                    .from('events')
                    .select('id, name, description, event_date, created_at, guests(count)')
                    .eq('workspace_id', workspaceId)
                    .order('created_at', { ascending: false })
                    .range(0, eventsPerPage - 1),
                $supabase
                    .from('workspace_users')
                    .select('*', { count: 'exact', head: true })
                    .eq('workspace_id', workspaceId),
                $supabase
                    .from('workspace_resource_usage')
                    .select('events_count, guests_count, images_count, storage_used')
                    .eq('workspace_id', workspaceId)
                    .single()
            ]);

            if (workspaceResult.error) throw workspaceResult.error;
            if (eventsResult.error) throw eventsResult.error;

            // Assign values
            currentWorkspace.value = workspaceResult.data;
            events.value = eventsResult.data || [];
            membersCount.value = membersResult.count || 0;
            resourceUsage.value = usageResult.data;
            hasMoreEvents.value = (eventsResult.data?.length || 0) === eventsPerPage;
            eventsPage.value = 1;

            // Calculate limits locally
            const usage = usageResult.data;
            eventLimit.value = {
                allowed: (usage?.events_count || 0) < (limits?.max_events_per_workspace || 0),
                current: usage?.events_count || 0,
                limit: limits?.max_events_per_workspace || 0
            };
            imageLimit.value = {
                allowed: (usage?.images_count || 0) < (limits?.max_images_per_event || 0),
                current: usage?.images_count || 0,
                limit: limits?.max_images_per_event || 0
            };

        } catch (err: any) {
            error.value = err.message;
            console.error('[WorkspaceStore] Load error:', err);
        } finally {
            isLoading.value = false;
        }
    }

    async function loadMoreEvents() {
        if (process.server) return;
        if (isLoadingMore.value || !hasMoreEvents.value || !currentWorkspace.value) return;

        try {
            isLoadingMore.value = true;
            const { $supabase } = useNuxtApp();

            const nextPage = eventsPage.value + 1;
            const start = (nextPage - 1) * eventsPerPage;
            const end = start + eventsPerPage - 1;

            const { data, error: err } = await $supabase
                .from('events')
                .select('id, name, description, event_date, created_at, guests(count)')
                .eq('workspace_id', currentWorkspace.value.id)
                .order('created_at', { ascending: false })
                .range(start, end);

            if (err) throw err;

            events.value = [...events.value, ...(data || [])];
            eventsPage.value = nextPage;
            hasMoreEvents.value = (data?.length || 0) === eventsPerPage;

        } catch (err: any) {
            console.error('[WorkspaceStore] Load more error:', err);
        } finally {
            isLoadingMore.value = false;
        }
    }

    async function refreshEventsAndUsage() {
        if (process.server || !currentWorkspace.value) return;

        const { $supabase } = useNuxtApp();
        const userStore = useUserStore();
        const planName = userStore.subscription?.subscription_plan || 'free';

        const [eventsResult, usageResult, limits] = await Promise.all([
            $supabase
                .from('events')
                .select('id, name, description, event_date, created_at, guests(count)')
                .eq('workspace_id', currentWorkspace.value.id)
                .order('created_at', { ascending: false })
                .range(0, eventsPerPage - 1),
            $supabase
                .from('workspace_resource_usage')
                .select('events_count, guests_count, images_count, storage_used')
                .eq('workspace_id', currentWorkspace.value.id)
                .single(),
            userStore.getPlanLimits(planName)
        ]);

        events.value = eventsResult.data || [];
        resourceUsage.value = usageResult.data;
        eventsPage.value = 1;
        hasMoreEvents.value = (eventsResult.data?.length || 0) === eventsPerPage;

        // Recalculate limits
        const usage = usageResult.data;
        eventLimit.value = {
            allowed: (usage?.events_count || 0) < (limits?.max_events_per_workspace || 0),
            current: usage?.events_count || 0,
            limit: limits?.max_events_per_workspace || 0
        };
        imageLimit.value = {
            allowed: (usage?.images_count || 0) < (limits?.max_images_per_event || 0),
            current: usage?.images_count || 0,
            limit: limits?.max_images_per_event || 0
        };
    }

    function $reset() {
        currentWorkspace.value = null;
        events.value = [];
        membersCount.value = 0;
        resourceUsage.value = null;
        eventLimit.value = null;
        imageLimit.value = null;
        eventsPage.value = 1;
        hasMoreEvents.value = false;
        isLoading.value = false;
        isLoadingMore.value = false;
        error.value = null;
    }

    return {
        // State
        currentWorkspace,
        events,
        membersCount,
        resourceUsage,
        eventLimit,
        imageLimit,
        isLoading,
        isLoadingMore,
        hasMoreEvents,
        error,
        // Getters
        workspaceId,
        canCreateEvent,
        canUploadImage,
        // Actions
        loadWorkspace,
        loadMoreEvents,
        refreshEventsAndUsage,
        $reset
    };
});
```

---

## Events Store Template

```typescript
// stores/eventsStore.ts
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useWorkspaceStore } from '~/stores/workspaceStore';
import { useUserStore } from '~/stores/userStore';

interface CreateEventInput {
    name: string;
    description?: string;
    event_date: string;
    location?: string;
}

interface UpdateEventInput {
    name?: string;
    description?: string;
    event_date?: string;
    location?: string;
}

interface Event {
    id: string;
    name: string;
    description: string | null;
    event_date: string;
    location: string | null;
    created_at: string;
    workspace_id: string;
}

export const useEventsStore = defineStore('events', () => {
    const isCreating = ref(false);
    const isUpdating = ref(false);
    const isDeleting = ref(false);

    async function createEvent(input: CreateEventInput): Promise<Event> {
        if (process.server) throw new Error('Not available on server');

        const workspaceStore = useWorkspaceStore();
        const userStore = useUserStore();
        const workspaceId = workspaceStore.currentWorkspace?.id;

        if (!workspaceId) throw new Error('No workspace selected');

        // Check limit
        const limit = workspaceStore.eventLimit;
        if (limit && !limit.allowed) {
            throw new Error(`Limite eventi raggiunto: ${limit.current}/${limit.limit}`);
        }

        isCreating.value = true;

        try {
            const { $supabase } = useNuxtApp();
            const { data, error } = await $supabase.functions.invoke('events', {
                body: { ...input, workspace_id: workspaceId }
            });

            if (error) throw error;
            if (data.error) throw new Error(data.error);

            // Refresh workspace events and usage
            await workspaceStore.refreshEventsAndUsage();

            return data.event;
        } finally {
            isCreating.value = false;
        }
    }

    async function updateEvent(eventId: string, input: UpdateEventInput): Promise<Event> {
        if (process.server) throw new Error('Not available on server');

        isUpdating.value = true;

        try {
            const { $supabase } = useNuxtApp();
            const { data, error } = await $supabase.functions.invoke('events', {
                body: { id: eventId, ...input },
                method: 'PATCH'
            });

            if (error) throw error;
            if (data.error) throw new Error(data.error);

            return data.event;
        } finally {
            isUpdating.value = false;
        }
    }

    async function deleteEvent(eventId: string): Promise<void> {
        if (process.server) throw new Error('Not available on server');

        const workspaceStore = useWorkspaceStore();

        isDeleting.value = true;

        try {
            const { $supabase } = useNuxtApp();
            const { error } = await $supabase.functions.invoke('events', {
                body: { id: eventId },
                method: 'DELETE'
            });

            if (error) throw error;

            // Refresh workspace
            await workspaceStore.refreshEventsAndUsage();
        } finally {
            isDeleting.value = false;
        }
    }

    return {
        isCreating,
        isUpdating,
        isDeleting,
        createEvent,
        updateEvent,
        deleteEvent,
    };
});
```

---

## Guests Store Template

```typescript
// stores/guestsStore.ts
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useUserStore } from '~/stores/userStore';

interface Guest {
    id: string;
    event_id: string;
    name: string;
    email: string | null;
    phone: string | null;
    rsvp_status: 'pending' | 'confirmed' | 'declined';
    dietary_requirements: string | null;
    plus_ones: number;
    created_at: string;
}

interface CreateGuestInput {
    event_id: string;
    name: string;
    email?: string;
    phone?: string;
    dietary_requirements?: string;
    plus_ones?: number;
}

export const useGuestsStore = defineStore('guests', () => {
    const guests = ref<Guest[]>([]);
    const isLoading = ref(false);
    const isCreating = ref(false);

    async function loadEventGuests(eventId: string) {
        if (process.server) return;

        isLoading.value = true;

        try {
            const { $supabase } = useNuxtApp();
            const { data, error } = await $supabase
                .from('guests')
                .select('*')
                .eq('event_id', eventId)
                .order('name', { ascending: true });

            if (error) throw error;
            guests.value = data || [];
        } finally {
            isLoading.value = false;
        }
    }

    async function createGuest(input: CreateGuestInput): Promise<Guest> {
        if (process.server) throw new Error('Not available on server');

        const userStore = useUserStore();

        // Check guest limit
        const limit = await userStore.checkGuestCreationLimit(input.event_id);
        if (!limit.allowed) {
            throw new Error(`Limite ospiti raggiunto: ${limit.current}/${limit.limit}`);
        }

        isCreating.value = true;

        try {
            const { $supabase } = useNuxtApp();
            const { data, error } = await $supabase.functions.invoke('guests', {
                body: input
            });

            if (error) throw error;
            if (data.error) throw new Error(data.error);

            // Add to local list
            guests.value.push(data.guest);

            return data.guest;
        } finally {
            isCreating.value = false;
        }
    }

    async function updateRsvpStatus(guestId: string, status: Guest['rsvp_status']) {
        if (process.server) return;

        const { $supabase } = useNuxtApp();
        const { error } = await $supabase
            .from('guests')
            .update({ rsvp_status: status, updated_at: new Date().toISOString() })
            .eq('id', guestId);

        if (error) throw error;

        // Update local
        const index = guests.value.findIndex(g => g.id === guestId);
        if (index !== -1) {
            guests.value[index].rsvp_status = status;
        }
    }

    function $reset() {
        guests.value = [];
        isLoading.value = false;
        isCreating.value = false;
    }

    return {
        guests,
        isLoading,
        isCreating,
        loadEventGuests,
        createGuest,
        updateRsvpStatus,
        $reset,
    };
});
```

---

## Billing Store Template

```typescript
// stores/billingStore.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useUserStore } from '~/stores/userStore';

interface Invoice {
    id: string;
    amount: number;
    currency: string;
    status: 'paid' | 'open' | 'void';
    invoice_url: string;
    created_at: string;
}

export const useBillingStore = defineStore('billing', () => {
    const invoices = ref<Invoice[]>([]);
    const isLoading = ref(false);
    const isUpgrading = ref(false);

    const userStore = useUserStore();

    const currentPlan = computed(() => userStore.subscription?.subscription_plan || 'free');
    const canUpgrade = computed(() => currentPlan.value !== 'pro');
    const canDowngrade = computed(() => currentPlan.value !== 'free');

    async function loadInvoices() {
        if (process.server) return;

        isLoading.value = true;

        try {
            const { $supabase } = useNuxtApp();
            const { data, error } = await $supabase.functions.invoke('billing/invoices', {
                method: 'GET'
            });

            if (error) throw error;
            invoices.value = data.invoices || [];
        } finally {
            isLoading.value = false;
        }
    }

    async function createCheckoutSession(priceId: string): Promise<string> {
        if (process.server) throw new Error('Not available on server');

        isUpgrading.value = true;

        try {
            const { $supabase } = useNuxtApp();
            const { data, error } = await $supabase.functions.invoke('create-checkout', {
                body: {
                    price_id: priceId,
                    success_url: window.location.origin + '/dashboard/billing?success=true',
                    cancel_url: window.location.origin + '/dashboard/billing?canceled=true',
                }
            });

            if (error) throw error;
            return data.checkout_url;
        } finally {
            isUpgrading.value = false;
        }
    }

    async function createPortalSession(): Promise<string> {
        if (process.server) throw new Error('Not available on server');

        const { $supabase } = useNuxtApp();
        const { data, error } = await $supabase.functions.invoke('customer-portal', {
            body: {
                return_url: window.location.origin + '/dashboard/billing',
            }
        });

        if (error) throw error;
        return data.portal_url;
    }

    function $reset() {
        invoices.value = [];
        isLoading.value = false;
        isUpgrading.value = false;
    }

    return {
        invoices,
        isLoading,
        isUpgrading,
        currentPlan,
        canUpgrade,
        canDowngrade,
        loadInvoices,
        createCheckoutSession,
        createPortalSession,
        $reset,
    };
});
```

---

## UI Store Template

```typescript
// stores/uiStore.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

interface EventFilters {
    search: string;
    dateRange: { start: string | null; end: string | null };
    sortBy: 'date' | 'name' | 'guests';
    sortOrder: 'asc' | 'desc';
}

interface Preferences {
    locale: string;
    theme: 'light' | 'dark' | 'system';
    sidebarCollapsed: boolean;
    dashboardLayout: 'grid' | 'list';
}

export const useUiStore = defineStore('ui', () => {
    // Event filters
    const eventFilters = ref<EventFilters>({
        search: '',
        dateRange: { start: null, end: null },
        sortBy: 'date',
        sortOrder: 'desc',
    });

    // User preferences
    const preferences = ref<Preferences>({
        locale: 'it',
        theme: 'system',
        sidebarCollapsed: false,
        dashboardLayout: 'grid',
    });

    // Modals
    const activeModal = ref<string | null>(null);

    // Getters
    const hasActiveFilters = computed(() => {
        return eventFilters.value.search !== '' ||
            eventFilters.value.dateRange.start !== null ||
            eventFilters.value.dateRange.end !== null;
    });

    // Actions
    function setEventFilter<K extends keyof EventFilters>(key: K, value: EventFilters[K]) {
        eventFilters.value[key] = value;
    }

    function clearEventFilters() {
        eventFilters.value = {
            search: '',
            dateRange: { start: null, end: null },
            sortBy: 'date',
            sortOrder: 'desc',
        };
    }

    function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
        preferences.value[key] = value;
    }

    function openModal(modalId: string) {
        activeModal.value = modalId;
    }

    function closeModal() {
        activeModal.value = null;
    }

    function $reset() {
        clearEventFilters();
        activeModal.value = null;
        // Keep preferences on reset
    }

    return {
        eventFilters,
        preferences,
        activeModal,
        hasActiveFilters,
        setEventFilter,
        clearEventFilters,
        setPreference,
        openModal,
        closeModal,
        $reset,
    };
}, {
    // Persist only preferences
    persist: {
        key: 'yoursaas-ui',
        storage: typeof window !== 'undefined' ? localStorage : undefined,
        pick: ['preferences'],
    },
});
```

---

## Key Patterns Summary

### State Declaration

```typescript
// Primitives
const count = ref(0);
const name = ref<string>('');

// Nullable objects
const user = ref<User | null>(null);

// Arrays
const items = ref<Item[]>([]);

// Complex objects
const filters = ref<FilterState>({ search: '', page: 1 });
```

### Computed Getters

```typescript
const isLoggedIn = computed(() => user.value !== null);
const totalCount = computed(() => items.value.length);
const filteredItems = computed(() =>
    items.value.filter(i => i.name.includes(filters.value.search))
);
```

### Action Return Pattern

```typescript
// Return data for component usage
async function createItem(input: Input): Promise<Item> {
    // ...create logic
    return data;
}

// Return void for side-effect only
async function deleteItem(id: string): Promise<void> {
    // ...delete logic
}
```
