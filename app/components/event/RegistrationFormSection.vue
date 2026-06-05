<script setup lang="ts">
import type { LandingSettings } from '~~/shared/schemas/landing'

const props = defineProps<{
    values: Record<string, unknown>
    settings: LandingSettings
    slug: string
    event?: Record<string, unknown>
}>()

const title = computed(() => (props.values.title as string) || 'Registrati all\'evento')
const description = computed(() => (props.values.description as string) || '')
const showEmail = computed(() => props.values.showEmail !== false)
const emailRequired = computed(() => !!props.values.emailRequired)
const showPhone = computed(() => props.values.showPhone !== false)
const phoneRequired = computed(() => !!props.values.phoneRequired)
const showCompanions = computed(() => !!props.values.showCompanions)
const companionsRequired = computed(() => !!props.values.companionsRequired)
const showAllergies = computed(() => !!props.values.showAllergies)
const allergiesRequired = computed(() => !!props.values.allergiesRequired)
const showNotes = computed(() => !!props.values.showNotes)
const notesRequired = computed(() => !!props.values.notesRequired)
const submitButtonText = computed(() => (props.values.submitButtonText as string) || 'Registrati')
const successMessage = computed(() => (props.values.successMessage as string) || 'Registrazione completata con successo!')

const form = reactive({
    name: '',
    email: '',
    phone: '',
    companions: '',
    allergies: '',
    notes: '',
})

const loading = ref(false)
const submitted = ref(false)
const errorMessage = ref('')

async function submitForm() {
    // Basic client-side validation
    if (!form.name.trim()) {
        errorMessage.value = 'Il nome \u00e8 obbligatorio.'
        return
    }
    if (showEmail.value && emailRequired.value && !form.email.trim()) {
        errorMessage.value = 'L\'email \u00e8 obbligatoria.'
        return
    }
    if (showPhone.value && phoneRequired.value && !form.phone.trim()) {
        errorMessage.value = 'Il telefono \u00e8 obbligatorio.'
        return
    }

    loading.value = true
    errorMessage.value = ''

    try {
        const body: Record<string, unknown> = {
            name: form.name.trim(),
        }

        if (showEmail.value && form.email.trim()) {
            body.email = form.email.trim()
        }
        if (showPhone.value && form.phone.trim()) {
            body.phone = form.phone.trim()
        }

        // Collect custom fields
        const customFields: Record<string, unknown> = {}
        if (showCompanions.value && form.companions.trim()) {
            customFields.companions = form.companions.trim()
        }
        if (showAllergies.value && form.allergies.trim()) {
            customFields.allergies = form.allergies.trim()
        }
        if (showNotes.value && form.notes.trim()) {
            customFields.notes = form.notes.trim()
        }

        if (Object.keys(customFields).length > 0) {
            body.customFields = customFields
        }

        await $fetch(`/api/event/${props.slug}/register`, {
            method: 'POST',
            body,
        })

        submitted.value = true
    }
    catch (err: any) {
        errorMessage.value = err?.data?.statusMessage || 'Si \u00e8 verificato un errore. Riprova.'
    }
    finally {
        loading.value = false
    }
}

const inputStyle = computed(() => ({
    borderColor: 'color-mix(in srgb, var(--landing-text) 20%, transparent)',
    borderRadius: 'var(--landing-radius)',
    color: 'var(--landing-text)',
    backgroundColor: 'var(--landing-bg)',
}))
</script>

<template>
    <section class="py-16 px-6" aria-labelledby="registration-heading">
        <div class="mx-auto max-w-lg">
            <h2
                v-if="title"
                id="registration-heading"
                class="mb-4 text-center text-3xl font-bold"
                :style="{ color: 'var(--landing-text)' }"
            >
                {{ title }}
            </h2>

            <p
                v-if="description"
                class="mb-8 text-center text-base leading-relaxed"
                :style="{ color: 'var(--landing-text)', opacity: '0.7' }"
            >
                {{ description }}
            </p>

            <!-- Success state -->
            <div
                v-if="submitted"
                class="rounded-xl border p-8 text-center"
                :style="{ borderRadius: 'var(--landing-radius)', borderColor: 'color-mix(in srgb, var(--landing-primary) 30%, transparent)' }"
            >
                <div class="flex flex-col items-center gap-3">
                    <div class="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                        <svg class="h-8 w-8 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <p class="text-lg font-bold" :style="{ color: 'var(--landing-text)' }">
                        {{ successMessage }}
                    </p>
                </div>
            </div>

            <!-- Registration form -->
            <form
                v-else
                class="space-y-5"
                novalidate
                @submit.prevent="submitForm"
            >
                <!-- Name (always required) -->
                <div>
                    <label
                        for="reg-name"
                        class="mb-1.5 block text-sm font-medium"
                        :style="{ color: 'var(--landing-text)' }"
                    >
                        Nome *
                    </label>
                    <input
                        id="reg-name"
                        v-model="form.name"
                        type="text"
                        required
                        autocomplete="name"
                        placeholder="Il tuo nome completo"
                        class="w-full border px-4 py-2.5 text-sm outline-none transition-colors focus:ring-2"
                        :style="{
                            ...inputStyle,
                            '--tw-ring-color': 'var(--landing-primary)',
                        }"
                    >
                </div>

                <!-- Email -->
                <div v-if="showEmail">
                    <label
                        for="reg-email"
                        class="mb-1.5 block text-sm font-medium"
                        :style="{ color: 'var(--landing-text)' }"
                    >
                        Email {{ emailRequired ? '*' : '' }}
                    </label>
                    <input
                        id="reg-email"
                        v-model="form.email"
                        type="email"
                        :required="emailRequired"
                        autocomplete="email"
                        placeholder="nome@esempio.com"
                        class="w-full border px-4 py-2.5 text-sm outline-none transition-colors focus:ring-2"
                        :style="{
                            ...inputStyle,
                            '--tw-ring-color': 'var(--landing-primary)',
                        }"
                    >
                </div>

                <!-- Phone -->
                <div v-if="showPhone">
                    <label
                        for="reg-phone"
                        class="mb-1.5 block text-sm font-medium"
                        :style="{ color: 'var(--landing-text)' }"
                    >
                        Telefono {{ phoneRequired ? '*' : '' }}
                    </label>
                    <input
                        id="reg-phone"
                        v-model="form.phone"
                        type="tel"
                        :required="phoneRequired"
                        autocomplete="tel"
                        placeholder="+39 333 1234567"
                        class="w-full border px-4 py-2.5 text-sm outline-none transition-colors focus:ring-2"
                        :style="{
                            ...inputStyle,
                            '--tw-ring-color': 'var(--landing-primary)',
                        }"
                    >
                </div>

                <!-- Companions -->
                <div v-if="showCompanions">
                    <label
                        for="reg-companions"
                        class="mb-1.5 block text-sm font-medium"
                        :style="{ color: 'var(--landing-text)' }"
                    >
                        Accompagnatori {{ companionsRequired ? '*' : '' }}
                    </label>
                    <input
                        id="reg-companions"
                        v-model="form.companions"
                        type="text"
                        :required="companionsRequired"
                        placeholder="Nomi degli accompagnatori"
                        class="w-full border px-4 py-2.5 text-sm outline-none transition-colors focus:ring-2"
                        :style="{
                            ...inputStyle,
                            '--tw-ring-color': 'var(--landing-primary)',
                        }"
                    >
                </div>

                <!-- Allergies -->
                <div v-if="showAllergies">
                    <label
                        for="reg-allergies"
                        class="mb-1.5 block text-sm font-medium"
                        :style="{ color: 'var(--landing-text)' }"
                    >
                        Allergie / Intolleranze {{ allergiesRequired ? '*' : '' }}
                    </label>
                    <textarea
                        id="reg-allergies"
                        v-model="form.allergies"
                        :required="allergiesRequired"
                        rows="2"
                        placeholder="Indica eventuali allergie o intolleranze"
                        class="w-full resize-none border px-4 py-2.5 text-sm outline-none transition-colors focus:ring-2"
                        :style="{
                            ...inputStyle,
                            '--tw-ring-color': 'var(--landing-primary)',
                        }"
                    />
                </div>

                <!-- Notes -->
                <div v-if="showNotes">
                    <label
                        for="reg-notes"
                        class="mb-1.5 block text-sm font-medium"
                        :style="{ color: 'var(--landing-text)' }"
                    >
                        Note {{ notesRequired ? '*' : '' }}
                    </label>
                    <textarea
                        id="reg-notes"
                        v-model="form.notes"
                        :required="notesRequired"
                        rows="3"
                        placeholder="Eventuali note o richieste"
                        class="w-full resize-none border px-4 py-2.5 text-sm outline-none transition-colors focus:ring-2"
                        :style="{
                            ...inputStyle,
                            '--tw-ring-color': 'var(--landing-primary)',
                        }"
                    />
                </div>

                <!-- Error message -->
                <p
                    v-if="errorMessage"
                    class="text-sm font-medium text-red-600"
                    role="alert"
                >
                    {{ errorMessage }}
                </p>

                <!-- Submit button -->
                <button
                    type="submit"
                    :disabled="loading"
                    class="w-full px-6 py-3 text-base font-bold text-white transition-all hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
                    :style="{
                        backgroundColor: 'var(--landing-primary)',
                        borderRadius: 'var(--landing-radius)',
                    }"
                >
                    <span v-if="loading">Invio in corso...</span>
                    <span v-else>{{ submitButtonText }}</span>
                </button>
            </form>
        </div>
    </section>
</template>
