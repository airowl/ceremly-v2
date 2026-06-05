<script setup lang="ts">
const { t } = useI18n()

const isVisible = ref(false)

const targetAudience = computed(() => [
    {
        title: t('landing.forWho.planner.title'),
        icon: 'i-lucide-briefcase',
        features: [
            t('landing.forWho.planner.feature1'),
            t('landing.forWho.planner.feature2'),
            t('landing.forWho.planner.feature3')
        ]
    },
    {
        title: t('landing.forWho.couples.title'),
        icon: 'i-lucide-heart',
        features: [
            t('landing.forWho.couples.feature1'),
            t('landing.forWho.couples.feature2'),
            t('landing.forWho.couples.feature3')
        ]
    },
])

onMounted(() => {
    // Trigger fade-in animation after component mounts
    setTimeout(() => {
        isVisible.value = true
    }, 100)
})
</script>

<template>
    <UPageSection
        :title="t('landing.forWho.title')"
        :description="t('landing.forWho.subtitle')"
        :ui="{
            container: 'max-w-7xl mx-auto',
            title: 'text-4xl lg:text-5xl font-bold text-center',
            description: 'text-lg lg:text-xl text-center text-gray-600 dark:text-gray-400 mt-6 max-w-3xl mx-auto'
        }"
        class="py-24"
    >
        <Transition
            name="fade-slide"
            appear
        >
            <div v-if="isVisible" class="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-16">
                <UCard
                    v-for="(audience, index) in targetAudience"
                    :key="index"
                    class="overflow-hidden shadow-xl transition-all duration-500 hover:shadow-2xl hover:-translate-y-2 hover:scale-[1.02] group cursor-pointer card-animate"
                    :style="{ animationDelay: `${index * 150}ms` }"
                    :ui="{
                        body: 'p-8 sm:p-10'
                    }"
                >
                    <div class="flex items-start gap-4 mb-6">
                        <div class="shrink-0">
                            <div class="flex items-center justify-center w-14 h-14 rounded-xl bg-primary-100 dark:bg-primary-900/20 transition-all duration-500 group-hover:scale-110 group-hover:rotate-6 group-hover:bg-primary-200 dark:group-hover:bg-primary-800/30">
                                <UIcon
                                    :name="audience.icon"
                                    class="w-7 h-7 text-primary-600 dark:text-primary-400 transition-all duration-500 group-hover:scale-110"
                                />
                            </div>
                        </div>
                        <div class="flex-1">
                            <h3 class="text-2xl font-bold text-gray-900 dark:text-white transition-colors duration-300 group-hover:text-primary-600 dark:group-hover:text-primary-400">
                                {{ audience.title }}
                            </h3>
                        </div>
                    </div>

                    <ul class="space-y-4">
                        <li
                            v-for="(feature, featureIndex) in audience.features"
                            :key="featureIndex"
                            class="flex items-start gap-3 feature-item transition-all duration-300 hover:translate-x-1"
                            :style="{ animationDelay: `${(index * 150) + (featureIndex * 100)}ms` }"
                        >
                            <div class="shrink-0 mt-1">
                                <UIcon
                                    name="i-lucide-check-circle"
                                    class="w-5 h-5 text-primary-600 dark:text-primary-400 transition-all duration-300 hover:scale-125 hover:rotate-12"
                                />
                            </div>
                            <span class="text-base text-gray-700 dark:text-gray-300 leading-relaxed transition-colors duration-300 hover:text-gray-900 dark:hover:text-white">
                                {{ feature }}
                            </span>
                        </li>
                    </ul>
                </UCard>
            </div>
        </Transition>
    </UPageSection>
</template>

<style scoped>
/* Fade-slide transition for the main container */
.fade-slide-enter-active {
    transition: all 0.6s ease-out;
}

.fade-slide-enter-from {
    opacity: 0;
    transform: translateY(30px);
}

/* Card staggered animation */
@keyframes slideInUp {
    from {
        opacity: 0;
        transform: translateY(40px) scale(0.95);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

.card-animate {
    animation: slideInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) backwards;
}

/* Feature items staggered animation */
@keyframes fadeInLeft {
    from {
        opacity: 0;
        transform: translateX(-20px);
    }
    to {
        opacity: 1;
        transform: translateX(0);
    }
}

.feature-item {
    animation: fadeInLeft 0.6s ease-out backwards;
}

/* Smooth hover transitions */
.group:hover {
    transform-origin: center;
}

/* Add subtle pulse effect on icon hover */
@keyframes pulse-subtle {
    0%, 100% {
        transform: scale(1);
    }
    50% {
        transform: scale(1.05);
    }
}

.group:hover .shrink-0 > div {
    animation: pulse-subtle 2s ease-in-out infinite;
}
</style>
