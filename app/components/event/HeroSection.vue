<script setup lang="ts">
import type { LandingSettings } from '~~/shared/schemas/landing'

const props = defineProps<{
    values: Record<string, unknown>
    settings: LandingSettings
    event?: Record<string, unknown>
}>()

const title = computed(() => (props.values.title as string) || '')
const subtitle = computed(() => (props.values.subtitle as string) || '')
const backgroundImage = computed(() => (props.values.backgroundImage as string) || '')
const overlayOpacity = computed(() => (props.values.overlayOpacity as number) ?? 40)
const showDate = computed(() => props.values.showDate !== false)
const height = computed(() => (props.values.height as string) || 'large')

const heightClass = computed(() => {
    switch (height.value) {
        case 'small': return 'min-h-[40vh]'
        case 'medium': return 'min-h-[60vh]'
        case 'large': return 'min-h-[80vh]'
        case 'full': return 'min-h-screen'
        default: return 'min-h-[80vh]'
    }
})

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
</script>

<template>
    <section
        :class="[heightClass, 'relative flex items-center justify-center overflow-hidden']"
        role="banner"
    >
        <!-- Background image -->
        <div
            v-if="backgroundImage"
            class="absolute inset-0 bg-cover bg-center bg-no-repeat"
            :style="{ backgroundImage: `url(${backgroundImage})` }"
            aria-hidden="true"
        />

        <!-- Overlay -->
        <div
            v-if="backgroundImage"
            class="absolute inset-0"
            :style="{ backgroundColor: `rgba(0, 0, 0, ${overlayOpacity / 100})` }"
            aria-hidden="true"
        />

        <!-- Gradient fallback when no image -->
        <div
            v-else
            class="absolute inset-0"
            :style="{
                background: `linear-gradient(135deg, var(--landing-primary) 0%, var(--landing-secondary) 100%)`,
                opacity: 0.1,
            }"
            aria-hidden="true"
        />

        <!-- Content -->
        <div class="relative z-10 mx-auto max-w-4xl px-6 py-16 text-center">
            <h1
                class="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl"
                :class="backgroundImage ? 'text-white' : ''"
                :style="!backgroundImage ? { color: 'var(--landing-text)' } : undefined"
            >
                {{ title }}
            </h1>

            <p
                v-if="subtitle"
                class="mx-auto mt-6 max-w-2xl text-lg sm:text-xl"
                :class="backgroundImage ? 'text-white/90' : ''"
                :style="!backgroundImage ? { color: 'var(--landing-text)', opacity: '0.8' } : undefined"
            >
                {{ subtitle }}
            </p>

            <p
                v-if="formattedDate"
                class="mt-8 inline-flex items-center gap-2 rounded-full px-6 py-2 text-sm font-medium capitalize"
                :class="backgroundImage
                    ? 'bg-white/20 text-white backdrop-blur-sm'
                    : 'bg-white/60'"
                :style="!backgroundImage ? { color: 'var(--landing-primary)' } : undefined"
            >
                <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></svg>
                {{ formattedDate }}
            </p>
        </div>
    </section>
</template>
