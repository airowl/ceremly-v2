<script setup lang="ts">
// Sito pubblico → Per chi → Lauree. Pagina sottile: SEO + corpo condiviso.
import CerUseCase from '~/components/ceremly/CerUseCase.vue'

definePageMeta({ layout: 'public-site', auth: false })

const { t } = useI18n()
const runtimeConfig = useRuntimeConfig()
const baseUrl = ((runtimeConfig.public.baseURL as string) || '').replace(/\/$/, '')

const seoTitle = t('ceremly.site.usecases.lauree.seoTitle')
const seoDescription = t('ceremly.site.usecases.lauree.seoDescription')
useSeoMeta({
    title: seoTitle,
    description: seoDescription,
    ogTitle: seoTitle,
    ogDescription: seoDescription,
    ogImage: `${baseUrl}/ogImage-it.png`,
    ogType: 'website',
})
</script>

<template>
    <CerUseCase id="lauree" />
</template>
