<script setup lang="ts">
const { t } = useI18n()
const { isWaitingListMode } = useSiteMode()

const ctaLink = computed(() => isWaitingListMode.value ? '#waiting-list' : '#contact')

const features = ref([
    {
        icon: 'i-lucide-mail-check',
        title: t('landing.trust.emailDelivery.title'),
        description: t('landing.trust.emailDelivery.description'),
        benefits: [
            t('landing.trust.emailDelivery.benefit1'),
            t('landing.trust.emailDelivery.benefit2')
        ]
    },
    {
        icon: 'i-lucide-shield-check',
        title: t('landing.trust.privacy.title'),
        description: t('landing.trust.privacy.description'),
        benefits: [
            t('landing.trust.privacy.benefit1'),
            t('landing.trust.privacy.benefit2')
        ]
    }
])
</script>

<template>
    <section class="py-16 sm:py-24 lg:py-32">
        <UContainer>
            <!-- Header -->
            <div class="text-center max-w-3xl mx-auto mb-16 sm:mb-20 lg:mb-24">
                <div class="inline-block animate-fade-in-up" style="animation-delay: 0.1s">
                    <UBadge color="primary" variant="subtle" size="lg" class="mb-6">
                        <span class="flex items-center gap-2">
                            <UIcon name="i-lucide-shield" class="w-4 h-4" />
                            {{ t('landing.trust.badge') }}
                        </span>
                    </UBadge>
                </div>

                <h2
class="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-6 animate-fade-in-up"
                    style="animation-delay: 0.2s">
                    {{ t('landing.trust.title') }}
                </h2>

                <p
class="text-lg sm:text-xl text-gray-600 dark:text-gray-400 animate-fade-in-up"
                    style="animation-delay: 0.3s">
                    {{ t('landing.trust.subtitle') }}
                </p>
            </div>

            <!-- Features Grid -->
            <div class="grid lg:grid-cols-2 gap-8 lg:gap-12">
                <div
v-for="(feature, index) in features" :key="index" class="group relative animate-fade-in-up"
                    :style="`animation-delay: ${0.4 + index * 0.1}s`">

                    <!-- Card -->
                    <UCard
                        class="h-full transition-all duration-500 hover:shadow-2xl hover:-translate-y-2 border-2 border-transparent hover:border-primary-500/20">
                        <div class="space-y-6">
                            <!-- Icon -->
                            <div class="relative inline-flex">
                                <div
                                    class="absolute inset-0 bg-primary-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"/>
                                <div
                                    class="relative flex items-center justify-center w-14 h-14 rounded-xl bg-primary-500/10 text-primary-600 dark:text-primary-400 group-hover:bg-primary-500 group-hover:text-white transition-all duration-500 group-hover:scale-110 group-hover:rotate-6">
                                    <UIcon :name="feature.icon" class="w-7 h-7" />
                                </div>
                            </div>

                            <!-- Content -->
                            <div class="space-y-4">
                                <h3
                                    class="text-2xl font-bold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors duration-300">
                                    {{ feature.title }}
                                </h3>

                                <p class="text-base text-gray-600 dark:text-gray-400 leading-relaxed">
                                    {{ feature.description }}
                                </p>

                                <!-- Benefits List -->
                                <ul class="space-y-3 pt-2">
                                    <li
v-for="(benefit, bIndex) in feature.benefits" :key="bIndex"
                                        class="flex items-start gap-3 text-gray-700 dark:text-gray-300 group/item">
                                        <div class="shrink-0 mt-1">
                                            <div
                                                class="w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center group-hover/item:bg-primary-500 group-hover/item:scale-125 transition-all duration-300">
                                                <UIcon
name="i-lucide-check"
                                                    class="w-3 h-3 text-primary-600 dark:text-primary-400 group-hover/item:text-white" />
                                            </div>
                                        </div>
                                        <span class="text-sm sm:text-base">{{ benefit }}</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </UCard>

                    <!-- Decorative gradient (visible on hover) -->
                    <div
                        class="absolute -inset-px rounded-lg bg-linear-to-r from-primary-500 to-primary-600 opacity-0 group-hover:opacity-10 blur transition-opacity duration-500 -z-10"/>
                </div>
            </div>

            <!-- Bottom CTA (Optional) -->
            <div class="mt-16 sm:mt-20 text-center animate-fade-in-up" style="animation-delay: 0.7s">
                <p class="text-gray-600 dark:text-gray-400 mb-6">
                    {{ t('landing.trust.cta.description') }}
                </p>
                <div class="flex flex-col sm:flex-row gap-4 justify-center">
                    <UButton
:to="ctaLink"
                        color="primary" size="lg" trailing-icon="i-lucide-arrow-right"
                        class="group relative overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/25 active:scale-95">
                        <span class="relative z-10 transition-transform duration-300 group-hover:translate-x-1">
                            {{ t('landing.trust.cta.primary') }}
                        </span>
                        <div
                            class="absolute inset-0 bg-linear-to-r from-primary-600 to-primary-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    </UButton>
                    <UButton
color="neutral" variant="subtle" size="lg" trailing-icon="i-lucide-info"
                        :to="ctaLink"
                        class="group relative overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-neutral/25 active:scale-95">
                        <span class="relative z-10 transition-transform duration-300 group-hover:translate-x-1">
                            {{ t('landing.trust.cta.secondary') }}
                        </span>
                        <div
                            class="absolute inset-0 bg-neutral-200 dark:bg-neutral-700 opacity-0 group-hover:opacity-50 transition-opacity duration-300" />
                    </UButton>
                </div>
            </div>
        </UContainer>
    </section>
</template>

<style scoped>
@keyframes fade-in-up {
    from {
        opacity: 0;
        transform: translateY(20px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.animate-fade-in-up {
    animation: fade-in-up 0.8s ease-out forwards;
    opacity: 0;
}
</style>
