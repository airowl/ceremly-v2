<script setup lang="ts">
import type { LandingSettings } from '~~/shared/schemas/landing'

const props = defineProps<{
    values: Record<string, unknown>
    settings: LandingSettings
}>()

const title = computed(() => (props.values.title as string) || '')
const text = computed(() => (props.values.text as string) || (props.values.content as string) || '')
const photo = computed(() => (props.values.photo as string) || '')
const imagePosition = computed(() => (props.values.imagePosition as string) || 'right')
</script>

<template>
    <section class="py-16 px-6" aria-labelledby="story-heading">
        <div class="mx-auto max-w-4xl">
            <h2
                v-if="title"
                id="story-heading"
                class="mb-8 text-center text-3xl font-bold"
                :style="{ color: 'var(--landing-text)' }"
            >
                {{ title }}
            </h2>

            <div
                v-if="photo"
                class="flex flex-col gap-8"
                :class="{
                    'md:flex-row': imagePosition === 'right',
                    'md:flex-row-reverse': imagePosition === 'left',
                }"
            >
                <!-- Text content -->
                <div
                    class="flex-1"
                    :class="imagePosition === 'top' ? 'w-full' : ''"
                >
                    <div
                        v-if="text"
                        class="prose max-w-none text-base leading-relaxed"
                        :style="{ color: 'var(--landing-text)' }"
                        v-html="text"
                    />
                </div>

                <!-- Photo -->
                <div
                    class="flex-shrink-0"
                    :class="imagePosition === 'top' ? 'w-full mb-6 order-first' : 'w-full md:w-2/5'"
                >
                    <img
                        :src="photo"
                        :alt="title || 'Foto della storia'"
                        class="h-auto w-full object-cover"
                        :style="{ borderRadius: 'var(--landing-radius)' }"
                        loading="lazy"
                    >
                </div>
            </div>

            <!-- No photo: just text centered -->
            <div
                v-else-if="text"
                class="prose mx-auto max-w-2xl text-base leading-relaxed"
                :style="{ color: 'var(--landing-text)' }"
                v-html="text"
            />
        </div>
    </section>
</template>
