# Testing Patterns for Pinia Stores

## Table of Contents
- [Setup](#setup)
- [Unit Testing Stores](#unit-testing-stores)
- [Mocking Supabase](#mocking-supabase)
- [Testing Actions](#testing-actions)
- [Testing Getters](#testing-getters)
- [Integration Testing](#integration-testing)
- [Common Test Scenarios](#common-test-scenarios)

---

## Setup

### Dependencies

```bash
pnpm add -D vitest @vue/test-utils @pinia/testing happy-dom
```

### Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
    plugins: [vue()],
    test: {
        environment: 'happy-dom',
        globals: true,
        setupFiles: ['./tests/setup.ts'],
    },
    resolve: {
        alias: {
            '~': resolve(__dirname, './app'),
            '@': resolve(__dirname, './app'),
        },
    },
});
```

### Test Setup File

```typescript
// tests/setup.ts
import { vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// Mock process.server for all tests
vi.stubGlobal('process', { ...process, server: false });

// Mock useNuxtApp
vi.mock('#app', () => ({
    useNuxtApp: () => ({
        $supabase: mockSupabaseClient(),
    }),
}));

// Create fresh Pinia before each test
beforeEach(() => {
    setActivePinia(createPinia());
});

// Mock Supabase client factory
function mockSupabaseClient() {
    return {
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            delete: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            range: vi.fn().mockReturnThis(),
        })),
        functions: {
            invoke: vi.fn(),
        },
        auth: {
            getSession: vi.fn(),
            signInWithPassword: vi.fn(),
            signOut: vi.fn(),
            refreshSession: vi.fn(),
            onAuthStateChange: vi.fn(),
        },
    };
}

export { mockSupabaseClient };
```

---

## Unit Testing Stores

### Basic Store Test Structure

```typescript
// tests/stores/userStore.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useUserStore } from '~/stores/userStore';

describe('userStore', () => {
    let store: ReturnType<typeof useUserStore>;

    beforeEach(() => {
        setActivePinia(createPinia());
        store = useUserStore();
    });

    describe('initial state', () => {
        it('should have null user initially', () => {
            expect(store.user).toBeNull();
        });

        it('should not be authenticated initially', () => {
            expect(store.isAuthenticated).toBe(false);
        });

        it('should have null subscription initially', () => {
            expect(store.subscription).toBeNull();
        });
    });
});
```

### Using @pinia/testing

```typescript
import { createTestingPinia } from '@pinia/testing';
import { mount } from '@vue/test-utils';
import { useUserStore } from '~/stores/userStore';
import MyComponent from '~/components/MyComponent.vue';

describe('Component with Store', () => {
    it('should render with mocked store state', () => {
        const wrapper = mount(MyComponent, {
            global: {
                plugins: [
                    createTestingPinia({
                        initialState: {
                            user: {
                                user: { id: '123', email: 'test@test.com' },
                                isAuthenticated: true,
                                subscription: { subscription_plan: 'pro' },
                            },
                        },
                        stubActions: false,  // Run real actions
                    }),
                ],
            },
        });

        const store = useUserStore();
        expect(store.isAuthenticated).toBe(true);
    });
});
```

---

## Mocking Supabase

### Complete Supabase Mock

```typescript
// tests/mocks/supabase.ts
import { vi } from 'vitest';

export function createMockSupabase(overrides = {}) {
    const mockFrom = vi.fn((table: string) => {
        const chain = {
            select: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            delete: vi.fn().mockReturnThis(),
            upsert: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            neq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            range: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
        return chain;
    });

    return {
        from: mockFrom,
        functions: {
            invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
        },
        auth: {
            getSession: vi.fn().mockResolvedValue({
                data: { session: null },
                error: null,
            }),
            signInWithPassword: vi.fn().mockResolvedValue({
                data: { user: null, session: null },
                error: null,
            }),
            signUp: vi.fn().mockResolvedValue({
                data: { user: null, session: null },
                error: null,
            }),
            signOut: vi.fn().mockResolvedValue({ error: null }),
            refreshSession: vi.fn().mockResolvedValue({
                data: { session: null },
                error: null,
            }),
            onAuthStateChange: vi.fn().mockReturnValue({
                data: { subscription: { unsubscribe: vi.fn() } },
            }),
        },
        ...overrides,
    };
}
```

### Mocking Query Responses

```typescript
// tests/stores/workspaceStore.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useWorkspaceStore } from '~/stores/workspaceStore';
import { useUserStore } from '~/stores/userStore';

const mockWorkspace = {
    id: 'ws-123',
    name: 'Test Workspace',
    slug: 'test-workspace',
    created_at: '2024-01-01T00:00:00Z',
};

const mockEvents = [
    { id: 'ev-1', name: 'Event 1', guests: [{ count: 5 }] },
    { id: 'ev-2', name: 'Event 2', guests: [{ count: 10 }] },
];

const mockUsage = {
    events_count: 2,
    guests_count: 15,
    images_count: 5,
    storage_used: 100,
};

describe('workspaceStore', () => {
    let store: ReturnType<typeof useWorkspaceStore>;
    let mockSupabase: any;

    beforeEach(() => {
        setActivePinia(createPinia());

        // Setup user store with subscription
        const userStore = useUserStore();
        userStore.$patch({
            subscription: { subscription_plan: 'basic' },
        });

        // Mock getPlanLimits
        vi.spyOn(userStore, 'getPlanLimits').mockResolvedValue({
            plan_name: 'basic',
            max_events_per_workspace: 10,
            max_images_per_event: 50,
        });

        // Setup mock responses
        mockSupabase = {
            from: vi.fn().mockImplementation((table) => {
                const chain = createMockChain();

                if (table === 'workspaces') {
                    chain.single.mockResolvedValue({
                        data: mockWorkspace,
                        error: null,
                    });
                } else if (table === 'events') {
                    chain.range.mockReturnValue({
                        ...chain,
                        then: (cb) => cb({ data: mockEvents, error: null }),
                    });
                } else if (table === 'workspace_users') {
                    chain.eq.mockReturnValue({
                        ...chain,
                        count: 5,
                        error: null,
                    });
                } else if (table === 'workspace_resource_usage') {
                    chain.single.mockResolvedValue({
                        data: mockUsage,
                        error: null,
                    });
                }

                return chain;
            }),
        };

        vi.mock('#app', () => ({
            useNuxtApp: () => ({ $supabase: mockSupabase }),
        }));

        store = useWorkspaceStore();
    });

    describe('loadWorkspace', () => {
        it('should load workspace data', async () => {
            await store.loadWorkspace('ws-123');

            expect(store.currentWorkspace).toEqual(mockWorkspace);
            expect(store.events).toHaveLength(2);
            expect(store.resourceUsage).toEqual(mockUsage);
        });

        it('should calculate event limits correctly', async () => {
            await store.loadWorkspace('ws-123');

            expect(store.eventLimit).toEqual({
                allowed: true,  // 2 < 10
                current: 2,
                limit: 10,
            });
        });
    });
});

function createMockChain() {
    const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    return chain;
}
```

---

## Testing Actions

### Auth Actions

```typescript
describe('userStore auth actions', () => {
    let store: ReturnType<typeof useUserStore>;
    let mockAuth: any;

    beforeEach(() => {
        setActivePinia(createPinia());
        store = useUserStore();

        mockAuth = {
            signInWithPassword: vi.fn(),
            signOut: vi.fn(),
            getSession: vi.fn(),
        };

        vi.mock('#app', () => ({
            useNuxtApp: () => ({
                $supabase: { auth: mockAuth },
            }),
        }));
    });

    describe('login', () => {
        it('should login successfully', async () => {
            const mockUser = { id: '123', email: 'test@test.com' };
            mockAuth.signInWithPassword.mockResolvedValue({
                data: { user: mockUser, session: { user: mockUser } },
                error: null,
            });

            const result = await store.login('test@test.com', 'password');

            expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({
                email: 'test@test.com',
                password: 'password',
            });
            expect(store.user).toEqual(mockUser);
            expect(store.isAuthenticated).toBe(true);
        });

        it('should throw on login error', async () => {
            mockAuth.signInWithPassword.mockResolvedValue({
                data: { user: null },
                error: { message: 'Invalid credentials' },
            });

            await expect(store.login('bad@test.com', 'wrong'))
                .rejects.toThrow();
        });
    });

    describe('logout', () => {
        it('should reset state on logout', async () => {
            // Setup logged in state
            store.$patch({
                user: { id: '123', email: 'test@test.com' },
                isAuthenticated: true,
            });

            mockAuth.signOut.mockResolvedValue({ error: null });

            await store.logout();

            expect(store.user).toBeNull();
            expect(store.isAuthenticated).toBe(false);
        });
    });
});
```

### CRUD Actions

```typescript
describe('eventsStore actions', () => {
    let store: ReturnType<typeof useEventsStore>;

    beforeEach(() => {
        setActivePinia(createPinia());

        // Setup workspace context
        const workspaceStore = useWorkspaceStore();
        workspaceStore.$patch({
            currentWorkspace: { id: 'ws-123', name: 'Test' },
            eventLimit: { allowed: true, current: 5, limit: 10 },
        });

        store = useEventsStore();
    });

    describe('createEvent', () => {
        it('should create event and refresh workspace', async () => {
            const mockInvoke = vi.fn().mockResolvedValue({
                data: { event: { id: 'new-1', name: 'New Event' } },
                error: null,
            });

            vi.mock('#app', () => ({
                useNuxtApp: () => ({
                    $supabase: { functions: { invoke: mockInvoke } },
                }),
            }));

            const workspaceStore = useWorkspaceStore();
            const refreshSpy = vi.spyOn(workspaceStore, 'refreshEventsAndUsage')
                .mockResolvedValue();

            const result = await store.createEvent({
                name: 'New Event',
                description: 'Test',
            });

            expect(mockInvoke).toHaveBeenCalledWith('events', {
                body: expect.objectContaining({ name: 'New Event' }),
            });
            expect(refreshSpy).toHaveBeenCalled();
            expect(result.name).toBe('New Event');
        });

        it('should throw when limit reached', async () => {
            const workspaceStore = useWorkspaceStore();
            workspaceStore.$patch({
                eventLimit: { allowed: false, current: 10, limit: 10 },
            });

            await expect(store.createEvent({ name: 'Event' }))
                .rejects.toThrow(/limite/i);
        });
    });
});
```

---

## Testing Getters

### Computed Properties

```typescript
describe('workspaceStore getters', () => {
    let store: ReturnType<typeof useWorkspaceStore>;

    beforeEach(() => {
        setActivePinia(createPinia());
        store = useWorkspaceStore();
    });

    describe('canCreateEvent', () => {
        it('should return true when under limit', () => {
            store.$patch({
                eventLimit: { allowed: true, current: 5, limit: 10 },
            });

            expect(store.canCreateEvent).toBe(true);
        });

        it('should return false when at limit', () => {
            store.$patch({
                eventLimit: { allowed: false, current: 10, limit: 10 },
            });

            expect(store.canCreateEvent).toBe(false);
        });

        it('should return false when eventLimit is null', () => {
            store.$patch({ eventLimit: null });

            expect(store.canCreateEvent).toBe(false);
        });
    });

    describe('workspaceId', () => {
        it('should return id when workspace is set', () => {
            store.$patch({
                currentWorkspace: { id: 'ws-123', name: 'Test' },
            });

            expect(store.workspaceId).toBe('ws-123');
        });

        it('should return null when no workspace', () => {
            expect(store.workspaceId).toBeNull();
        });
    });
});
```

---

## Integration Testing

### Store Composition

```typescript
describe('Store Composition Integration', () => {
    it('should coordinate between stores correctly', async () => {
        setActivePinia(createPinia());

        const userStore = useUserStore();
        const workspaceStore = useWorkspaceStore();
        const eventsStore = useEventsStore();

        // Setup user
        userStore.$patch({
            user: { id: 'user-1', email: 'test@test.com' },
            isAuthenticated: true,
            subscription: { subscription_plan: 'basic' },
        });

        // Mock getPlanLimits
        vi.spyOn(userStore, 'getPlanLimits').mockResolvedValue({
            max_events_per_workspace: 10,
        });

        // Setup workspace
        workspaceStore.$patch({
            currentWorkspace: { id: 'ws-1', name: 'Test' },
            eventLimit: { allowed: true, current: 5, limit: 10 },
        });

        // Verify events store can access workspace context
        expect(workspaceStore.currentWorkspace?.id).toBe('ws-1');
        expect(workspaceStore.eventLimit?.allowed).toBe(true);
    });
});
```

---

## Common Test Scenarios

### Testing $reset

```typescript
describe('$reset', () => {
    it('should reset all state to initial values', () => {
        setActivePinia(createPinia());
        const store = useWorkspaceStore();

        // Set some state
        store.$patch({
            currentWorkspace: { id: 'ws-1', name: 'Test' },
            events: [{ id: 'ev-1' }],
            isLoading: true,
            error: 'Some error',
        });

        // Reset
        store.$reset();

        // Verify
        expect(store.currentWorkspace).toBeNull();
        expect(store.events).toEqual([]);
        expect(store.isLoading).toBe(false);
        expect(store.error).toBeNull();
    });
});
```

### Testing Error States

```typescript
describe('Error Handling', () => {
    it('should set error state on failure', async () => {
        setActivePinia(createPinia());
        const store = useWorkspaceStore();

        vi.mock('#app', () => ({
            useNuxtApp: () => ({
                $supabase: {
                    from: () => ({
                        select: () => ({
                            eq: () => ({
                                single: () => Promise.resolve({
                                    data: null,
                                    error: { message: 'Not found' },
                                }),
                            }),
                        }),
                    }),
                },
            }),
        }));

        await store.loadWorkspace('invalid-id');

        expect(store.error).toBe('Not found');
        expect(store.isLoading).toBe(false);
    });
});
```

### Testing Loading States

```typescript
describe('Loading States', () => {
    it('should track loading state during async operations', async () => {
        setActivePinia(createPinia());
        const store = useWorkspaceStore();

        // Capture loading state during operation
        let loadingDuringFetch = false;

        const originalLoad = store.loadWorkspace;
        store.loadWorkspace = async (id: string) => {
            loadingDuringFetch = store.isLoading;
            await originalLoad(id);
        };

        // Start loading
        const loadPromise = store.loadWorkspace('ws-1');

        // Check loading state
        expect(store.isLoading).toBe(true);

        await loadPromise;

        // After loading
        expect(store.isLoading).toBe(false);
    });
});
```

---

## Quick Reference

### Test File Structure

```
tests/
├── setup.ts               # Global test setup
├── mocks/
│   └── supabase.ts        # Supabase mock factory
└── stores/
    ├── userStore.test.ts
    ├── workspaceStore.test.ts
    └── eventsStore.test.ts
```

### Common Assertions

```typescript
// State assertions
expect(store.user).toBeNull();
expect(store.isAuthenticated).toBe(true);
expect(store.events).toHaveLength(5);
expect(store.events).toContainEqual(expect.objectContaining({ id: 'ev-1' }));

// Action assertions
expect(mockFn).toHaveBeenCalledWith(expectedArgs);
expect(mockFn).toHaveBeenCalledTimes(1);
await expect(store.action()).rejects.toThrow();

// Getter assertions
expect(store.computedValue).toBe(expectedValue);
```

### Run Tests

```bash
# Run all tests
pnpm test

# Run specific store tests
pnpm test stores/userStore

# Watch mode
pnpm test --watch

# Coverage
pnpm test --coverage
```
