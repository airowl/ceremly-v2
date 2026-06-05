# Multi-Tenancy Patterns

## Table of Contents
- [Architecture Overview](#architecture-overview)
- [Workspace Context Store](#workspace-context-store)
- [JWT-Based Tenancy](#jwt-based-tenancy)
- [Store Composition](#store-composition)
- [Permission Patterns](#permission-patterns)
- [Workspace Switching](#workspace-switching)

---

## Architecture Overview

### Two-Phase Authentication Flow

YourSaaS uses a two-phase authentication model:

```
Phase 1: Login
├─ User authenticates
├─ JWT issued with workspace_id = NULL
└─ User can only access workspace selection

Phase 2: Workspace Selection
├─ User selects workspace
├─ Edge Function updates JWT with workspace_id + permissions
├─ Client calls refreshSession()
└─ All subsequent queries automatically filtered by RLS
```

### Key Principle

**RLS handles multi-tenancy at database level.**
Frontend stores only need to:
1. Track current workspace context for UI/navigation
2. Trigger JWT refresh on workspace switch
3. Never duplicate `workspace_id` filtering (RLS does it)

---

## Workspace Context Store

### Complete Implementation

```typescript
// stores/workspaceContextStore.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useUserStore } from '~/stores/userStore';

interface Workspace {
    id: string;
    name: string;
    slug: string;
    created_at: string;
}

interface WorkspaceMember {
    workspace_id: string;
    user_id: string;
    role: 'owner' | 'admin' | 'member' | 'viewer';
    permissions: string[];
}

export const useWorkspaceContextStore = defineStore('workspaceContext', () => {
    // ============================================================================
    // STATE
    // ============================================================================
    const workspaces = ref<Workspace[]>([]);
    const currentWorkspace = ref<Workspace | null>(null);
    const currentMembership = ref<WorkspaceMember | null>(null);
    const isLoading = ref(false);
    const isSwitching = ref(false);

    // ============================================================================
    // GETTERS
    // ============================================================================
    const workspaceId = computed(() => currentWorkspace.value?.id ?? null);
    const workspaceName = computed(() => currentWorkspace.value?.name ?? '');
    const userRole = computed(() => currentMembership.value?.role ?? 'viewer');
    const userPermissions = computed(() => currentMembership.value?.permissions ?? []);

    const isOwner = computed(() => userRole.value === 'owner');
    const isAdmin = computed(() => ['owner', 'admin'].includes(userRole.value));
    const canEdit = computed(() => ['owner', 'admin', 'member'].includes(userRole.value));
    const canDelete = computed(() => ['owner', 'admin'].includes(userRole.value));

    // ============================================================================
    // ACTIONS
    // ============================================================================

    /**
     * Load all workspaces for current user
     */
    async function loadWorkspaces() {
        if (process.server) return;

        isLoading.value = true;

        try {
            const { $supabase } = useNuxtApp();

            // Get workspaces through membership
            const { data, error } = await $supabase
                .from('workspace_users')
                .select(`
                    role,
                    permissions,
                    workspace:workspaces(id, name, slug, created_at)
                `)
                .order('workspace(name)', { ascending: true });

            if (error) throw error;

            workspaces.value = data?.map(d => d.workspace as Workspace) ?? [];
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * Select a workspace - updates JWT via Edge Function
     */
    async function selectWorkspace(workspaceId: string) {
        if (process.server) return;
        if (isSwitching.value) return;

        isSwitching.value = true;

        try {
            const { $supabase } = useNuxtApp();

            // 1. Call Edge Function to update JWT with workspace context
            const { data, error } = await $supabase.functions.invoke('select-workspace', {
                body: { workspace_id: workspaceId }
            });

            if (error) throw error;
            if (data.error) throw new Error(data.error);

            // 2. Refresh session to get new JWT
            const { error: refreshError } = await $supabase.auth.refreshSession();
            if (refreshError) throw refreshError;

            // 3. Update local state
            const workspace = workspaces.value.find(w => w.id === workspaceId);
            currentWorkspace.value = workspace ?? null;

            // 4. Load membership details
            await loadCurrentMembership(workspaceId);

            return workspace;
        } finally {
            isSwitching.value = false;
        }
    }

    /**
     * Load membership for current workspace
     */
    async function loadCurrentMembership(workspaceId: string) {
        if (process.server) return;

        const { $supabase } = useNuxtApp();
        const userStore = useUserStore();

        const { data, error } = await $supabase
            .from('workspace_users')
            .select('workspace_id, user_id, role, permissions')
            .eq('workspace_id', workspaceId)
            .eq('user_id', userStore.user?.id)
            .single();

        if (!error && data) {
            currentMembership.value = data;
        }
    }

    /**
     * Clear workspace context (on logout or workspace leave)
     */
    function clearWorkspaceContext() {
        currentWorkspace.value = null;
        currentMembership.value = null;
    }

    /**
     * Check if user has specific permission
     */
    function hasPermission(permission: string): boolean {
        if (isOwner.value || isAdmin.value) return true;
        return userPermissions.value.includes(permission);
    }

    function $reset() {
        workspaces.value = [];
        currentWorkspace.value = null;
        currentMembership.value = null;
        isLoading.value = false;
        isSwitching.value = false;
    }

    return {
        // State
        workspaces,
        currentWorkspace,
        currentMembership,
        isLoading,
        isSwitching,
        // Getters
        workspaceId,
        workspaceName,
        userRole,
        userPermissions,
        isOwner,
        isAdmin,
        canEdit,
        canDelete,
        // Actions
        loadWorkspaces,
        selectWorkspace,
        loadCurrentMembership,
        clearWorkspaceContext,
        hasPermission,
        $reset,
    };
});
```

---

## JWT-Based Tenancy

### How It Works

1. **Login**: JWT contains only `user_id`
2. **Workspace Selection**: Edge Function adds to JWT:
   ```json
   {
     "workspace_id": "uuid",
     "user_permissions": ["events.create", "guests.read"]
   }
   ```
3. **RLS Policies**: Extract `workspace_id` from JWT:
   ```sql
   auth.jwt() ->> 'workspace_id' = workspace_id
   ```

### Frontend Responsibility

Frontend does NOT filter by `workspace_id` in queries - RLS handles it:

```typescript
// CORRECT - RLS automatically filters
const { data } = await $supabase.from('events').select('*');

// WRONG - unnecessary, RLS already does this
const { data } = await $supabase
    .from('events')
    .select('*')
    .eq('workspace_id', workspaceId);  // Redundant!
```

### Session Refresh Pattern

After workspace switch, always refresh session:

```typescript
async function switchWorkspace(workspaceId: string) {
    const { $supabase } = useNuxtApp();

    // 1. Update JWT via Edge Function
    await $supabase.functions.invoke('select-workspace', {
        body: { workspace_id: workspaceId }
    });

    // 2. CRITICAL: Refresh session to get new JWT
    await $supabase.auth.refreshSession();

    // 3. Now all queries use new workspace context automatically
}
```

---

## Store Composition

### Getting Workspace Context in Other Stores

```typescript
// stores/eventsStore.ts
import { useWorkspaceContextStore } from '~/stores/workspaceContextStore';

export const useEventsStore = defineStore('events', () => {
    async function createEvent(input: CreateEventInput) {
        if (process.server) return;

        const workspaceContext = useWorkspaceContextStore();

        // Check permissions via workspace context
        if (!workspaceContext.hasPermission('events.create')) {
            throw new Error('Permesso negato: non puoi creare eventi');
        }

        // workspace_id comes from JWT, not from store
        // RLS ensures the event is created in correct workspace
        const { $supabase } = useNuxtApp();
        const { data, error } = await $supabase.functions.invoke('events', {
            body: input  // No workspace_id needed - JWT has it
        });

        if (error) throw error;
        return data.event;
    }

    return { createEvent };
});
```

### Don't Duplicate Workspace ID

```typescript
// WRONG - duplicating workspace_id across stores
const eventsStore = defineStore('events', () => {
    const workspaceId = ref<string | null>(null);  // DON'T DO THIS

    async function setWorkspace(id: string) {
        workspaceId.value = id;  // DON'T DO THIS
    }
});

// CORRECT - get from context store when needed
const eventsStore = defineStore('events', () => {
    async function loadEvents() {
        const workspaceContext = useWorkspaceContextStore();
        const wsId = workspaceContext.workspaceId;

        if (!wsId) throw new Error('No workspace selected');

        // wsId only needed for UI/logging, not for query filtering
    }
});
```

---

## Permission Patterns

### Role-Based UI

```typescript
<script setup lang="ts">
const workspaceContext = useWorkspaceContextStore();

const canCreateEvent = computed(() => workspaceContext.canEdit);
const canDeleteEvent = computed(() => workspaceContext.canDelete);
const canManageMembers = computed(() => workspaceContext.isAdmin);
</script>

<template>
    <UButton v-if="canCreateEvent" @click="openCreateModal">
        Nuovo Evento
    </UButton>

    <UButton v-if="canDeleteEvent" color="error" @click="deleteEvent">
        Elimina
    </UButton>

    <AdminPanel v-if="canManageMembers" />
</template>
```

### Permission Check Helper

```typescript
// In store
function hasPermission(permission: string): boolean {
    const context = useWorkspaceContextStore();

    // Owners and admins have all permissions
    if (context.isOwner || context.isAdmin) return true;

    // Check specific permission
    return context.userPermissions.includes(permission);
}

// Usage
if (!hasPermission('guests.delete')) {
    throw new Error('Permission denied');
}
```

### Backend Validation

Frontend permission checks are for UX only. Always validate on backend:

```typescript
// Edge Function pattern
const user_permissions = jwt.user_permissions || [];
if (!user_permissions.includes('events.create')) {
    return new Response(JSON.stringify({ error: 'Permission denied' }), {
        status: 403
    });
}
```

---

## Workspace Switching

### Complete Flow

```typescript
async function handleWorkspaceSwitch(newWorkspaceId: string) {
    const workspaceContext = useWorkspaceContextStore();
    const workspaceStore = useWorkspaceStore();
    const eventsStore = useEventsStore();
    const guestsStore = useGuestsStore();

    try {
        // 1. Reset data stores (clear old workspace data)
        workspaceStore.$reset();
        eventsStore.$reset();
        guestsStore.$reset();

        // 2. Switch workspace (updates JWT)
        await workspaceContext.selectWorkspace(newWorkspaceId);

        // 3. Load new workspace data
        await workspaceStore.loadWorkspace(newWorkspaceId);

        // 4. Navigate to workspace dashboard
        navigateTo(`/dashboard/${newWorkspaceId}`);
    } catch (error) {
        toast.add({
            title: 'Errore cambio workspace',
            description: error.message,
            color: 'error'
        });
    }
}
```

### Workspace Selector Component

```typescript
<script setup lang="ts">
const workspaceContext = useWorkspaceContextStore();

const isOpen = ref(false);

async function selectWorkspace(workspace: Workspace) {
    isOpen.value = false;
    await handleWorkspaceSwitch(workspace.id);
}
</script>

<template>
    <UDropdown :items="workspaceItems" v-model:open="isOpen">
        <UButton variant="ghost">
            {{ workspaceContext.workspaceName || 'Select Workspace' }}
            <UIcon name="i-heroicons-chevron-down" />
        </UButton>

        <template #item="{ item }">
            <div
                @click="selectWorkspace(item.workspace)"
                :class="{ 'bg-primary-50': item.workspace.id === workspaceContext.workspaceId }"
            >
                {{ item.workspace.name }}
            </div>
        </template>
    </UDropdown>
</template>
```

---

## Summary

### Key Principles

1. **Single Source of Truth**: `workspaceContextStore` manages workspace selection
2. **JWT Handles Tenancy**: RLS uses JWT `workspace_id`, not frontend filtering
3. **Refresh After Switch**: Always call `refreshSession()` after workspace change
4. **Don't Duplicate**: Other stores reference context store, don't store `workspace_id`
5. **Frontend = UX Only**: Permission checks on frontend are for UX, backend validates

### Store Hierarchy

```
workspaceContextStore
├── Manages: workspaces list, current selection, permissions
├── Used by: All other stores via composition
└── Updates: JWT refresh on switch

workspaceStore
├── Manages: Current workspace data, events, usage
├── Depends on: workspaceContextStore.workspaceId
└── Resets: On workspace switch

eventsStore / guestsStore / etc.
├── Manages: Domain-specific CRUD
├── Depends on: workspaceContextStore for permissions
└── Resets: On workspace switch
```
