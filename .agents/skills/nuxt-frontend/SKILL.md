# Nuxt Frontend Development Skill

> Nuxt 4 + Vue 3 + TypeScript frontend development patterns for YourSaaS

## Quick Start Checklist

Before writing any frontend code:

- [ ] Use `<script setup lang="ts">` for all components
- [ ] Import stores via `useUserStore()` / `useWorkspaceStore()`
- [ ] Access Supabase via `const { $supabase } = useNuxtApp()`
- [ ] Use Nuxt UI components (UButton, UModal, UForm, etc.)
- [ ] Add `.client.vue` suffix for client-only components
- [ ] Check `process.server` guard for client-only operations
- [ ] Use Zod for form validation schemas

---

## Architecture Overview

### Directory Structure

```
fe/app/
├── composables/     # Reusable logic (useSiteMode, useWorkspace, etc.)
├── stores/          # Pinia stores (userStore, workspaceStore)
├── middleware/      # Route guards (0.site-mode.global.ts, auth.global.ts)
├── plugins/         # Nuxt plugins (supabase.client.ts)
├── pages/           # File-based routing
├── layouts/         # Page layouts (dashboard, auth, default)
├── components/      # Vue components
│   ├── landing/     # Landing page components
│   └── admin/       # Dashboard components
└── types/           # TypeScript definitions
```

### Key Files

| File | Purpose |
|------|---------|
| `plugins/supabase.client.ts` | Supabase client setup with `base` schema |
| `stores/userStore.ts` | Auth, subscription, plan limits |
| `stores/workspaceStore.ts` | Current workspace, events, resource usage |
| `middleware/0.site-mode.global.ts` | Site mode routing (waitinglist/active/maintenance) |
| `middleware/auth.global.ts` | Authentication route guards |
| `nuxt.config.ts` | App config, security headers, route rules |

---

## Core Principles

### 1. Server-Side Guard

Always check for server context before client-only operations:

```typescript
if (process.server) return;
const { $supabase } = useNuxtApp();
```

### 2. Supabase Access

Access via Nuxt app context, not direct import:

```typescript
// ✅ Correct
const { $supabase } = useNuxtApp();

// ❌ Wrong - direct import
import { supabase } from '~/lib/supabase';
```

### 3. State Management

Use Pinia stores with setup syntax:

```typescript
export const useMyStore = defineStore('myStore', () => {
    const state = ref<Type | null>(null);
    const isLoading = ref(false);

    async function fetchData() {
        if (process.server) return;
        // ...
    }

    return { state, isLoading, fetchData };
});
```

### 4. Component Naming

Use `.client.vue` suffix for client-only components:

```
AddEventModal.client.vue    # Only rendered on client
HomeChart.server.vue        # Server-only (SSR)
Features.vue                # Universal
```

### 5. Page Meta

Use `definePageMeta` for page configuration:

```typescript
definePageMeta({
    title: 'Dashboard',
    layout: 'dashboard',
    middleware: ['auth'],
})
```

### 6. Form Validation

Use Zod schemas with Nuxt UI forms:

```typescript
import * as z from 'zod';

const schema = z.object({
    name: z.string().min(2, 'Nome troppo corto'),
    email: z.string().email('Email non valida'),
});
```

### 7. Cross-Component Communication

Use provide/inject for parent-child data:

```typescript
// Parent
provide('refreshEvents', refreshEvents);

// Child
const refreshEvents = inject<() => Promise<void>>('refreshEvents');
```

---

## Site Mode System

The app has 3 operational modes via `NUXT_PUBLIC_SITE_MODE`:

| Mode | Behavior |
|------|----------|
| `waitinglist` | Landing only, auth routes blocked |
| `active` | Full SaaS functionality |
| `maintenance` | Only `/maintenance` accessible |

```typescript
const { siteMode, isActiveMode, isWaitingListMode } = useSiteMode();

// Conditional rendering
<WaitingListCTA v-if="shouldShowWaitingListCTA" />
<NewsletterCTA v-else-if="shouldShowNewsletterCTA" />
```

---

## Common Imports

```typescript
// Stores
import { useUserStore } from '~/stores/userStore';
import { useWorkspaceStore } from '~/stores/workspaceStore';

// Composables
import { useSiteMode } from '~/composables/useSiteMode';
import { useSubscription } from '~/composables/useSubscription';
import { useDashboard } from '~/composables/useDashboard';

// VueUse
import { createSharedComposable } from '@vueuse/core';

// Zod validation
import * as z from 'zod';
import type { FormSubmitEvent } from '@nuxt/ui';
```

---

## Quick Reference

### Edge Function Calls

```typescript
const { data, error } = await $supabase.functions.invoke('events', {
    body: { ...state, workspace_id: props.workspaceId }
});

if (error && !data) {
    toast.add({ title: 'Error', description: error.message, color: 'error' });
    return;
}
```

### Plan Limit Checks

```typescript
const userStore = useUserStore();

// Check before create
const eventLimit = await userStore.checkEventCreationLimit(workspaceId);
if (!eventLimit.allowed) {
    toast.add({ title: 'Limite raggiunto', color: 'warning' });
    return;
}

// Read-only plan check
if (userStore.isReadOnlyPlan()) {
    // Show upgrade prompt
}
```

### Route Rules

```typescript
// nuxt.config.ts
routeRules: {
    '/': { prerender: true },                    // Static landing
    '/dashboard/**': { ssr: false },             // Client-only dashboard
    '/login': { ssr: false, prerender: false },  // Client-only auth
}
```

---

## Anti-Patterns

| ❌ Don't | ✅ Do |
|---------|-------|
| Direct Supabase import | `useNuxtApp().$supabase` |
| Skip server check | Add `if (process.server) return;` |
| Options API | Composition API with `<script setup>` |
| Regular `.vue` for client-only | `.client.vue` suffix |
| Manual state management | Pinia stores |
| Raw HTML forms | Nuxt UI components + Zod |

---

## Navigation Guide

For detailed patterns, see:

- **[Pinia Stores](resources/pinia-stores.md)** - State management patterns
- **[Composables](resources/composables.md)** - Reusable logic patterns
- **[Middleware](resources/middleware.md)** - Route guard patterns
- **[Components](resources/components.md)** - Vue component patterns
- **[Nuxt UI](resources/nuxt-ui.md)** - UI component usage
- **[Nuxt Config](resources/nuxt-config.md)** - Configuration options
