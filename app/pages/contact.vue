<script setup lang="ts">
const { t, locale } = useI18n()
const baseUrl = ((useRuntimeConfig().public.baseURL as string) || '').replace(/\/$/, '')

const title = t('landing.contact.title')
const description = t('landing.contact.description')

useSeoMeta({
    title,
    ogTitle: title,
    description,
    ogDescription: description,
    ogImage: () => `${baseUrl}/og/contact-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
    twitterImage: () => `${baseUrl}/og/contact-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
})
</script>

<template>
    <UPage>
        <UPageBody class="py-12 sm:py-16 lg:py-20">
            <LandingContact />
        </UPageBody>
    </UPage>
</template>
