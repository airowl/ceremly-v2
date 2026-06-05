<script setup lang="ts">
import type { LandingSettings } from '~~/shared/schemas/landing'

const props = defineProps<{
    values: Record<string, unknown>
    settings: LandingSettings
    event?: Record<string, unknown>
}>()

const showDate = computed(() => props.values.showDate !== false)
const showTime = computed(() => props.values.showTime !== false)
const locationName = computed(() => (props.values.locationName as string) || (props.event?.location as string) || '')
const address = computed(() => (props.values.address as string) || (props.event?.address as string) || '')
const dressCode = computed(() => (props.values.dressCode as string) || '')
const additionalInfo = computed(() => (props.values.additionalInfo as string) || '')
const layout = computed(() => (props.values.layout as string) || 'cards')

const formattedDate = computed(() => {
    if (!showDate.value || !props.event?.date) return ''
    try {
        const date = new Date(props.event.date as string)
        return date.toLocaleDateString('it-IT', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        })
    }
    catch {
        return props.event.date as string
    }
})

const formattedTime = computed(() => {
    if (!showTime.value || !props.event?.time) return ''
    return props.event.time as string
})

interface DetailItem {
    icon: string
    label: string
    value: string
    srLabel: string
}

const details = computed<DetailItem[]>(() => {
    const items: DetailItem[] = []
    if (formattedDate.value) {
        items.push({
            icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
            label: 'Data',
            value: formattedDate.value,
            srLabel: 'Data evento',
        })
    }
    if (formattedTime.value) {
        items.push({
            icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
            label: 'Orario',
            value: formattedTime.value,
            srLabel: 'Orario evento',
        })
    }
    if (locationName.value) {
        items.push({
            icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z',
            label: 'Location',
            value: locationName.value,
            srLabel: 'Location evento',
        })
    }
    if (address.value) {
        items.push({
            icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7',
            label: 'Indirizzo',
            value: address.value,
            srLabel: 'Indirizzo evento',
        })
    }
    if (dressCode.value) {
        items.push({
            icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4',
            label: 'Dress code',
            value: dressCode.value,
            srLabel: 'Dress code',
        })
    }
    return items
})
</script>

<template>
    <section class="py-16 px-6" aria-labelledby="details-heading">
        <div class="mx-auto max-w-4xl">
            <h2
                id="details-heading"
                class="sr-only"
            >
                Dettagli evento
            </h2>

            <!-- Cards layout -->
            <div
                v-if="layout === 'cards'"
                class="grid gap-4 sm:grid-cols-2"
            >
                <div
                    v-for="detail in details"
                    :key="detail.label"
                    class="flex items-start gap-4 rounded-xl border p-5 transition-shadow hover:shadow-md"
                    :style="{
                        borderColor: 'var(--landing-primary)',
                        borderWidth: '1px',
                        borderRadius: 'var(--landing-radius)',
                        backgroundColor: 'var(--landing-bg)',
                    }"
                >
                    <div
                        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                        :style="{ backgroundColor: 'var(--landing-primary)', opacity: '0.15' }"
                    >
                        <svg
                            class="h-5 w-5"
                            :style="{ color: 'var(--landing-primary)' }"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            stroke-width="1.5"
                            aria-hidden="true"
                        >
                            <path stroke-linecap="round" stroke-linejoin="round" :d="detail.icon" />
                        </svg>
                    </div>
                    <div>
                        <p
                            class="text-xs font-semibold uppercase tracking-wider"
                            :style="{ color: 'var(--landing-primary)' }"
                        >
                            {{ detail.label }}
                        </p>
                        <p
                            class="mt-1 text-base font-medium capitalize"
                            :style="{ color: 'var(--landing-text)' }"
                        >
                            {{ detail.value }}
                        </p>
                    </div>
                </div>
            </div>

            <!-- List layout -->
            <ul
                v-else-if="layout === 'list'"
                class="divide-y"
                :style="{ borderColor: 'var(--landing-primary)' }"
                role="list"
            >
                <li
                    v-for="detail in details"
                    :key="detail.label"
                    class="flex items-center gap-4 py-4"
                >
                    <svg
                        class="h-5 w-5 shrink-0"
                        :style="{ color: 'var(--landing-primary)' }"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width="1.5"
                        aria-hidden="true"
                    >
                        <path stroke-linecap="round" stroke-linejoin="round" :d="detail.icon" />
                    </svg>
                    <span class="sr-only">{{ detail.srLabel }}:</span>
                    <span
                        class="text-sm font-semibold uppercase tracking-wider"
                        :style="{ color: 'var(--landing-primary)' }"
                    >
                        {{ detail.label }}:
                    </span>
                    <span
                        class="text-base capitalize"
                        :style="{ color: 'var(--landing-text)' }"
                    >
                        {{ detail.value }}
                    </span>
                </li>
            </ul>

            <!-- Timeline layout -->
            <div v-else-if="layout === 'timeline'" class="relative ml-4 border-l-2 pl-8" :style="{ borderColor: 'var(--landing-primary)' }">
                <div
                    v-for="(detail, idx) in details"
                    :key="detail.label"
                    class="relative pb-8 last:pb-0"
                >
                    <div
                        class="absolute -left-[2.55rem] top-0 flex h-6 w-6 items-center justify-center rounded-full"
                        :style="{ backgroundColor: 'var(--landing-primary)' }"
                    >
                        <svg
                            class="h-3 w-3 text-white"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            stroke-width="2"
                            aria-hidden="true"
                        >
                            <path stroke-linecap="round" stroke-linejoin="round" :d="detail.icon" />
                        </svg>
                    </div>
                    <p
                        class="text-xs font-semibold uppercase tracking-wider"
                        :style="{ color: 'var(--landing-primary)' }"
                    >
                        {{ detail.label }}
                    </p>
                    <p
                        class="mt-1 text-base font-medium capitalize"
                        :style="{ color: 'var(--landing-text)' }"
                    >
                        {{ detail.value }}
                    </p>
                </div>
            </div>

            <!-- Additional info -->
            <p
                v-if="additionalInfo"
                class="mt-8 text-center text-sm leading-relaxed"
                :style="{ color: 'var(--landing-text)', opacity: '0.7' }"
            >
                {{ additionalInfo }}
            </p>
        </div>
    </section>
</template>
