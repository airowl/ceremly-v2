<template>
    <UContainer class="py-24 sm:py-32">
        <div class="text-center mb-16 sm:mb-20">
            <!-- Section Header -->
            <div
ref="headerRef" class="transition-all duration-1000 ease-out"
                :class="headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'">
                <UBadge :label="$t('landing.why.badge')" color="primary" variant="subtle" size="lg" class="mb-4" />
                <h2 class="text-3xl font-bold tracking-tight sm:text-4xl">
                    {{ $t('landing.why.title') }}
                </h2>
            </div>
        </div>

        <!-- Benefits Grid using UCard -->
        <div class="grid grid-cols-1 gap-8 lg:grid-cols-3 mb-24">
            <div
v-for="(benefit, index) in benefits" :key="index" ref="benefitRefs"
                class="transition-all duration-500 ease-out"
                :class="benefitVisibility[index] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'">
                <UCard
:icon="benefit.icon"
                    class="h-full hover:shadow-lg group hover:-translate-y-1 transition-all duration-300">
                    <template #header>
                        <div class="flex items-center gap-3">
                            <div
                                class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-500 dark:bg-primary-400 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3">
                                <UIcon
:name="benefit.icon"
                                    class="size-6 text-white transition-transform duration-300 group-hover:scale-110" />
                            </div>
                            <h3
                                class="font-semibold text-lg transition-colors duration-300 group-hover:text-primary-500">
                                {{ $t(benefit.titleKey) }}
                            </h3>
                        </div>
                    </template>

                    <p
                        class="text-gray-600 dark:text-gray-400 transition-colors duration-300 group-hover:text-gray-900 dark:group-hover:text-gray-300">
                        {{ $t(benefit.descriptionKey) }}
                    </p>
                </UCard>
            </div>
        </div>

        <!-- Mission Statement using UCard -->
        <div
ref="missionRef" class="max-w-4xl mx-auto transition-all duration-1000 ease-out"
            :class="missionVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'">
            <UCard
                class="bg-linear-to-br from-primary-50 to-primary-100 dark:from-gray-800 dark:to-gray-900 transition-all duration-500 hover:shadow-2xl hover:scale-[1.02]">
                <div class="text-center py-8">
                    <UBadge
:label="$t('landing.why.mission.badge')" color="primary" variant="solid" size="md"
                        class="mb-6 uppercase tracking-wide" />
                    <p class="text-lg leading-8 font-medium">
                        {{ $t('landing.why.mission.description') }}
                    </p>
                </div>
            </UCard>
        </div>
    </UContainer>
</template>

<script setup lang="ts">
const { t: $t } = useI18n()

// Refs for intersection observer
const headerRef = ref<HTMLElement | null>(null)
const missionRef = ref<HTMLElement | null>(null)
const benefitRefs = ref<HTMLElement[]>([])

// Visibility states
const headerVisible = ref(false)
const missionVisible = ref(false)
const benefitVisibility = ref<boolean[]>([false, false, false])

// Benefits data
const benefits = [
    {
        icon: 'i-lucide-layers',
        titleKey: 'landing.why.benefits.hub.title',
        descriptionKey: 'landing.why.benefits.hub.description'
    },
    {
        icon: 'i-lucide-clock',
        titleKey: 'landing.why.benefits.efficiency.title',
        descriptionKey: 'landing.why.benefits.efficiency.description'
    },
    {
        icon: 'i-lucide-smartphone',
        titleKey: 'landing.why.benefits.accessibility.title',
        descriptionKey: 'landing.why.benefits.accessibility.description'
    }
]

// Intersection Observer setup
onMounted(() => {
    const options = {
        threshold: 0.2,
        rootMargin: '0px 0px -50px 0px'
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                if (entry.target === headerRef.value) {
                    headerVisible.value = true
                } else if (entry.target === missionRef.value) {
                    missionVisible.value = true
                } else {
                    // Check benefit refs
                    const index = benefitRefs.value.findIndex(ref => ref === entry.target)
                    if (index !== -1) {
                        setTimeout(() => {
                            benefitVisibility.value[index] = true
                        }, index * 150) // Stagger animation
                    }
                }
            }
        })
    }, options)

    // Observe elements
    if (headerRef.value) observer.observe(headerRef.value)
    if (missionRef.value) observer.observe(missionRef.value)

    // Observe benefit wrapper divs
    benefitRefs.value.forEach(ref => {
        if (ref) observer.observe(ref)
    })

    // Cleanup
    onUnmounted(() => {
        observer.disconnect()
    })
})
</script>
