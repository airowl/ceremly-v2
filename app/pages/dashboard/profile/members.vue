<script setup lang="ts">
/**
 * Legacy deep link `/dashboard/profile/members` (Task 14c fix round 1).
 *
 * This used to be a Nuxt UI template page that called `/api/members`, a route
 * that never existed. The team lives on the organization members page, which
 * needs the organization id: wait for the active organization (a live query) and
 * redirect there, or to the organization list when there is none.
 */
import { watch } from 'vue'
import { useOrganizationStore } from '~/stores/organizationStore'

const localePath = useLocalePath()
const orgStore = useOrganizationStore()

watch(
    () => [orgStore.isLoading, orgStore.currentOrganization?.id] as const,
    async ([loading, organizationId]) => {
        if (loading) return
        const target = organizationId
            ? `/dashboard/organization/${organizationId}/members`
            : '/dashboard/organization'
        await navigateTo(localePath(target), { replace: true })
    },
    { immediate: true },
)
</script>

<template>
    <div class="flex items-center justify-center py-12">
        <UIcon name="i-lucide-loader-2" class="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
</template>
