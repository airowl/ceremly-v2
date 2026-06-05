<script setup lang="ts">
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

const props = defineProps<{
    event: {
        name: string
        date: string
        time: string | null
        location: string | null
        address: string | null
        primaryColor: string
        slug: string
    }
    eventId: string
}>()

const formattedDate = computed(() => {
    try {
        return format(new Date(props.event.date), "d MMMM yyyy", { locale: it })
    } catch {
        return props.event.date
    }
})

const formattedTime = computed(() => {
    if (!props.event.time) return null
    return props.event.time.slice(0, 5)
})
</script>

<template>
    <div class="bg-default p-6 rounded-xl border border-default h-full flex gap-6">
        <!-- Event image placeholder -->
        <div
            class="w-28 h-28 rounded-xl flex items-center justify-center shrink-0 border border-default"
            :style="{ backgroundColor: `${event.primaryColor}15` }"
        >
            <UIcon
                name="i-lucide-calendar-heart"
                class="size-10"
                :style="{ color: event.primaryColor }"
            />
        </div>

        <!-- Event details -->
        <div class="flex-1 min-w-0">
            <div class="flex justify-between items-start mb-1">
                <div>
                    <h3 class="text-lg font-bold text-highlighted">Dettagli Evento</h3>
                    <p class="text-muted text-sm">Gestisci il tuo evento da qui.</p>
                </div>
                <UBadge color="primary" variant="subtle" size="sm" class="uppercase font-bold">
                    Attivo
                </UBadge>
            </div>

            <div class="grid grid-cols-2 gap-3 mt-4">
                <div class="flex items-center gap-2 text-sm">
                    <UIcon name="i-lucide-calendar" class="size-4 text-primary shrink-0" />
                    <span class="truncate">{{ formattedDate }}</span>
                    <span v-if="formattedTime" class="text-muted">{{ formattedTime }}</span>
                </div>
                <div v-if="event.location" class="flex items-center gap-2 text-sm">
                    <UIcon name="i-lucide-map-pin" class="size-4 text-primary shrink-0" />
                    <span class="truncate">{{ event.location }}</span>
                </div>
            </div>

            <div class="mt-5 flex items-center gap-4">
                <UButton
                    label="Modifica Evento"
                    color="primary"
                    variant="link"
                    size="sm"
                    class="font-bold"
                    :to="`/dashboard/event/${eventId}/settings`"
                />
                <UButton
                    label="Vedi Pagina RSVP"
                    color="neutral"
                    variant="link"
                    size="sm"
                    class="font-bold"
                    :to="`/event/${event.slug}`"
                    target="_blank"
                />
            </div>
        </div>
    </div>
</template>
