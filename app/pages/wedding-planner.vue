<script setup lang="ts">
// Sito pubblico → Per chi → Wedding planner. Pagina sottile: SEO + corpo condiviso.
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
</script>

<template>
    <CerUseCase id="planner" />
</template>
