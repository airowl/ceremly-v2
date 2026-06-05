<script setup lang="ts">
import type { LandingPageData } from '~~/shared/schemas/landing'

definePageMeta({
    layout: false,
    auth: false,
})

const route = useRoute()
const slug = computed(() => route.params.slug as string)

const { data, error } = await useFetch<{
    event: Record<string, unknown>
    registrationPage: LandingPageData | null
}>(`/api/event/${slug.value}`)

if (error.value || !data.value) {
    throw createError({
        statusCode: error.value?.statusCode || 404,
        statusMessage: error.value?.statusMessage || 'Evento non trovato',
        fatal: true,
    })
}

const eventData = computed(() => data.value!.event)
const landingData = computed(() => data.value!.registrationPage)

const settings = computed(() => landingData.value?.settings ?? {
    primaryColor: (eventData.value.primaryColor as string) || '#6366f1',
    secondaryColor: '#10b981',
    backgroundColor: '#ffffff',
    textColor: '#1f2937',
    fontFamily: 'inter' as const,
    borderRadius: 'md' as const,
})

const sections = computed(() => landingData.value?.sections ?? [])

const borderRadiusMap: Record<string, string> = {
    none: '0px',
    sm: '0.25rem',
    md: '0.5rem',
    lg: '1rem',
    full: '9999px',
}

const fontFamilyMap: Record<string, string> = {
    inter: "'Inter', sans-serif",
    playfair: "'Playfair Display', serif",
    montserrat: "'Montserrat', sans-serif",
    lora: "'Lora', serif",
    roboto: "'Roboto', sans-serif",
}

const googleFontUrl = computed(() => {
    const font = settings.value.fontFamily
    const fontName = font.charAt(0).toUpperCase() + font.slice(1)
    const encodedName = fontName === 'Playfair' ? 'Playfair+Display' : fontName
    return `https://fonts.googleapis.com/css2?family=${encodedName}:wght@300;400;500;600;700&display=swap`
})

const cssVars = computed(() => ({
    '--landing-primary': settings.value.primaryColor,
    '--landing-secondary': settings.value.secondaryColor,
    '--landing-bg': settings.value.backgroundColor,
    '--landing-text': settings.value.textColor,
    '--landing-radius': borderRadiusMap[settings.value.borderRadius] || '0.5rem',
    '--landing-font': fontFamilyMap[settings.value.fontFamily] || "'Inter', sans-serif",
}))

useHead({
    title: (eventData.value.name as string) || 'Evento',
    link: [
        { rel: 'stylesheet', href: googleFontUrl.value },
    ],
    meta: [
        { name: 'description', content: `Registrati all'evento ${eventData.value.name}` },
    ],
})

useSeoMeta({
    ogTitle: (eventData.value.name as string) || 'Evento',
    ogDescription: `Registrati all'evento ${eventData.value.name}`,
    ogType: 'website',
})
</script>

<template>
    <div
        class="min-h-screen"
        :style="{
            ...cssVars,
            backgroundColor: 'var(--landing-bg)',
            fontFamily: 'var(--landing-font)',
            color: 'var(--landing-text)',
        }"
    >
        <template v-if="sections.length">
            <EventSectionRenderer
                v-for="section in sections"
                :key="section.id"
                :section="section"
                :settings="settings"
                :slug="slug"
                :event="eventData"
            />
        </template>

        <!-- Fallback when no landing page is configured -->
        <template v-else>
            <EventHeroSection
                :values="{ title: eventData.name, showDate: true, height: 'medium' }"
                :settings="settings"
                :event="eventData"
            />
            <EventDetailsSection
                :values="{ showDate: true, showTime: true, layout: 'cards' }"
                :settings="settings"
                :event="eventData"
            />
            <EventRegistrationFormSection
                :values="{
                    title: 'Registrati all\'evento',
                    showEmail: true,
                    showPhone: true,
                    submitButtonText: 'Registrati',
                    successMessage: 'Registrazione completata con successo!',
                }"
                :settings="settings"
                :slug="slug"
                :event="eventData"
            />
            <EventFooterSection
                :values="{ message: '' }"
                :settings="settings"
            />
        </template>
    </div>
</template>
