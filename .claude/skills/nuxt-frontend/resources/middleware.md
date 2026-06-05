# Middleware

## Table of Contents
- [Overview](#overview)
- [Middleware Types](#middleware-types)
- [Core Middleware](#core-middleware)
- [Creating Middleware](#creating-middleware)
- [Route Protection Patterns](#route-protection-patterns)

---

## Overview

Nuxt middleware are navigation guards that run before rendering a page:

- **Location**: `fe/app/middleware/`
- **Global**: Named `*.global.ts` (runs on every route)
- **Execution Order**: Numeric prefix controls order (e.g., `0.`, `1.`)
- **Page-specific**: Via `definePageMeta({ middleware: ['name'] })`

### Execution Flow

```
Route Change → 0.site-mode.global.ts → auth.global.ts → Page Middleware → Page Render
```

---

## Middleware Types

### Global Middleware

Runs on every navigation. Add `.global.ts` suffix:

```typescript
// middleware/logging.global.ts
export default defineNuxtRouteMiddleware((to, from) => {
    console.log(`Navigating: ${from.path} → ${to.path}`);
});
```

### Named Middleware

Defined in `middleware/` but must be explicitly attached to pages:

```typescript
// middleware/admin.ts
export default defineNuxtRouteMiddleware((to, from) => {
    const userStore = useUserStore();

    if (!userStore.isAdmin) {
        return navigateTo('/dashboard');
    }
});
```

```typescript
// pages/admin/index.vue
<script setup lang="ts">
definePageMeta({
    middleware: ['admin'],
});
</script>
```

### Inline Middleware

Defined directly in page component:

```typescript
// pages/settings.vue
<script setup lang="ts">
definePageMeta({
    middleware: [
        function (to, from) {
            // Custom inline logic
            const userStore = useUserStore();
            if (!userStore.hasCompletedOnboarding) {
                return navigateTo('/onboarding');
            }
        }
    ],
});
</script>
```

---

## Core Middleware

### 0.site-mode.global.ts

Controls app operational mode (highest priority).

**Location**: `fe/app/middleware/0.site-mode.global.ts`

```typescript
export default defineNuxtRouteMiddleware((to) => {
    const { siteMode, isMaintenanceMode, isWaitingListMode } = useSiteMode();

    // Maintenance mode - only /maintenance accessible
    if (isMaintenanceMode.value) {
        if (to.path !== '/maintenance') {
            return navigateTo('/maintenance');
        }
        return;
    }

    // Redirect away from maintenance when not in maintenance mode
    if (to.path === '/maintenance') {
        return navigateTo('/');
    }

    // Waiting list mode - block auth/dashboard routes
    if (isWaitingListMode.value) {
        const blockedPaths = ['/login', '/signup', '/dashboard'];
        const isBlocked = blockedPaths.some(path =>
            to.path.startsWith(path)
        );

        if (isBlocked) {
            return navigateTo('/');
        }
    }
});
```

### auth.global.ts

Authentication and route protection.

**Location**: `fe/app/middleware/auth.global.ts`

```typescript
export default defineNuxtRouteMiddleware(async (to) => {
    // Skip server-side
    if (process.server) return;

    const userStore = useUserStore();

    // Initialize auth if not done
    if (!userStore.isInitialized) {
        await userStore.initializeAuth();
    }

    const isLoggedIn = userStore.user !== null;

    // Guest-only routes (redirect logged-in users)
    const guestOnlyRoutes = ['/login', '/signup', '/forgot-password'];
    if (guestOnlyRoutes.includes(to.path) && isLoggedIn) {
        return navigateTo('/dashboard');
    }

    // Protected routes (require authentication)
    const protectedRoutes = ['/dashboard', '/settings', '/billing'];
    const isProtected = protectedRoutes.some(route =>
        to.path.startsWith(route)
    );

    if (isProtected && !isLoggedIn) {
        // Store intended destination
        return navigateTo({
            path: '/login',
            query: { redirect: to.fullPath },
        });
    }
});
```

---

## Creating Middleware

### Basic Template

```typescript
// middleware/custom.ts
export default defineNuxtRouteMiddleware((to, from) => {
    // Skip on server if using client-only logic
    if (process.server) return;

    // Your logic here

    // Return nothing to continue
    // Return navigateTo() to redirect
    // Return abortNavigation() to cancel
});
```

### Async Middleware

```typescript
// middleware/subscription.ts
export default defineNuxtRouteMiddleware(async (to) => {
    if (process.server) return;

    const userStore = useUserStore();

    // Fetch subscription if not loaded
    if (!userStore.subscription) {
        await userStore.fetchSubscription();
    }

    // Check subscription status
    const requiresSubscription = to.meta.requiresSubscription as boolean;

    if (requiresSubscription && !userStore.hasActiveSubscription) {
        return navigateTo('/billing/upgrade');
    }
});
```

### Middleware with Parameters

Use `to.meta` for page-specific configuration:

```typescript
// middleware/role.ts
export default defineNuxtRouteMiddleware((to) => {
    if (process.server) return;

    const userStore = useUserStore();
    const requiredRole = to.meta.requiredRole as string | undefined;

    if (requiredRole && userStore.role !== requiredRole) {
        return navigateTo('/unauthorized');
    }
});
```

```typescript
// pages/admin/users.vue
<script setup lang="ts">
definePageMeta({
    middleware: ['role'],
    requiredRole: 'admin',
});
</script>
```

---

## Route Protection Patterns

### Plan-Required Middleware

```typescript
// middleware/plan-required.ts
export default defineNuxtRouteMiddleware(async (to) => {
    if (process.server) return;

    const userStore = useUserStore();
    const requiredPlan = to.meta.requiredPlan as string | undefined;

    if (!requiredPlan) return;

    // Ensure subscription is loaded
    if (!userStore.subscription) {
        await userStore.fetchSubscription();
    }

    const planHierarchy = ['free', 'basic', 'pro', 'enterprise'];
    const userPlanIndex = planHierarchy.indexOf(
        userStore.subscription?.plan_name ?? 'free'
    );
    const requiredPlanIndex = planHierarchy.indexOf(requiredPlan);

    if (userPlanIndex < requiredPlanIndex) {
        return navigateTo({
            path: '/billing/upgrade',
            query: {
                required: requiredPlan,
                feature: to.meta.featureName as string
            },
        });
    }
});
```

### Workspace Access Middleware

```typescript
// middleware/workspace-access.ts
export default defineNuxtRouteMiddleware(async (to) => {
    if (process.server) return;

    const workspaceId = to.params.workspaceId as string;
    if (!workspaceId) return;

    const { $supabase } = useNuxtApp();

    // Verify workspace access
    const { data, error } = await $supabase
        .from('workspace_users')
        .select('role')
        .eq('workspace_id', workspaceId)
        .single();

    if (error || !data) {
        return navigateTo('/dashboard');
    }

    // Store role for later use
    useState('currentWorkspaceRole', () => data.role);
});
```

### Onboarding Middleware

```typescript
// middleware/onboarding.ts
export default defineNuxtRouteMiddleware(async (to) => {
    if (process.server) return;

    // Skip for onboarding routes
    if (to.path.startsWith('/onboarding')) return;

    const userStore = useUserStore();

    // Check if user completed onboarding
    if (userStore.user && !userStore.user.onboarding_completed) {
        return navigateTo('/onboarding');
    }
});
```

---

## Best Practices

### Do's

✅ Use numeric prefix for execution order (`0.`, `1.`, `2.`)
✅ Add `if (process.server) return;` for client-only logic
✅ Use `navigateTo()` for redirects
✅ Keep middleware focused and single-purpose
✅ Use `to.meta` for page-specific configuration

### Don'ts

❌ Make heavy API calls in global middleware
❌ Forget server-side guards when accessing client APIs
❌ Use synchronous blocking operations
❌ Chain too many global middleware (performance)

### Error Handling

```typescript
export default defineNuxtRouteMiddleware(async (to) => {
    if (process.server) return;

    try {
        // Your async logic
        await someAsyncOperation();
    } catch (error) {
        console.error('[Middleware Error]:', error);

        // Redirect to error page or continue
        return navigateTo('/error');
    }
});
```

### Middleware Ordering

```
middleware/
├── 0.site-mode.global.ts    # Site mode (first)
├── 1.auth.global.ts         # Authentication (second)
├── 2.workspace.global.ts    # Workspace context (third)
├── admin.ts                 # Named - admin only
├── plan-required.ts         # Named - plan checks
└── onboarding.ts            # Named - onboarding flow
```
