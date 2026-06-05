<script setup lang="ts">
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { useUserStore } from '~/stores/userStore'
import { useEventStore } from '~/stores/eventStore'

const userStore = useUserStore()
const eventStore = useEventStore()

// User name from user object (Better Auth stores name directly)
const userName = computed(() => {
    const user = userStore.user
    if (!user) return 'Utente'

    // Better Auth stores name directly on user object
    if (user.name) return user.name

    // Fallback to email username
    return user.email?.split('@')[0] || 'Utente'
})

// Event name
const eventName = computed(() => {
    return eventStore.currentEvent?.name || 'Event'
})

// Plan info
const planName = computed(() => {
    const plan = userStore.subscription?.plan || 'free'
    return plan.charAt(0).toUpperCase() + plan.slice(1)
})

const planColor = computed(() => {
    const plan = userStore.subscription?.plan || 'free'
    switch (plan) {
        case 'pro':
            return 'primary'
        case 'basic':
            return 'success'
        default:
            return 'neutral'
    }
})

// Formatted date
const formattedDate = computed(() => {
    return format(new Date(), "EEEE d MMMM yyyy", { locale: it })
})
</script>

<template>
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
            <h1 class="text-2xl font-bold text-highlighted">
                Benvenuto, {{ userName }}
            </h1>
            <div class="flex items-center gap-2 mt-1 text-muted">
                <UIcon name="i-lucide-building-2" class="size-4" />
                <span>{{ eventName }}</span>
                <UBadge :color="planColor" variant="subtle" size="xs">
                    {{ planName }}
                </UBadge>
            </div>
        </div>
        <div class="text-sm text-muted capitalize">
            {{ formattedDate }}
        </div>
    </div>
</template>
