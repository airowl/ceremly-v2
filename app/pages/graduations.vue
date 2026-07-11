<script setup lang="ts">
// Public site → For whom → Graduations. Thin page: SEO + shared body.
import CerUseCase from '~/components/ceremly/CerUseCase.vue'

definePageMeta({ layout: 'public-site', auth: false })

const { t, locale } = useI18n()
const runtimeConfig = useRuntimeConfig()
const baseUrl = ((runtimeConfig.public.baseURL as string) || '').replace(/\/$/, '')

const seoTitle = t('ceremly.site.usecases.lauree.seoTitle')
const seoDescription = t('ceremly.site.usecases.lauree.seoDescription')
useSeoMeta({
    titleTemplate: '',
    title: seoTitle,
    description: seoDescription,
    ogTitle: seoTitle,
    ogDescription: seoDescription,
    ogImage: () => `${baseUrl}/og/graduations-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
    twitterImage: () => `${baseUrl}/og/graduations-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
    ogType: 'website',
})
</script>

<template>
    <CerUseCase id="lauree" />
</template>
