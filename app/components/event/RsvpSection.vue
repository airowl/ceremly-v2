<script setup lang="ts">
import type { LandingSettings } from '~~/shared/schemas/landing'

const props = defineProps<{
    values: Record<string, unknown>
    settings: LandingSettings
    slug: string
    guestId?: string
    event?: Record<string, unknown>
}>()

const title = computed(() => (props.values.title as string) || 'Conferma la tua presenza')
const description = computed(() => (props.values.description as string) || '')
const confirmButtonText = computed(() => (props.values.confirmButtonText as string) || 'Confermo la presenza')
const declineButtonText = computed(() => (props.values.declineButtonText as string) || 'Non potr\u00f2 esserci')
const showConfirmCount = computed(() => props.values.showConfirmCount !== false)
const confirmCountText = computed(() => (props.values.confirmCountText as string) || '{{count}} persone hanno gi\u00e0 confermato')

const confirmedCount = computed(() => (props.event?.confirmedGuestCount as number) ?? 0)
const guestName = computed(() => {
    // Guest name injected from parent page
    return ''
})

const loading = ref(false)
const submitted = ref(false)
const submittedStatus = ref<'yes' | 'no' | null>(null)
const errorMessage = ref('')

async function respond(status: 'yes' | 'no') {
    if (!props.guestId) {
        errorMessage.value = 'Link non valido. Contatta l\'organizzatore.'
        return
    }

    loading.value = true
    errorMessage.value = ''

    try {
        await $fetch(`/api/rsvp/${props.slug}/respond`, {
            method: 'POST',
            body: {
                guestId: props.guestId,
                status,
            },
        })
        submitted.value = true
        submittedStatus.value = status
    }
    catch (err: any) {
        errorMessage.value = err?.data?.statusMessage || 'Si \u00e8 verificato un errore. Riprova.'
    }
    finally {
        loading.value = false
    }
}

const displayedCountText = computed(() =>
    confirmCountText.value.replace('{{count}}', String(confirmedCount.value)),
)
</script>

<template>
    <section class="py-16 px-6" aria-labelledby="rsvp-heading">
        <div class="mx-auto max-w-lg text-center">
            <h2
                id="rsvp-heading"
                class="mb-4 text-3xl font-bold"
                :style="{ color: 'var(--landing-text)' }"
            >
                {{ title }}
            </h2>

            <p
                v-if="description"
                class="mb-8 text-base leading-relaxed"
                :style="{ color: 'var(--landing-text)', opacity: '0.7' }"
            >
                {{ description }}
            </p>

            <!-- Social proof -->
            <p
                v-if="showConfirmCount && confirmedCount > 0 && !submitted"
                class="mb-6 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium"
                :style="{
                    backgroundColor: 'color-mix(in srgb, var(--landing-secondary) 15%, var(--landing-bg))',
                    color: 'var(--landing-secondary)',
                }"
            >
                <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                {{ displayedCountText }}
            </p>

            <!-- Submitted state -->
            <div v-if="submitted" class="rounded-xl border p-8" :style="{ borderRadius: 'var(--landing-radius)', borderColor: 'color-mix(in srgb, var(--landing-primary) 30%, transparent)' }">
                <div
                    v-if="submittedStatus === 'yes'"
                    class="flex flex-col items-center gap-3"
                >
                    <div class="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                        <svg class="h-8 w-8 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <p class="text-lg font-bold text-green-700">Grazie! La tua presenza e' confermata.</p>
                    <p class="text-sm text-gray-500">Ti aspettiamo!</p>
                </div>
                <div
                    v-else
                    class="flex flex-col items-center gap-3"
                >
                    <div class="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                        <svg class="h-8 w-8 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </div>
                    <p class="text-lg font-bold text-red-700">Ci dispiace che non potrai esserci.</p>
                    <p class="text-sm text-gray-500">Grazie per aver risposto.</p>
                </div>
            </div>

            <!-- RSVP buttons -->
            <div v-else class="flex flex-col gap-3 sm:flex-row sm:justify-center">
                <button
                    :disabled="loading"
                    class="inline-flex items-center justify-center gap-2 rounded-lg px-8 py-3 text-base font-bold text-white transition-all hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
                    :style="{
                        backgroundColor: '#16a34a',
                        borderRadius: 'var(--landing-radius)',
                    }"
                    aria-label="Conferma la presenza"
                    @click="respond('yes')"
                >
                    <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
                    {{ confirmButtonText }}
                </button>
                <button
                    :disabled="loading"
                    class="inline-flex items-center justify-center gap-2 rounded-lg px-8 py-3 text-base font-bold text-white transition-all hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
                    :style="{
                        backgroundColor: '#dc2626',
                        borderRadius: 'var(--landing-radius)',
                    }"
                    aria-label="Declina l'invito"
                    @click="respond('no')"
                >
                    <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    {{ declineButtonText }}
                </button>
            </div>

            <!-- Error message -->
            <p
                v-if="errorMessage"
                class="mt-4 text-sm font-medium text-red-600"
                role="alert"
            >
                {{ errorMessage }}
            </p>
        </div>
    </section>
</template>
