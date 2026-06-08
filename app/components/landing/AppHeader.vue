<script setup lang="ts">
const { t, locale, setLocale } = useI18n()
const { shouldShowAuthLinks } = useSiteMode()
const route = useRoute()
const appName = computed(() => useRuntimeConfig().public.appName || '')

const isLandingPage = computed(() => route.path === '/' || route.path === '/en')

function scrollToWaitlist() {
    if (isLandingPage.value) {
        document.getElementById('waitlist-hero')?.scrollIntoView({ behavior: 'smooth' })
    } else {
        navigateTo('/#waitlist-hero')
    }
}
</script>

<template>
    <nav class="sticky top-0 z-50 w-full border-b border-primary-200 bg-[#FAF9F6]/80 backdrop-blur-md">
        <div class="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 lg:px-8">
            <NuxtLink to="/" class="flex items-center gap-2">
                <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500 text-white">
                    <span class="material-symbols-outlined">mark_email_read</span>
                </div>
                <span class="text-xl font-bold tracking-tight">{{ appName }}</span>
            </NuxtLink>

            <div class="hidden items-center gap-8 md:flex">
                <a class="text-sm font-medium hover:text-primary-500 transition-colors" :href="isLandingPage ? '#features' : '/#features'">{{ t('landing.nav.features') }}</a>
                <a class="text-sm font-medium hover:text-primary-500 transition-colors" :href="isLandingPage ? '#pricing' : '/#pricing'">{{ t('landing.nav.pricing') }}</a>
                <NuxtLink class="text-sm font-medium hover:text-primary-500 transition-colors" to="/blogs">{{ t('landing.nav.blog') }}</NuxtLink>
            </div>

            <div class="flex items-center gap-3">
                <div class="hidden items-center gap-1 text-sm font-medium text-primary-700 md:flex">
                    <span class="cursor-pointer" :class="locale.startsWith('it') ? 'text-primary-900 font-bold' : 'hover:text-primary-900'" @click="setLocale('it')">IT</span>
                    <span class="select-none text-primary-300">/</span>
                    <span class="cursor-pointer" :class="!locale.startsWith('it') ? 'text-primary-900 font-bold' : 'hover:text-primary-900'" @click="setLocale('en')">EN</span>
                </div>

                <ClientOnly>
                    <NuxtLink v-if="shouldShowAuthLinks" to="/login" class="hidden h-10 rounded-lg bg-primary-200 px-5 text-sm font-bold text-primary-900 hover:bg-primary-300 sm:flex items-center transition-colors">
                        {{ $t('common.signIn') }}
                    </NuxtLink>
                </ClientOnly>

                <button class="h-10 rounded-lg bg-primary-500 px-5 text-sm font-bold text-white shadow-lg shadow-primary-500/25 hover:bg-primary-600 transition-all" @click="scrollToWaitlist">
                    {{ t('landing.nav.getStarted') }}
                </button>
            </div>
        </div>
    </nav>
</template>
