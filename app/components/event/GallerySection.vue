<script setup lang="ts">
import type { LandingSettings } from '~~/shared/schemas/landing'

const props = defineProps<{
    values: Record<string, unknown>
    settings: LandingSettings
}>()

const title = computed(() => (props.values.title as string) || '')
const layout = computed(() => (props.values.layout as string) || 'grid')

/** Collect image1..image6 from values */
const images = computed(() => {
    const imgs: { url: string, alt: string }[] = []
    for (let i = 1; i <= 6; i++) {
        const url = props.values[`image${i}`] as string
        if (url) {
            imgs.push({ url, alt: `Foto ${i}` })
        }
    }
    return imgs
})
</script>

<template>
    <section class="py-16 px-6" aria-labelledby="gallery-heading">
        <div class="mx-auto max-w-5xl">
            <h2
                v-if="title"
                id="gallery-heading"
                class="mb-8 text-center text-3xl font-bold"
                :style="{ color: 'var(--landing-text)' }"
            >
                {{ title }}
            </h2>

            <!-- No images placeholder -->
            <p
                v-if="images.length === 0"
                class="text-center text-sm"
                :style="{ color: 'var(--landing-text)', opacity: '0.5' }"
            >
                Nessuna immagine disponibile
            </p>

            <!-- Grid layout -->
            <div
                v-else-if="layout === 'grid' || layout === 'masonry'"
                class="grid gap-4 grid-cols-2 md:grid-cols-3"
                role="list"
                aria-label="Galleria immagini"
            >
                <div
                    v-for="(img, idx) in images"
                    :key="idx"
                    class="overflow-hidden"
                    :style="{ borderRadius: 'var(--landing-radius)' }"
                    role="listitem"
                >
                    <img
                        :src="img.url"
                        :alt="img.alt"
                        class="h-48 w-full object-cover transition-transform duration-300 hover:scale-105 md:h-56"
                        loading="lazy"
                    >
                </div>
            </div>

            <!-- Carousel layout -->
            <div
                v-else-if="layout === 'carousel'"
                class="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4 -mx-2 px-2"
                role="list"
                aria-label="Galleria immagini scorrevole"
            >
                <div
                    v-for="(img, idx) in images"
                    :key="idx"
                    class="flex-none w-72 snap-center overflow-hidden"
                    :style="{ borderRadius: 'var(--landing-radius)' }"
                    role="listitem"
                >
                    <img
                        :src="img.url"
                        :alt="img.alt"
                        class="h-48 w-full object-cover md:h-56"
                        loading="lazy"
                    >
                </div>
            </div>
        </div>
    </section>
</template>
