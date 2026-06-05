<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'

const { t } = useI18n()
const { isWaitingListMode } = useSiteMode()

const isVisible = ref(false)

const primaryCta = computed<ButtonProps>(() => ({
    label: t('landing.hero.getStarted'),
    to: isWaitingListMode.value ? '#waiting-list' : '#contact',
    color: 'primary',
    size: 'xl',
    icon: 'i-lucide-arrow-right',
    trailing: true
}))

const secondaryCta = computed<ButtonProps>(() => ({
    label: t('landing.hero.learnMore'),
    to: '#',
    color: 'neutral',
    variant: 'outline',
    size: 'xl',
    icon: 'i-lucide-play-circle'
}))

onMounted(() => {
    setTimeout(() => {
        isVisible.value = true
    }, 100)
})
</script>

<template>
    <UPageHero class="relative overflow-hidden">
        <template #top>
            <LandingHeroBackground />
        </template>

        <template #headline>
            <span
                class="transition-all duration-700 ease-out delay-75"
                :class="isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'"
            >
                {{ t('landing.hero.headline') }}
            </span>
        </template>

        <template #description>
            <span
                class="transition-all duration-700 ease-out delay-100"
                :class="isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'"
            >
                {{ t('landing.hero.subtitle') }}
            </span>
        </template>

        <template #title>
            <span
                class="block transition-all duration-700 ease-out"
                :class="isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'"
            >
                {{ t('landing.hero.title1') }}
            </span>
            <span
                class="text-primary block transition-all duration-700 ease-out delay-150"
                :class="isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'"
            >
                {{ t('landing.hero.title2') }}
            </span>
        </template>

        <template #footer>
            <div
                class="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8 transition-all duration-700 ease-out delay-300"
                :class="isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'"
            >
                <UButton
                    v-bind="primaryCta"
                    class="group relative overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/25 active:scale-95"
                >
                    <span class="relative z-10 transition-transform duration-300 group-hover:translate-x-1">
                        {{ primaryCta.label }}
                    </span>
                    <div class="absolute inset-0 bg-linear-to-r from-primary-600 to-primary-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </UButton>
                <!-- <UButton
                    v-bind="secondaryCta"
                    class="group transition-all duration-300 hover:scale-105 hover:shadow-md hover:border-primary/50 active:scale-95"
                >
                    <span class="transition-colors duration-300 group-hover:text-primary">
                        {{ secondaryCta.label }}
                    </span>
                </UButton> -->
            </div>

            <p
                class="text-sm text-muted-foreground text-center mt-6 max-w-md mx-auto transition-all duration-700 ease-out delay-500"
                :class="isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'"
            >
                {{ t('landing.hero.microProof') }}
            </p>
        </template>
    </UPageHero>
</template>

<style scoped>
/* Animazione smooth per i pulsanti */
@keyframes shimmer {
    0% {
        background-position: -200% 0;
    }
    100% {
        background-position: 200% 0;
    }
}

.group:hover {
    animation: subtle-pulse 2s ease-in-out infinite;
}

@keyframes subtle-pulse {
    0%, 100% {
        transform: scale(1.05);
    }
    50% {
        transform: scale(1.07);
    }
}
</style>
