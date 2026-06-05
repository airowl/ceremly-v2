<script setup lang="ts">
const { t } = useI18n()

const title = t('landing.contact.title')
const description = t('landing.contact.description')

useSeoMeta({
    title,
    ogTitle: title,
    description,
    ogDescription: description,
})
</script>

<template>
    <UPage>
        <UPageBody class="py-12 sm:py-16 lg:py-20">
            <LandingContact />
        </UPageBody>
    </UPage>
</template>
