<script setup lang="ts">
const { t } = useI18n()

const features = computed(() => [
    {
        title: t('landing.features.cards.members.title'),
        subtitle: t('landing.features.cards.members.subtitle'),
        description: t('landing.features.cards.members.description'),
        icon: 'i-heroicons-user-group',
    },
    {
        title: t('landing.features.cards.vendors.title'),
        subtitle: t('landing.features.cards.vendors.subtitle'),
        description: t('landing.features.cards.vendors.description'),
        icon: 'i-heroicons-briefcase',
    },
    {
        title: t('landing.features.cards.gallery.title'),
        subtitle: t('landing.features.cards.gallery.subtitle'),
        description: t('landing.features.cards.gallery.description'),
        icon: 'i-heroicons-photo',
    },
    {
        title: t('landing.features.cards.import.title'),
        subtitle: t('landing.features.cards.import.subtitle'),
        description: t('landing.features.cards.import.description'),
        icon: 'i-heroicons-arrow-down-tray',
    },
])

// Stato per gestire le animazioni delle card
const cardRefs = ref<any[]>([])
const isVisible = ref<boolean[]>(new Array(4).fill(false))
const mouseHandlers = new Map<HTMLElement, (e: Event) => void>()
let observer: IntersectionObserver | null = null

// Effetto spotlight che segue il mouse
const handleMouseMove = (event: Event, card: HTMLElement) => {
    if (!(event instanceof MouseEvent)) return
    const rect = card.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * 100
    const y = ((event.clientY - rect.top) / rect.height) * 100
    card.style.setProperty('--mouse-x', `${x}%`)
    card.style.setProperty('--mouse-y', `${y}%`)
}

onMounted(() => {
    nextTick(() => {
        observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    const index = cardRefs.value.findIndex((card) => {
                        const el = card?.$el || card
                        return el === entry.target
                    })
                    if (index !== -1 && entry.isIntersecting) {
                        setTimeout(() => {
                            isVisible.value[index] = true
                        }, index * 150)
                    }
                })
            },
            { threshold: 0.1 }
        )

        cardRefs.value.forEach((card) => {
            if (card) {
                const element = card.$el || card
                if (element instanceof HTMLElement) {
                    observer!.observe(element)
                    const handler = (e: Event) => handleMouseMove(e, element)
                    mouseHandlers.set(element, handler)
                    element.addEventListener('mousemove', handler)
                }
            }
        })
    })
})

onUnmounted(() => {
    observer?.disconnect()
    cardRefs.value.forEach((card) => {
        if (card) {
            const element = card.$el || card
            if (element instanceof HTMLElement) {
                const handler = mouseHandlers.get(element)
                if (handler) {
                    element.removeEventListener('mousemove', handler)
                    mouseHandlers.delete(element)
                }
            }
        }
    })
})
</script>

<template>
    <UPageSection
id="features" :title="$t('landing.features.mainTitle')"
        :description="$t('landing.features.mainDescription')"
        class="scroll-mt-[calc(var(--header-height)+140px+128px+96px)]">
        <UPageGrid class="lg:grid-cols-2 gap-8">
            <UPageCard
v-for="(feature, index) in features" :key="index" :ref="(el) => { if (el) cardRefs[index] = el }"
                :icon="feature.icon" class="feature-card relative overflow-hidden group cursor-default" :class="{
                    'is-visible': isVisible[index]
                }">
                <!-- Sfondo gradiente animato -->
                <div
class="absolute inset-0 bg-linear-to-br from-primary-500/5 via-transparent to-primary-600/5
                           opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                <!-- Effetto luce che segue il mouse -->
                <div
class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style="background: radial-gradient(600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(var(--color-primary-500), 0.1), transparent 40%)" />

                <template #icon>
                    <div class="relative">
                        <!-- Icona con animazione pulse al hover -->
                        <UIcon
:name="feature.icon" class="w-8 h-8 transition-all duration-300
                                   group-hover:scale-110 group-hover:rotate-3
                                   text-primary-500 dark:text-primary-400" />
                        <!-- Ring animato dietro l'icona -->
                        <div
class="absolute inset-0 -z-10 rounded-full bg-primary-500/20
                                   scale-0 group-hover:scale-150 opacity-0 group-hover:opacity-100
                                   transition-all duration-500 blur-md" />
                    </div>
                </template>

                <template #title>
                    <span
class="text-xl font-bold text-gray-900 dark:text-white
                                 transition-colors duration-300
                                 group-hover:text-primary-600 dark:group-hover:text-primary-400
                                 inline-block">
                        {{ feature.title }}
                    </span>
                </template>

                <template #description>
                    <div class="space-y-3 mt-2 relative z-10">
                        <p
class="text-base font-semibold text-primary-600 dark:text-primary-400
                                  transform transition-all duration-300
                                  group-hover:translate-x-1">
                            {{ feature.subtitle }}
                        </p>
                        <p
class="text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-line
                                  transform transition-all duration-300 delay-75">
                            {{ feature.description }}
                        </p>
                    </div>
                </template>

                <!-- Decorazione angolo -->
                <div
class="absolute top-0 right-0 w-20 h-20 transform translate-x-10 -translate-y-10
                            bg-linear-to-br from-primary-400/20 to-transparent rounded-full
                            scale-0 group-hover:scale-100 transition-transform duration-700 blur-2xl" />
            </UPageCard>
        </UPageGrid>
    </UPageSection>
</template>

<style scoped>
.feature-card {
    opacity: 0;
    transform: translateY(2rem);
    transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1),
        box-shadow 0.5s cubic-bezier(0.16, 1, 0.3, 1),
        opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    will-change: transform, opacity;
}

.feature-card.is-visible {
    opacity: 1;
    transform: translateY(0);
}

.feature-card:hover {
    transform: translateY(-0.25rem) scale(1.02);
    box-shadow: 0 25px 50px -12px rgba(212, 163, 115, 0.25);
}

/* Animazione gradiente di sfondo */
.feature-card :deep(.absolute.bg-linear-to-br) {
    transition: opacity 0.5s ease-out;
}

/* Animazione icona */
.feature-card :deep(.UIcon) {
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.feature-card:hover :deep(.UIcon) {
    transform: scale(1.1) rotate(3deg);
}

/* Animazione testo */
.feature-card :deep(span) {
    transition: color 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.feature-card :deep(.space-y-3 p) {
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1),
        color 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    backface-visibility: hidden;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}

.feature-card:hover :deep(.space-y-3 p) {
    transform: translateX(0.25rem);
}
</style>
