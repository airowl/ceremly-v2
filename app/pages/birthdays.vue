<script setup lang="ts">
// Public site → For whom → Birthdays. Thin page: SEO + shared body.
import CerUseCase from '~/components/ceremly/CerUseCase.vue'

definePageMeta({ layout: 'public-site', auth: false })

const { t, locale } = useI18n()
const runtimeConfig = useRuntimeConfig()
const baseUrl = ((runtimeConfig.public.baseURL as string) || '').replace(/\/$/, '')

const seoTitle = t('ceremly.site.usecases.compleanni.seoTitle')
const seoDescription = t('ceremly.site.usecases.compleanni.seoDescription')
useSeoMeta({
    titleTemplate: '',
    title: seoTitle,
    description: seoDescription,
    ogTitle: seoTitle,
    ogDescription: seoDescription,
    ogImage: () => `${baseUrl}/og/birthdays-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
    twitterImage: () => `${baseUrl}/og/birthdays-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
    ogType: 'website',
})
useAltHreflang()
</script>

<template>
    <CerUseCase id="compleanni" />
</template>
