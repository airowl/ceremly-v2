<script setup lang="ts">
import { useEventStore } from '~/stores/eventStore'

const eventStore = useEventStore()

const isLoading = computed(() => eventStore.isLoading)

// Current event ID for links
const eventId = computed(() => eventStore.currentEvent?.id)

// Stats from real event data
const stats = computed(() => {
    const evtId = eventId.value

    return [
        {
            title: 'Members',
            icon: 'i-lucide-users',
            value: eventStore.membersCount ?? 0,
            limit: null,
            to: evtId ? `/dashboard/event/${evtId}/team` : undefined,
            color: 'primary'
        },
        {
            title: 'Storage',
            icon: 'i-lucide-hard-drive',
            value: Math.round((eventStore.resourceUsage?.storage_used ?? 0) / 1024 / 1024), // Convert to MB
            unit: 'MB',
            limit: null,
            to: undefined,
            color: 'info'
        }
    ]
})
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
