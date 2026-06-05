<script setup lang="ts">
import { useEventStore } from '~/stores/eventStore'

const route = useRoute()
const eventStore = useEventStore()

definePageMeta({
    title: 'Dashboard',
    layout: 'dashboard',
})

const eventId = computed(() => route.params.id as string)

// Guest data (auto-loads via internal watch)
const { guests, summary, isLoading: isLoadingGuests } = useGuests(eventId)

// Recent guests for the preview table (first 5)
const recentGuests = computed(() => guests.value?.slice(0, 5) ?? [])

onMounted(async () => {
    if (!eventId.value) return
    await eventStore.loadEvent(eventId.value)
    // Fire-and-forget — sidebar handles its own loading state
    eventStore.loadTeamMembers()
})

watch(eventId, async (newId) => {
    if (newId) {
        await eventStore.loadEvent(newId)
        eventStore.loadTeamMembers()
    }
})
</script>

<template>
    <UDashboardPanel id="dashboard-home">
        <template #header>
            <EventPageHeader title="Dashboard" />
        </template>

        <template #body>
            <!-- Loading skeleton for the whole page -->
            <template v-if="eventStore.isLoading && !eventStore.currentEvent">
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                    <USkeleton class="h-40 lg:col-span-2 rounded-xl" />
                    <USkeleton class="h-40 rounded-xl" />
                </div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <USkeleton v-for="i in 4" :key="i" class="h-[104px] rounded-xl" />
                </div>
            </template>

            <template v-else-if="eventStore.currentEvent">
                <!-- ROW 1: Event Summary (2/3) + RSVP Countdown (1/3) -->
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                    <div class="lg:col-span-2">
                        <AdminHomeEventSummaryCard
                            :event="eventStore.currentEvent"
                            :event-id="eventId"
                        />
                    </div>
                    <div>
                        <AdminHomeRsvpCountdownCard
                            :deadline="eventStore.currentEvent.deadline"
                        />
                    </div>
                </div>

                <!-- ROW 2: Guest Stats Grid (4 columns) -->
                <AdminHomeGuestStatsGrid
                    :total="summary.total"
                    :confirmed="summary.confirmed"
                    :declined="summary.declined"
                    :pending="summary.pending"
                    :is-loading="isLoadingGuests"
                    class="mb-6"
                />

                <!-- ROW 3: Guest Table (3/4) + Sidebar (1/4) -->
                <div class="grid grid-cols-1 xl:grid-cols-4 gap-6">
                    <div class="xl:col-span-3">
                        <AdminHomeRecentGuestsTable
                            :guests="recentGuests"
                            :is-loading="isLoadingGuests"
                            :event-id="eventId"
                        />
                    </div>
                    <div class="space-y-4">
                        <AdminHomeDashboardSidebar
                            :total="summary.total"
                            :confirmed="summary.confirmed"
                            :pending="summary.pending"
                            :declined="summary.declined"
                            :team-members="eventStore.teamMembers"
                            :is-loading-team="eventStore.isLoadingTeam"
                            :event-id="eventId"
                        />

                        <!-- Resource Usage (existing component) -->
                        <AdminEventUsageDashboard
                            v-if="eventId && eventStore.currentEvent"
                            :event-id="eventId"
                            :event-name="eventStore.currentEvent.name"
                        />
                    </div>
                </div>
            </template>
        </template>
    </UDashboardPanel>
</template>
