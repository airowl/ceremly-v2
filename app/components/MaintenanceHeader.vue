<script setup lang="ts">
const config = useRuntimeConfig()
const localePath = useLocalePath()

const contactMailto = computed(() => `mailto:${config.public.appContactEmail || ''}`)
</script>

<template>
    <UHeader class="border-b border-gray-200 dark:border-gray-800">
        <template #left>
            <NuxtLink :to="localePath('/')" class="flex items-center gap-3 group">
                <LandingAppLogo class="w-auto h-8 shrink-0 transition-transform group-hover:scale-105" />
                <div class="flex flex-col">
                    <h1 class="text-xl font-bold text-gray-900 dark:text-white">
                        {{ config.public.appName }}
                    </h1>
                    <span class="text-xs text-gray-500 dark:text-gray-400">
                        {{ $t('maintenance.badge') }}
                    </span>
                </div>
            </NuxtLink>
        </template>

        <template #right>
            <!-- Language Switcher -->
            <ClientOnly>
                <UButton
                    icon="i-heroicons-language"
                    color="neutral"
                    variant="ghost"
                    :to="localePath('/', $i18n.locale === 'it' ? 'en' : 'it')"
                    :title="$i18n.locale === 'it' ? 'Switch to English' : 'Passa all\'italiano'"
                >
                    {{ $i18n.locale === 'it' ? 'EN' : 'IT' }}
                </UButton>

                <!-- Contact Button -->
                <UButton
                    icon="i-heroicons-envelope"
                    color="neutral"
                    variant="ghost"
                    :to="contactMailto"
                    external
                    class="hidden sm:inline-flex"
                >
                    {{ $t('maintenance.cta.contact') }}
                </UButton>

                <UButton
                    icon="i-heroicons-envelope"
                    color="neutral"
                    variant="ghost"
                    :to="contactMailto"
                    external
                    class="sm:hidden"
                />
            </ClientOnly>
        </template>
    </UHeader>
</template>
