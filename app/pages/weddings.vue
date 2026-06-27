<script setup lang="ts">
// Sito pubblico → Per chi → Matrimoni. Pagina sottile: SEO + corpo condiviso.
import CerUseCase from '~/components/ceremly/CerUseCase.vue'

definePageMeta({ layout: 'public-site', auth: false })

const { t, locale } = useI18n()
const runtimeConfig = useRuntimeConfig()
const baseUrl = ((runtimeConfig.public.baseURL as string) || '').replace(/\/$/, '')

const seoTitle = t('ceremly.site.usecases.matrimoni.seoTitle')
const seoDescription = t('ceremly.site.usecases.matrimoni.seoDescription')
useSeoMeta({
    title: seoTitle,
    description: seoDescription,
    ogTitle: seoTitle,
    ogDescription: seoDescription,
    ogImage: () => `${baseUrl}/og/weddings-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
    twitterImage: () => `${baseUrl}/og/weddings-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
    ogType: 'website',
})
</script>

<template>
    <CerUseCase id="matrimoni" />
</template>
