<script setup lang="ts">
import type { LandingSettings } from '~~/shared/schemas/landing'

const props = defineProps<{
    values: Record<string, unknown>
    settings: LandingSettings
}>()

const message = computed(() => (props.values.message as string) || '')
const showContacts = computed(() => !!props.values.showContacts)
const email = computed(() => (props.values.email as string) || '')
const phone = computed(() => (props.values.phone as string) || '')
</script>

<template>
    <footer
        class="py-12 px-6"
        :style="{
            backgroundColor: 'color-mix(in srgb, var(--landing-text) 5%, var(--landing-bg))',
        }"
    >
        <div class="mx-auto max-w-2xl text-center">
            <!-- Final message -->
            <p
                v-if="message"
                class="text-lg font-medium leading-relaxed"
                :style="{ color: 'var(--landing-text)' }"
            >
                {{ message }}
            </p>

            <!-- Contacts -->
            <div
                v-if="showContacts && (email || phone)"
                class="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-6"
            >
                <a
                    v-if="email"
                    :href="`mailto:${email}`"
                    class="inline-flex items-center gap-2 text-sm transition-opacity hover:opacity-70"
                    :style="{ color: 'var(--landing-primary)' }"
                >
                    <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    {{ email }}
                </a>
                <a
                    v-if="phone"
                    :href="`tel:${phone}`"
                    class="inline-flex items-center gap-2 text-sm transition-opacity hover:opacity-70"
                    :style="{ color: 'var(--landing-primary)' }"
                >
                    <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    {{ phone }}
                </a>
            </div>

            <!-- Powered by -->
            <p
                class="mt-8 text-xs"
                :style="{ color: 'var(--landing-text)', opacity: '0.4' }"
            >
                Creato con Ceremly
            </p>
        </div>
    </footer>
</template>
