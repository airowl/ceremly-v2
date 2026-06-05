<script setup lang="ts">
import type { LandingSettings } from '~~/shared/schemas/landing'

const props = defineProps<{
    values: Record<string, unknown>
    settings: LandingSettings
    event?: Record<string, unknown>
}>()

const title = computed(() => (props.values.title as string) || 'Come Arrivare')
const showDirectionsButton = computed(() => props.values.showDirectionsButton !== false)
const directionsButtonText = computed(() => (props.values.directionsButtonText as string) || 'Apri in Google Maps')

const address = computed(() => (props.event?.address as string) || '')
const location = computed(() => (props.event?.location as string) || '')

const displayAddress = computed(() => address.value || location.value)

const mapsSearchQuery = computed(() => {
    const parts = [address.value, location.value].filter(Boolean)
    return encodeURIComponent(parts.join(', '))
})

const mapsUrl = computed(() =>
    `https://www.google.com/maps/search/?api=1&query=${mapsSearchQuery.value}`,
)

const embedUrl = computed(() =>
    `https://www.google.com/maps?q=${mapsSearchQuery.value}&output=embed`,
)
</script>

<template>
    <section
        v-if="displayAddress"
        class="py-16 px-6"
        aria-labelledby="map-heading"
    >
        <div class="mx-auto max-w-4xl">
            <h2
                id="map-heading"
                class="mb-8 text-center text-3xl font-bold"
                :style="{ color: 'var(--landing-text)' }"
            >
                {{ title }}
            </h2>

            <!-- Embedded map -->
            <div
                class="overflow-hidden"
                :style="{ borderRadius: 'var(--landing-radius)' }"
            >
                <iframe
                    :src="embedUrl"
                    class="h-80 w-full border-0"
                    allowfullscreen
                    loading="lazy"
                    referrerpolicy="no-referrer-when-downgrade"
                    :title="`Mappa - ${displayAddress}`"
                />
            </div>

            <!-- Address text -->
            <p
                class="mt-4 text-center text-base"
                :style="{ color: 'var(--landing-text)', opacity: '0.8' }"
            >
                {{ displayAddress }}
            </p>

            <!-- Directions button -->
            <div
                v-if="showDirectionsButton"
                class="mt-6 text-center"
            >
                <a
                    :href="mapsUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-2 px-6 py-3 text-sm font-bold text-white transition-all hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    :style="{
                        backgroundColor: 'var(--landing-primary)',
                        borderRadius: 'var(--landing-radius)',
                    }"
                >
                    <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    {{ directionsButtonText }}
                </a>
            </div>
        </div>
    </section>
</template>
