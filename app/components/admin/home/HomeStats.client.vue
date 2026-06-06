<script setup lang="ts">
import { useOrganizationStore } from '~/stores/organizationStore'

const orgStore = useOrganizationStore()
const isLoading = computed(() => orgStore.isLoading)
const orgId = computed(() => orgStore.currentOrganization?.id)

const stats = computed(() => [
    {
        title: 'Members',
        icon: 'i-lucide-users',
        value: orgStore.members.length,
        unit: undefined as string | undefined,
        to: orgId.value ? `/dashboard/organization/${orgId.value}/members` : undefined,
        color: 'primary'
    },
])
</script>

<template>
    <!-- Loading State -->
    <UPageGrid v-if="isLoading" class="lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-px mb-6">
        <div
            v-for="i in 2"
            :key="i"
            class="bg-elevated rounded-lg p-4 lg:rounded-none first:rounded-l-lg last:rounded-r-lg"
        >
            <USkeleton class="h-4 w-20 mb-3" />
            <USkeleton class="h-8 w-16" />
        </div>
    </UPageGrid>

    <!-- Stats Grid -->
    <UPageGrid v-else class="lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-px mb-6">
        <UPageCard
            v-for="(stat, index) in stats"
            :key="index"
            :icon="stat.icon"
            :title="stat.title"
            :to="stat.to"
            variant="subtle"
            :ui="{
                container: 'gap-y-1.5',
                wrapper: 'items-start',
                leading: `p-2.5 rounded-full bg-${stat.color}/10 ring ring-inset ring-${stat.color}/25 flex-col`,
                title: 'font-normal text-muted text-xs uppercase'
            }"
            class="lg:rounded-none first:rounded-l-lg last:rounded-r-lg hover:z-1"
        >
            <div class="flex items-center gap-2">
                <span class="text-2xl font-semibold text-highlighted">
                    {{ stat.value.toLocaleString() }}
                </span>
                <span v-if="stat.unit" class="text-sm text-muted">{{ stat.unit }}</span>
            </div>
        </UPageCard>
    </UPageGrid>
</template>
