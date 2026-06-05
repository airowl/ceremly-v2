<script setup lang="ts">
const { t } = useI18n()
const { isWaitingListMode } = useSiteMode()

const ctaLink = computed(() => isWaitingListMode.value ? '#waiting-list' : '#contact')

const steps = computed(() => [
    {
        number: '01',
        title: t('landing.howItWorks.step1.title'),
        description: t('landing.howItWorks.step1.description'),
        icon: 'i-lucide-file-spreadsheet',
        highlight: t('landing.howItWorks.step1.highlight')
    },
    {
        number: '02',
        title: t('landing.howItWorks.step2.title'),
        description: t('landing.howItWorks.step2.description'),
        icon: 'i-lucide-send',
        highlight: t('landing.howItWorks.step2.highlight')
    },
    {
        number: '03',
        title: t('landing.howItWorks.step3.title'),
        description: t('landing.howItWorks.step3.description'),
        icon: 'i-lucide-gauge',
        highlight: t('landing.howItWorks.step3.highlight')
    }
])

// Animation control
const isVisible = ref(false)
const cardsVisible = ref<boolean[]>([false, false, false])

onMounted(() => {
    // Fade in section title
    setTimeout(() => {
        isVisible.value = true
    }, 100)

    // Staggered card animations
    steps.value.forEach((_, index) => {
        setTimeout(() => {
            cardsVisible.value[index] = true
        }, 300 + index * 150)
    })
})
</script>

<template>
    <UPageSection id="howItWorks" :title="t('landing.howItWorks.title')" :description="t('landing.howItWorks.subtitle')"
        :ui="{
            container: 'max-w-7xl mx-auto',
            title: 'text-4xl lg:text-5xl font-bold text-center',
            description: 'text-lg lg:text-xl text-center text-gray-600 dark:text-gray-400 mt-6 max-w-3xl mx-auto'
        }" :class="[
            'py-24 bg-gray-50 dark:bg-gray-900/50 relative overflow-hidden',
            'transition-all duration-700',
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        ]">
        <!-- Decorative gradient orbs -->
        <div class="absolute inset-0 overflow-hidden pointer-events-none">
            <div
                class="absolute -top-40 -right-40 w-96 h-96 bg-primary-500/5 rounded-full blur-3xl animate-pulse-slow" />
            <div class="absolute -bottom-40 -left-40 w-96 h-96 bg-primary-500/5 rounded-full blur-3xl animate-pulse-slow"
                style="animation-delay: 1s;" />
        </div>

        <div class="mt-16 space-y-8 lg:space-y-0 lg:grid lg:grid-cols-3 lg:gap-8 relative">
            <div v-for="(step, index) in steps" :key="index" :class="[
                'relative group transition-all duration-700 ease-out',
                cardsVisible[index] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
            ]">
                <!-- Animated Connector Line -->
                <div v-if="index < steps.length - 1" :class="[
                    'hidden lg:block absolute top-20 left-full w-full h-0.5 -translate-y-1/2 z-0',
                    'bg-linear-to-r from-primary-500/50 via-primary-400/30 to-transparent',
                    'transition-all duration-700',
                    cardsVisible[index + 1] ? 'scale-x-100' : 'scale-x-0'
                ]" style="transform-origin: left;" aria-hidden="true">
                    <!-- Animated dot -->
                    <div
                        class="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-primary-500 rounded-full animate-pulse" />
                </div>

                <UCard :class="[
                    'h-full transition-all duration-500 ease-out',
                    'hover:shadow-2xl hover:shadow-primary-500/10 hover:-translate-y-2',
                    'hover:border-primary-200 dark:hover:border-primary-800',
                    'transform-gpu will-change-transform',
                    'before:absolute before:inset-0 before:rounded-lg before:bg-linear-to-br',
                    'before:from-primary-500/0 before:to-primary-500/0',
                    'hover:before:from-primary-500/5 hover:before:to-transparent',
                    'before:transition-all before:duration-500 before:opacity-0 hover:before:opacity-100'
                ]" :ui="{
                        body: 'p-8 space-y-6 relative z-10'
                    }">
                    <!-- Step Number & Icon -->
                    <div class="flex items-start justify-between">
                        <div :class="[
                            'flex items-center justify-center w-16 h-16 rounded-2xl',
                            'bg-primary-100 dark:bg-primary-900/20',
                            'transition-all duration-500 ease-out transform-gpu',
                            'group-hover:bg-primary-200 dark:group-hover:bg-primary-900/40',
                            'group-hover:scale-110 group-hover:rotate-3',
                            'group-hover:shadow-lg group-hover:shadow-primary-500/20'
                        ]">
                            <UIcon :name="step.icon" :class="[
                                'w-8 h-8 text-primary-600 dark:text-primary-400',
                                'transition-all duration-500',
                                'group-hover:scale-110 group-hover:-rotate-3'
                            ]" />
                        </div>
                        <div :class="[
                            'text-6xl font-bold leading-none select-none',
                            'text-gray-200 dark:text-gray-800',
                            'transition-all duration-500',
                            'group-hover:text-gray-300 dark:group-hover:text-gray-700',
                            'group-hover:scale-105'
                        ]">
                            {{ step.number }}
                        </div>
                    </div>

                    <!-- Step Title -->
                    <div class="space-y-3">
                        <h3 :class="[
                            'text-2xl font-bold text-gray-900 dark:text-white',
                            'transition-colors duration-300',
                            'group-hover:text-primary-700 dark:group-hover:text-primary-300'
                        ]">
                            {{ step.title }}
                        </h3>
                        <p
                            class="text-base text-gray-600 dark:text-gray-400 leading-relaxed transition-colors duration-300 group-hover:text-gray-700 dark:group-hover:text-gray-300">
                            {{ step.description }}
                        </p>
                    </div>

                    <!-- Highlight/Result -->
                    <div :class="[
                        'flex items-start gap-3 pt-4',
                        'border-t border-gray-200 dark:border-gray-700',
                        'transition-all duration-300',
                        'group-hover:border-primary-300 dark:group-hover:border-primary-700'
                    ]">
                        <div :class="[
                            'shrink-0 mt-0.5 transition-all duration-500',
                            'group-hover:translate-x-1 group-hover:scale-110'
                        ]">
                            <UIcon name="i-lucide-arrow-right" class="w-5 h-5 text-primary-600 dark:text-primary-400" />
                        </div>
                        <p
                            class="text-sm font-medium text-gray-700 dark:text-gray-300 leading-relaxed transition-colors duration-300">
                            {{ step.highlight }}
                        </p>
                    </div>

                    <!-- Hover glow effect -->
                    <div :class="[
                        'absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100',
                        'transition-opacity duration-500',
                        'bg-linear-to-br from-primary-500/5 via-transparent to-transparent',
                        'pointer-events-none'
                    ]" aria-hidden="true" />
                </UCard>
            </div>
        </div>

        <!-- CTA Button -->
        <div :class="[
            'mt-12 flex justify-center transition-all duration-700 delay-500',
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        ]">
            <UButton :to="ctaLink" size="xl" :class="[
                'group relative overflow-hidden',
                'transition-all duration-300 ease-out transform-gpu',
                'hover:scale-105 hover:shadow-lg hover:shadow-primary/25',
                'active:scale-95'
            ]">
                <span class="relative z-10 transition-transform duration-300 group-hover:translate-x-1">
                    {{ t('landing.howItWorks.cta') }}
                </span>
                <UIcon name="i-lucide-arrow-right"
                    class="relative z-10 w-5 h-5 ml-2 transition-transform duration-300 group-hover:translate-x-1" />
                <div
                    class="absolute inset-0 bg-linear-to-r from-primary-600 to-primary-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </UButton>
        </div>
    </UPageSection>
</template>

<style scoped>
@keyframes pulse-slow {

    0%,
    100% {
        opacity: 0.3;
        transform: scale(1);
    }

    50% {
        opacity: 0.5;
        transform: scale(1.05);
    }
}

.animate-pulse-slow {
    animation: pulse-slow 8s ease-in-out infinite;
}

/* Smooth hardware acceleration */
.transform-gpu {
    transform: translateZ(0);
    backface-visibility: hidden;
    perspective: 1000px;
}

/* Prevent layout shift during animations */
.will-change-transform {
    will-change: transform, box-shadow;
}
</style>
