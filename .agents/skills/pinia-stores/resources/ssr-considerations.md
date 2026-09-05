# SSR Considerations for Pinia Stores

## Table of Contents
- [Overview](#overview)
- [Server Guard Pattern](#server-guard-pattern)
- [Hydration Safety](#hydration-safety)
- [Store Initialization](#store-initialization)
- [Client-Only Operations](#client-only-operations)
- [Common Pitfalls](#common-pitfalls)

---

## Overview

### Nuxt SSR + Pinia Architecture

```
Server Render
├─ Pinia stores initialized (empty/default state)
├─ Pages/components render
├─ HTML sent to client
└─ Stores serialized in payload

Client Hydration
├─ Vue hydrates existing HTML
├─ Pinia restores state from payload
├─ Client-only code runs (onMounted, plugins)
└─ Auth/Supabase initialized
```

### Key Principle

**Never access browser APIs (localStorage, Supabase, window) during SSR.**
All async operations that require the browser must be guarded.

---

## Server Guard Pattern

### The Essential Guard

```typescript
async function fetchData() {
    if (process.server) return;  // CRITICAL: Always first line!

    // Safe to access browser APIs here
    const { $supabase } = useNuxtApp();
    const { data } = await $supabase.from('table').select('*');
}
```

### Why It's Necessary

1. **Supabase client** - Only available client-side
2. **localStorage** - Not available on server
3. **window/document** - Browser-only globals
4. **Auth session** - Stored in browser

### Guard Variations

```typescript
// For actions that return data
async function getData(): Promise<Data | null> {
    if (process.server) return null;  // Return appropriate default
    // ... fetch logic
    return data;
}

// For actions that return objects
async function checkLimit(): Promise<LimitResult> {
    if (process.server) return { allowed: false, current: 0, limit: 0 };
    // ... check logic
    return result;
}

// For void actions
async function syncData(): Promise<void> {
    if (process.server) return;  // Just return
    // ... sync logic
}

// For actions that throw
async function login(email: string, password: string) {
    if (process.server) throw new Error('Login not available on server');
    // ... login logic
}
```

---

## Hydration Safety

### State Serialization

Pinia automatically serializes store state during SSR. Be aware of:

```typescript
// SAFE - Serializable types
const count = ref(0);
const name = ref('');
const items = ref<Item[]>([]);
const user = ref<User | null>(null);

// UNSAFE - Non-serializable (will cause hydration issues)
const date = ref(new Date());  // Convert to ISO string
const map = ref(new Map());    // Use plain object instead
const set = ref(new Set());    // Use array instead
const func = ref(() => {});    // Don't store functions
```

### Safe Date Handling

```typescript
// Store dates as ISO strings
const createdAt = ref<string | null>(null);

// Parse when needed
const createdDate = computed(() =>
    createdAt.value ? new Date(createdAt.value) : null
);

// Set from Date
function setCreatedAt(date: Date) {
    createdAt.value = date.toISOString();
}
```

### Avoid Hydration Mismatch

```typescript
// WRONG - Different values on server vs client
const timestamp = ref(Date.now());  // Will differ!
const random = ref(Math.random()); // Will differ!

// CORRECT - Set on client only
const timestamp = ref<number | null>(null);

onMounted(() => {
    timestamp.value = Date.now();  // Only on client
});
```

---

## Store Initialization

### Initialization Pattern

```typescript
export const useUserStore = defineStore('user', () => {
    const user = ref<User | null>(null);
    const isInitialized = ref(false);

    async function initializeAuth() {
        if (process.server) return;  // Guard
        if (isInitialized.value) return;  // Prevent double init

        const { $supabase } = useNuxtApp();
        const { data: { session } } = await $supabase.auth.getSession();

        if (session) {
            user.value = session.user;
        }

        isInitialized.value = true;

        // Set up listeners
        $supabase.auth.onAuthStateChange((event, session) => {
            user.value = session?.user ?? null;
        });
    }

    return { user, isInitialized, initializeAuth };
});
```

### Plugin Initialization

```typescript
// plugins/auth.client.ts
export default defineNuxtPlugin(async () => {
    const userStore = useUserStore();
    await userStore.initializeAuth();
});
```

### Component Initialization

```typescript
<script setup lang="ts">
const workspaceStore = useWorkspaceStore();
const route = useRoute();

// Use onMounted for client-only initialization
onMounted(async () => {
    const workspaceId = route.params.id as string;
    await workspaceStore.loadWorkspace(workspaceId);
});
</script>
```

---

## Client-Only Operations

### Pattern: Actions vs Computed

```typescript
export const useWorkspaceStore = defineStore('workspace', () => {
    const events = ref<Event[]>([]);

    // SAFE - Computed runs on both server and client
    const totalEvents = computed(() => events.value.length);
    const upcomingEvents = computed(() =>
        events.value.filter(e => new Date(e.date) > new Date())
    );

    // SAFE - Actions are guarded
    async function loadEvents() {
        if (process.server) return;  // Guard
        const { $supabase } = useNuxtApp();
        const { data } = await $supabase.from('events').select('*');
        events.value = data ?? [];
    }

    return { events, totalEvents, upcomingEvents, loadEvents };
});
```

### Using onMounted in Stores

```typescript
// DON'T use onMounted in stores - it won't work as expected
export const useMyStore = defineStore('my', () => {
    // WRONG
    onMounted(() => {
        // This won't run during store creation
    });
});

// DO use initialization actions called from components/plugins
export const useMyStore = defineStore('my', () => {
    async function init() {
        if (process.server) return;
        // Initialize here
    }

    return { init };
});
```

---

## Common Pitfalls

### 1. Accessing $supabase Without Guard

```typescript
// WRONG - Will error on server
async function getData() {
    const { $supabase } = useNuxtApp();  // Error on SSR!
    const { data } = await $supabase.from('table').select('*');
}

// CORRECT
async function getData() {
    if (process.server) return;
    const { $supabase } = useNuxtApp();
    const { data } = await $supabase.from('table').select('*');
}
```

### 2. State Mutation During SSR

```typescript
// WRONG - Mutating state during render
const count = computed(() => {
    someRef.value++;  // Side effect in computed!
    return someRef.value;
});

// CORRECT - Pure computed
const count = computed(() => items.value.length);
```

### 3. localStorage Access

```typescript
// WRONG - localStorage not available on server
const theme = ref(localStorage.getItem('theme'));

// CORRECT - Use onMounted or guard
const theme = ref<string | null>(null);

// In plugin or component
onMounted(() => {
    theme.value = localStorage.getItem('theme');
});
```

### 4. window/document Access

```typescript
// WRONG
const width = ref(window.innerWidth);

// CORRECT
const width = ref<number | null>(null);

onMounted(() => {
    width.value = window.innerWidth;

    window.addEventListener('resize', () => {
        width.value = window.innerWidth;
    });
});
```

### 5. Non-Serializable State

```typescript
// WRONG - Map/Set cause hydration issues
const cache = ref(new Map<string, Data>());

// CORRECT - Use plain object
const cache = ref<Record<string, Data>>({});

// Methods remain the same
function set(key: string, value: Data) {
    cache.value[key] = value;
}

function get(key: string): Data | undefined {
    return cache.value[key];
}
```

### 6. Async in Setup Without Guard

```typescript
// RISKY - May cause issues
export const useMyStore = defineStore('my', async () => {  // async setup!
    // This runs during SSR too
});

// SAFE - Use sync setup with async actions
export const useMyStore = defineStore('my', () => {
    async function init() {
        if (process.server) return;
        // async work here
    }

    return { init };
});
```

---

## Quick Reference

### Always Do

1. Add `if (process.server) return;` as first line in async actions
2. Use `onMounted` for client-only component initialization
3. Store dates as ISO strings, not Date objects
4. Use `.client.ts` suffix for client-only plugins
5. Return appropriate defaults for server-side calls

### Never Do

1. Access `$supabase` without server guard
2. Access `localStorage`, `window`, `document` without guard
3. Store non-serializable data (Map, Set, functions)
4. Mutate state inside computed properties
5. Use async setup function in stores

### Detection Checklist

```typescript
// Search for potential SSR issues:

// Missing guards
grep -r "useNuxtApp\(\)" stores/ | grep -v "process.server"

// Direct window access
grep -r "window\." stores/

// Direct localStorage
grep -r "localStorage" stores/

// Non-serializable refs
grep -r "ref(new Map" stores/
grep -r "ref(new Set" stores/
```
