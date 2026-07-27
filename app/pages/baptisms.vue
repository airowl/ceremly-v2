<script setup lang="ts">
// Public site → For whom → Baptisms. Thin page: SEO + shared body.
import CerUseCase from '~/components/ceremly/CerUseCase.vue'

definePageMeta({ layout: 'public-site', auth: false })

const { t, locale } = useI18n()
const runtimeConfig = useRuntimeConfig()
const baseUrl = ((runtimeConfig.public.baseURL as string) || '').replace(/\/$/, '')

const seoTitle = t('ceremly.site.usecases.battesimi.seoTitle')
const seoDescription = t('ceremly.site.usecases.battesimi.seoDescription')
useSeoMeta({
    titleTemplate: '',
    title: seoTitle,
    description: seoDescription,
    ogTitle: seoTitle,
    ogDescription: seoDescription,
    ogImage: () => `${baseUrl}/og/baptisms-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
    twitterImage: () => `${baseUrl}/og/baptisms-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
    ogType: 'website',
})
useAltHreflang()

// Breadcrumb structured data (Home › this page). Relative item paths are
// resolved against site.url by nuxt-schema-org.
useSchemaOrg([
    defineBreadcrumb({
        itemListElement: [
            { name: t('blog.article.breadcrumbHome'), item: '/' },
            { name: seoTitle },
        ],
    }),
])
</script>

<template>
    <CerUseCase id="battesimi" />
</template>
