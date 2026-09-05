# TypeScript Patterns for Pinia Stores

## Table of Contents
- [Interface Definitions](#interface-definitions)
- [Generic Store Patterns](#generic-store-patterns)
- [Type-Safe Actions](#type-safe-actions)
- [Discriminated Unions](#discriminated-unions)
- [Utility Types](#utility-types)
- [Type Guards](#type-guards)
- [Store Type Exports](#store-type-exports)

---

## Interface Definitions

### Entity Interfaces

```typescript
// types/entities.ts

// Base entity with common fields
interface BaseEntity {
    id: string;
    created_at: string;
    updated_at?: string;
}

// Soft-deletable entity
interface SoftDeletable {
    deleted_at: string | null;
}

// Workspace-scoped entity
interface WorkspaceScoped {
    workspace_id: string;
}

// User entity
export interface User {
    id: string;
    email: string;
    created_at: string;
    user_metadata?: Record<string, unknown>;
}

// Workspace entity
export interface Workspace extends BaseEntity, SoftDeletable {
    name: string;
    description: string | null;
    slug: string;
    created_by_id: string;
}

// Event entity (workspace-scoped)
export interface Event extends BaseEntity, WorkspaceScoped, SoftDeletable {
    name: string;
    description: string | null;
    event_date: string;
    location: string | null;
    status: EventStatus;
}

// Guest entity
export interface Guest extends BaseEntity, SoftDeletable {
    event_id: string;
    name: string;
    email: string | null;
    phone: string | null;
    rsvp_status: RsvpStatus;
    dietary_requirements: string | null;
    plus_ones: number;
}

// Enums as string literals
export type EventStatus = 'draft' | 'published' | 'cancelled' | 'completed';
export type RsvpStatus = 'pending' | 'confirmed' | 'declined' | 'maybe';
```

### Plan & Subscription Interfaces

```typescript
// types/billing.ts

export type PlanName = 'free' | 'basic' | 'pro';
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing';

export interface Subscription {
    id: string;
    user_id: string;
    subscription_plan: PlanName;
    status: SubscriptionStatus;
    current_period_start: string;
    current_period_end: string;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    cancel_at_period_end: boolean;
}

export interface PlanLimits {
    plan_name: PlanName;
    max_workspaces: number;
    max_events_per_workspace: number;
    max_guests_per_event: number;
    max_images_per_event: number;
    storage_limit_mb: number;
}

export interface ResourceUsage {
    workspace_id: string;
    events_count: number;
    guests_count: number;
    images_count: number;
    storage_used: number;
    api_calls_count: number;
    updated_at: string;
}
```

### Store State Interfaces

```typescript
// types/store.ts

export interface LimitInfo {
    allowed: boolean;
    current: number;
    limit: number;
}

export interface LoadingState {
    isLoading: boolean;
    isLoadingMore: boolean;
    isSaving: boolean;
    isDeleting: boolean;
}

export interface ErrorState {
    error: string | null;
    fieldErrors?: Record<string, string>;
}

export interface PaginationState {
    page: number;
    perPage: number;
    hasMore: boolean;
    total?: number;
}
```

---

## Generic Store Patterns

### Generic CRUD Store

```typescript
// stores/base/useCrudStore.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

interface CrudStoreOptions<T> {
    storeName: string;
    tableName: string;
    idField?: keyof T;
}

export function createCrudStore<T extends { id: string }>({
    storeName,
    tableName,
    idField = 'id' as keyof T,
}: CrudStoreOptions<T>) {
    return defineStore(storeName, () => {
        const items = ref<T[]>([]);
        const selectedItem = ref<T | null>(null);
        const isLoading = ref(false);
        const error = ref<string | null>(null);

        const itemsById = computed(() =>
            items.value.reduce<Record<string, T>>((acc, item) => {
                acc[item[idField] as string] = item;
                return acc;
            }, {})
        );

        async function fetchAll(filters?: Partial<T>) {
            if (process.server) return;

            isLoading.value = true;
            error.value = null;

            try {
                const { $supabase } = useNuxtApp();
                let query = $supabase.from(tableName).select('*');

                if (filters) {
                    Object.entries(filters).forEach(([key, value]) => {
                        if (value !== undefined) {
                            query = query.eq(key, value);
                        }
                    });
                }

                const { data, error: queryError } = await query;

                if (queryError) throw queryError;
                items.value = (data ?? []) as T[];
            } catch (e) {
                error.value = e instanceof Error ? e.message : 'Unknown error';
            } finally {
                isLoading.value = false;
            }
        }

        async function fetchById(id: string): Promise<T | null> {
            if (process.server) return null;

            const { $supabase } = useNuxtApp();
            const { data, error: queryError } = await $supabase
                .from(tableName)
                .select('*')
                .eq(idField as string, id)
                .single();

            if (queryError) throw queryError;
            return data as T;
        }

        async function create(input: Omit<T, 'id' | 'created_at'>): Promise<T> {
            if (process.server) throw new Error('Not available on server');

            const { $supabase } = useNuxtApp();
            const { data, error: queryError } = await $supabase
                .from(tableName)
                .insert(input)
                .select()
                .single();

            if (queryError) throw queryError;

            const newItem = data as T;
            items.value.unshift(newItem);
            return newItem;
        }

        async function update(id: string, updates: Partial<T>): Promise<T> {
            if (process.server) throw new Error('Not available on server');

            const { $supabase } = useNuxtApp();
            const { data, error: queryError } = await $supabase
                .from(tableName)
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq(idField as string, id)
                .select()
                .single();

            if (queryError) throw queryError;

            const updated = data as T;
            const index = items.value.findIndex(
                (item) => (item[idField] as string) === id
            );
            if (index !== -1) {
                items.value[index] = updated;
            }

            return updated;
        }

        async function remove(id: string): Promise<void> {
            if (process.server) throw new Error('Not available on server');

            const { $supabase } = useNuxtApp();
            const { error: queryError } = await $supabase
                .from(tableName)
                .delete()
                .eq(idField as string, id);

            if (queryError) throw queryError;

            items.value = items.value.filter(
                (item) => (item[idField] as string) !== id
            );
        }

        function $reset() {
            items.value = [];
            selectedItem.value = null;
            isLoading.value = false;
            error.value = null;
        }

        return {
            items,
            selectedItem,
            isLoading,
            error,
            itemsById,
            fetchAll,
            fetchById,
            create,
            update,
            remove,
            $reset,
        };
    });
}
```

### Usage

```typescript
// stores/guestsStore.ts
import { createCrudStore } from './base/useCrudStore';
import type { Guest } from '~/types/entities';

export const useGuestsStore = createCrudStore<Guest>({
    storeName: 'guests',
    tableName: 'guests',
});
```

---

## Type-Safe Actions

### Action Input Types

```typescript
// types/inputs.ts

// Create inputs (omit auto-generated fields)
export type CreateWorkspaceInput = Omit<Workspace,
    | 'id'
    | 'created_at'
    | 'updated_at'
    | 'deleted_at'
    | 'created_by_id'  // Set by backend
>;

export type CreateEventInput = Omit<Event,
    | 'id'
    | 'created_at'
    | 'updated_at'
    | 'deleted_at'
    | 'workspace_id'  // Set from context
>;

// Update inputs (all optional except id)
export type UpdateEventInput = Partial<Omit<Event,
    | 'id'
    | 'created_at'
    | 'workspace_id'
>> & { id: string };

// Strict partial (at least one field required)
export type StrictUpdateEventInput = { id: string } & AtLeastOne<
    Omit<Event, 'id' | 'created_at' | 'workspace_id'>
>;

// Helper type for "at least one"
type AtLeastOne<T, U = { [K in keyof T]: Pick<T, K> }> = Partial<T> &
    U[keyof U];
```

### Typed Action Results

```typescript
// types/results.ts

// Generic result type
export type Result<T, E = string> =
    | { success: true; data: T }
    | { success: false; error: E };

// Limit check result
export interface LimitCheckResult {
    allowed: boolean;
    current: number;
    limit: number;
    resource: string;
}

// Validation result
export interface ValidationResult {
    valid: boolean;
    errors: Record<string, string>;
}

// Action result with metadata
export interface ActionResult<T> {
    success: boolean;
    data?: T;
    error?: string;
    metadata?: {
        took: number;
        cached: boolean;
    };
}
```

### Typed Store Actions

```typescript
// stores/eventsStore.ts
import type {
    Event,
    CreateEventInput,
    UpdateEventInput,
    ActionResult,
} from '~/types';

export const useEventsStore = defineStore('events', () => {
    const events = ref<Event[]>([]);

    async function createEvent(
        input: CreateEventInput
    ): Promise<ActionResult<Event>> {
        if (process.server) {
            return { success: false, error: 'Not available on server' };
        }

        const startTime = Date.now();

        try {
            const { $supabase } = useNuxtApp();
            const { data, error } = await $supabase.functions.invoke('events', {
                body: input,
            });

            if (error) throw error;
            if (data.error) throw new Error(data.error);

            const event: Event = data.event;
            events.value.unshift(event);

            return {
                success: true,
                data: event,
                metadata: {
                    took: Date.now() - startTime,
                    cached: false,
                },
            };
        } catch (e) {
            return {
                success: false,
                error: e instanceof Error ? e.message : 'Unknown error',
            };
        }
    }

    async function updateEvent(
        input: UpdateEventInput
    ): Promise<ActionResult<Event>> {
        // Implementation with type safety
    }

    return { events, createEvent, updateEvent };
});
```

---

## Discriminated Unions

### State Machines with Types

```typescript
// types/states.ts

// Loading state machine
export type AsyncState<T> =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'success'; data: T }
    | { status: 'error'; error: string };

// Usage in store
export const useDataStore = defineStore('data', () => {
    const state = ref<AsyncState<Event[]>>({ status: 'idle' });

    async function fetchEvents() {
        if (process.server) return;

        state.value = { status: 'loading' };

        try {
            const { $supabase } = useNuxtApp();
            const { data, error } = await $supabase.from('events').select('*');

            if (error) throw error;

            state.value = { status: 'success', data: data as Event[] };
        } catch (e) {
            state.value = {
                status: 'error',
                error: e instanceof Error ? e.message : 'Unknown error',
            };
        }
    }

    // Type-safe getters
    const isLoading = computed(() => state.value.status === 'loading');
    const events = computed(() =>
        state.value.status === 'success' ? state.value.data : []
    );
    const error = computed(() =>
        state.value.status === 'error' ? state.value.error : null
    );

    return { state, fetchEvents, isLoading, events, error };
});
```

### Multi-Step Process States

```typescript
// types/checkout.ts

type CheckoutStep =
    | { step: 'cart'; items: CartItem[] }
    | { step: 'shipping'; items: CartItem[]; address: Address }
    | { step: 'payment'; items: CartItem[]; address: Address; paymentMethod: PaymentMethod }
    | { step: 'confirmation'; orderId: string }
    | { step: 'error'; error: string; previousStep: CheckoutStep };

// Store with checkout flow
export const useCheckoutStore = defineStore('checkout', () => {
    const state = ref<CheckoutStep>({ step: 'cart', items: [] });

    function goToShipping(address: Address) {
        if (state.value.step !== 'cart') return;

        state.value = {
            step: 'shipping',
            items: state.value.items,
            address,
        };
    }

    function goToPayment(paymentMethod: PaymentMethod) {
        if (state.value.step !== 'shipping') return;

        state.value = {
            step: 'payment',
            items: state.value.items,
            address: state.value.address,
            paymentMethod,
        };
    }

    // TypeScript ensures state transitions are valid
    return { state, goToShipping, goToPayment };
});
```

---

## Utility Types

### Store Helper Types

```typescript
// types/utils.ts

// Make all properties nullable
export type Nullable<T> = { [K in keyof T]: T[K] | null };

// Deep partial
export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Pick only ref values
export type RefValues<T> = {
    [K in keyof T]: T[K] extends Ref<infer V> ? V : never;
};

// Extract action return types
export type ActionReturnType<T extends (...args: any) => any> =
    T extends (...args: any) => Promise<infer R> ? R : ReturnType<T>;

// Store state snapshot
export type StoreSnapshot<T> = {
    [K in keyof T]: T[K] extends Ref<infer V>
        ? V
        : T[K] extends ComputedRef<infer V>
        ? V
        : T[K];
};
```

### Database Types Integration

```typescript
// types/database.ts
// Auto-generated from Supabase

export interface Database {
    base: {
        Tables: {
            workspaces: {
                Row: Workspace;
                Insert: CreateWorkspaceInput;
                Update: Partial<Workspace>;
            };
            events: {
                Row: Event;
                Insert: CreateEventInput & { workspace_id: string };
                Update: Partial<Event>;
            };
            guests: {
                Row: Guest;
                Insert: Omit<Guest, 'id' | 'created_at'>;
                Update: Partial<Guest>;
            };
        };
    };
}

// Type helper for table rows
export type TableRow<T extends keyof Database['base']['Tables']> =
    Database['base']['Tables'][T]['Row'];

// Type helper for inserts
export type TableInsert<T extends keyof Database['base']['Tables']> =
    Database['base']['Tables'][T]['Insert'];
```

---

## Type Guards

### Custom Type Guards

```typescript
// utils/typeGuards.ts

import type { Event, Guest, Workspace, PlanName } from '~/types';

// Entity type guards
export function isEvent(obj: unknown): obj is Event {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        'id' in obj &&
        'workspace_id' in obj &&
        'event_date' in obj
    );
}

export function isGuest(obj: unknown): obj is Guest {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        'id' in obj &&
        'event_id' in obj &&
        'rsvp_status' in obj
    );
}

// Plan guards
export function isPlanName(value: unknown): value is PlanName {
    return (
        typeof value === 'string' &&
        ['free', 'basic', 'pro'].includes(value)
    );
}

// Async state guards
export function isSuccessState<T>(
    state: AsyncState<T>
): state is { status: 'success'; data: T } {
    return state.status === 'success';
}

export function isErrorState<T>(
    state: AsyncState<T>
): state is { status: 'error'; error: string } {
    return state.status === 'error';
}
```

### Using Guards in Stores

```typescript
// stores/eventsStore.ts
import { isEvent } from '~/utils/typeGuards';

async function processEventData(data: unknown): Event[] {
    if (!Array.isArray(data)) return [];

    return data.filter(isEvent);  // Type-safe filtering
}
```

---

## Store Type Exports

### Exporting Store Types

```typescript
// stores/userStore.ts
import { defineStore } from 'pinia';

export const useUserStore = defineStore('user', () => {
    // ... implementation
});

// Export store type for use in composables
export type UserStore = ReturnType<typeof useUserStore>;

// Export store state type
export type UserStoreState = {
    user: User | null;
    isAuthenticated: boolean;
    subscription: Subscription | null;
};

// Export specific action types
export type LoginFn = UserStore['login'];
export type LogoutFn = UserStore['logout'];
```

### Using Store Types in Composables

```typescript
// composables/useAuth.ts
import type { UserStore, LoginFn } from '~/stores/userStore';

export function useAuth() {
    const userStore = useUserStore() as UserStore;

    const login: LoginFn = async (email, password) => {
        return await userStore.login(email, password);
    };

    // Type-safe store access
    const isAuthenticated = computed(() => userStore.isAuthenticated);

    return {
        login,
        isAuthenticated,
    };
}
```

### Store Return Type Inference

```typescript
// Type for all exported store members
type WorkspaceStoreType = ReturnType<typeof useWorkspaceStore>;

// Type for just the state properties
type WorkspaceState = Pick<
    WorkspaceStoreType,
    'currentWorkspace' | 'events' | 'isLoading' | 'error'
>;

// Type for just the actions
type WorkspaceActions = Pick<
    WorkspaceStoreType,
    'loadWorkspace' | 'refreshEventsAndUsage' | '$reset'
>;

// Type for just the getters
type WorkspaceGetters = Pick<
    WorkspaceStoreType,
    'workspaceId' | 'canCreateEvent'
>;
```

---

## Quick Reference

### Common Type Patterns

```typescript
// Nullable ref
const user = ref<User | null>(null);

// Array with type
const events = ref<Event[]>([]);

// Record/Map
const cache = ref<Record<string, Data>>({});

// Computed with type
const count = computed<number>(() => items.value.length);

// Async function return
async function getData(): Promise<Data | null> { }

// Action with typed input
async function create(input: CreateInput): Promise<Entity> { }
```

### Type Import Pattern

```typescript
// types/index.ts - Barrel export
export type { User, Workspace, Event, Guest } from './entities';
export type { Subscription, PlanLimits, PlanName } from './billing';
export type { CreateEventInput, UpdateEventInput } from './inputs';
export type { ActionResult, LimitCheckResult } from './results';

// In store
import type {
    Event,
    CreateEventInput,
    ActionResult,
} from '~/types';
```

### Generic Store Pattern Summary

```typescript
// 1. Define entity type
interface Entity extends BaseEntity { name: string; }

// 2. Define input types
type CreateInput = Omit<Entity, 'id' | 'created_at'>;
type UpdateInput = Partial<CreateInput> & { id: string };

// 3. Define result types
type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

// 4. Use in store with full type safety
const store = defineStore('entity', () => {
    const items = ref<Entity[]>([]);

    async function create(input: CreateInput): Promise<ActionResult<Entity>> {
        // Fully typed implementation
    }

    return { items, create };
});
```
