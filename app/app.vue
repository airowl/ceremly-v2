<script setup lang="ts">
import { it, en } from '@nuxt/ui/locale'
const { locale, t } = useI18n()
const appName = computed(() => useRuntimeConfig().public.appName || '')

const uiLocale = computed(() => locale.value === 'it' ? en : it)

const currentLocale = computed(() => locale.value.startsWith('it') ? 'it' : 'en')

useHead({
    meta: [
        { charset: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { key: "theme-color", name: "theme-color", content: "#FAF9F6" },
    ],
    link: [
        { rel: "icon", href: "/favicon.ico" },
    ],
    htmlAttrs: {
        lang: currentLocale,
    },
});

const title = computed(() => t("landing.seo.title"))
const description = computed(() => t("landing.seo.description"))

const ogImagePath = computed(() =>
    locale.value.startsWith('it') ? '/ogImage-it.png' : '/ogImage-en.png',
)

const ogLocale = computed(() => locale.value.startsWith('it') ? 'it_IT' : 'en_US')

useSeoMeta({
    title,
    description,
    ogTitle: () => t("landing.seo.ogTitle"),
    ogDescription: () => t("landing.seo.ogDescription"),
    ogImage: ogImagePath,
    ogType: "website",
    ogLocale: ogLocale,
    twitterImage: ogImagePath,
    twitterCard: "summary_large_image",
    twitterSite: useRuntimeConfig().public.twitterHandle || undefined,
});

useSchemaOrg([
    defineWebSite({
        name: appName.value,
        description: computed(() => t('landing.seo.description')),
        inLanguage: ['it-IT', 'en-US'],
    }),
])
</script>

<template>
    <UApp :locale="uiLocale">
        <NuxtLoadingIndicator color="var(--color-primary-500)" />

        <NuxtLayout>
            <NuxtPage />
        </NuxtLayout>

        <!-- <ClientOnly>
            <LazyUContentSearch :files="files" shortcut="meta_k" :navigation="navigation" :links="links"
                :fuse="{ resultLimit: 42 }" />
        </ClientOnly> -->
    </UApp>
</template>
