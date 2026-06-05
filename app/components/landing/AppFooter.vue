<script setup lang="ts">
const { t, locale, setLocale } = useI18n()
</script>

<template>
    <footer class="bg-cornsilk-50 border-t border-primary-200">
        <div class="mx-auto max-w-7xl px-6 py-12 lg:px-8">
            <div class="flex flex-col md:flex-row justify-between items-center gap-6">
                <NuxtLink to="/" class="flex items-center gap-2">
                    <div class="flex h-6 w-6 items-center justify-center rounded bg-primary-500 text-white">
                        <span class="material-symbols-outlined text-sm">mark_email_read</span>
                    </div>
                    <span class="text-lg font-bold">Ceremly</span>
                </NuxtLink>

                <div class="flex flex-wrap justify-center gap-8">
                    <NuxtLink to="/legal/privacy" class="text-sm leading-6 text-gray-600 hover:text-gray-900">{{ t('landing.landingFooter.privacy') }}</NuxtLink>
                    <NuxtLink to="/legal/tos" class="text-sm leading-6 text-gray-600 hover:text-gray-900">{{ t('landing.landingFooter.terms') }}</NuxtLink>
                    <NuxtLink to="/blogs" class="text-sm leading-6 text-gray-600 hover:text-gray-900">{{ t('landing.landingFooter.blog') }}</NuxtLink>
                    <a href="#" class="text-sm leading-6 text-gray-600 hover:text-gray-900">{{ t('landing.landingFooter.contacts') }}</a>
                </div>

                <div class="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1">
                    <span class="material-symbols-outlined text-xs text-gray-500">language</span>
                    <select
                        :value="locale"
                        class="bg-transparent text-sm text-gray-600 outline-none border-none p-0 cursor-pointer"
                        @change="setLocale(($event.target as HTMLSelectElement).value as 'it' | 'en')"
                    >
                        <option value="it">Italiano</option>
                        <option value="en">English</option>
                    </select>
                </div>
            </div>

            <div class="mt-8 border-t border-gray-100 pt-8 text-center md:text-left">
                <p class="text-xs text-gray-500">&copy; {{ new Date().getFullYear() }} {{ t('landing.landingFooter.copyright') }}</p>
            </div>
        </div>
    </footer>
</template>
