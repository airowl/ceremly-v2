<script setup lang="ts">
// Public site → For whom → Wedding planner. Thin page: SEO + shared body.
import CerUseCase from '~/components/ceremly/CerUseCase.vue'

definePageMeta({ layout: 'public-site', auth: false })

const { t, locale } = useI18n()
const runtimeConfig = useRuntimeConfig()
const baseUrl = ((runtimeConfig.public.baseURL as string) || '').replace(/\/$/, '')

const seoTitle = t('ceremly.site.usecases.planner.seoTitle')
const seoDescription = t('ceremly.site.usecases.planner.seoDescription')
useSeoMeta({
    title: seoTitle,
    description: seoDescription,
    ogTitle: seoTitle,
    ogDescription: seoDescription,
    ogImage: () => `${baseUrl}/og/wedding-planner-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
    twitterImage: () => `${baseUrl}/og/wedding-planner-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
    ogType: 'website',
})
useAltHreflang()
</script>

<template>
    <CerUseCase id="planner" />
</template>
