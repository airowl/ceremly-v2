<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

const { t } = useI18n()

const schema = z.object({
    email: z.string().email(t('landing.waitingList.validation.invalidEmail'))
})

type Schema = z.output<typeof schema>

const state = reactive({
    email: '',
    website: '' // honeypot — hidden from users, bots fill it
})

const loading = ref(false)
const submitted = ref(false)
const formLoadedAt = ref(0)

// Analytics tracking
const referrerSource = ref('')
const utmSource = ref('')
const utmMedium = ref('')
const utmCampaign = ref('')

onMounted(() => {
    formLoadedAt.value = Date.now()

    // Capture referrer
    referrerSource.value = document.referrer || ''

    // Capture UTM params from URL
    const params = new URLSearchParams(window.location.search)
    utmSource.value = params.get('utm_source') || ''
    utmMedium.value = params.get('utm_medium') || ''
    utmCampaign.value = params.get('utm_campaign') || ''
})

const toast = useToast()
const { locale } = useI18n()

async function onSubmit(event: FormSubmitEvent<Schema>) {
    loading.value = true

    try {
        // Determine language based on current locale (it-IT -> it, en-US -> en)
        const language = locale.value.startsWith('it') ? 'it' : 'en'

        // Call Nuxt API route
        const data = await $fetch('/api/waiting-list/subscribe', {
            method: 'POST',
            body: {
                email: event.data.email,
                language,
                website: state.website,
                _t: formLoadedAt.value,
                source: referrerSource.value || undefined,
                utmSource: utmSource.value || undefined,
                utmMedium: utmMedium.value || undefined,
                utmCampaign: utmCampaign.value || undefined,
            }
        })

        // Handle already subscribed case
        if (data?.alreadySubscribed) {
            toast.add({
                title: t('landing.waitingList.alreadySubscribedTitle'),
                description: t('landing.waitingList.alreadySubscribedMessage'),
                color: 'warning',
                icon: 'i-lucide-info'
            })
            state.email = ''
            loading.value = false
            return
        }

        // Success case
        submitted.value = true
        state.email = ''

        toast.add({
            title: t('landing.waitingList.successTitle'),
            description: data?.emailSent
                ? t('landing.waitingList.successMessage')
                : t('landing.waitingList.successMessageNoEmail'),
            color: 'success',
            icon: 'i-lucide-check-circle'
        })
    } catch (error: any) {
        console.error('Waiting list subscription error:', error)

        toast.add({
            title: t('landing.waitingList.errorTitle'),
            description: error?.data?.message || t('landing.waitingList.errorMessage'),
            color: 'error',
            icon: 'i-lucide-alert-circle'
        })
    } finally {
        loading.value = false
    }
}
</script>

<template>
    <UContainer id="waiting-list">
        <div
            class="relative overflow-hidden rounded-2xl bg-linear-to-br from-primary-50 to-primary-100 dark:from-primary-950 dark:to-primary-900 transition-all duration-500">
            <!-- Background Pattern -->
            <div
                class="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMwMDAiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDE0YzAtMS4xLS45LTItMi0yaC04Yy0xLjEgMC0yIC45LTIgMnY4YzAgMS4xLjkgMiAyIDJoOGMxLjEgMCAyLS45IDItMnYtOHptLTEyIDBjMC0uNi40LTEgMS0xaDZjLjYgMCAxIC40IDEgMXY2YzAgLjYtLjQgMS0xIDFoLTZjLS42IDAtMS0uNC0xLTF2LTZ6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-10" />

            <!-- Content -->
            <div class="relative px-6 py-12 sm:px-12 sm:py-16 lg:px-16 lg:py-20">
                <!-- Header -->
                <div class="mx-auto max-w-2xl text-center">
                    <!-- Badge -->
                    <div
                        class="inline-flex items-center gap-1.5 rounded-full bg-primary-100 dark:bg-primary-900/50 px-3 py-1 mb-6 animate-fade-in">
                        <UIcon name="i-lucide-sparkles" class="size-4 text-primary-600 dark:text-primary-400" />
                        <span class="text-xs font-medium text-primary-700 dark:text-primary-300">
                            {{ t('landing.waitingList.badge') }}
                        </span>
                    </div>

                    <!-- Title -->
                    <h2 class="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-gray-900 dark:text-white mb-4 animate-slide-up-fade"
                        style="animation-delay: 100ms">
                        {{ t('landing.waitingList.title') }}
                    </h2>

                    <!-- Description -->
                    <p class="text-base sm:text-lg text-gray-600 dark:text-gray-300 max-w-xl mx-auto animate-slide-up-fade"
                        style="animation-delay: 200ms">
                        {{ t('landing.waitingList.description') }}
                    </p>
                </div>

                <!-- Form -->
                <div class="mx-auto max-w-md mt-10 animate-slide-up-fade" style="animation-delay: 300ms">
                    <ClientOnly>
                        <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
                            <div class="wl-hp" aria-hidden="true" tabindex="-1">
                                <label for="wl-website">Website</label>
                                <input
                                    id="wl-website"
                                    v-model="state.website"
                                    type="text"
                                    name="website"
                                    autocomplete="off"
                                    tabindex="-1"
                                />
                            </div>

                            <UFormField name="email" class="w-full">
                                <UFieldGroup size="xl"
                                    class="transition-all duration-300 hover:scale-[1.02] focus-within:scale-[1.02] w-full">
                                    <UInput v-model="state.email" type="email"
                                        :placeholder="t('landing.waitingList.placeholder')" icon="i-lucide-mail" size="xl"
                                        :disabled="loading || submitted" color="neutral" variant="outline" :ui="{
                                            base: 'transition-all duration-200',
                                            leadingIcon: 'transition-all duration-200 group-hover:scale-110'
                                        }" class="flex-1" />
                                    <UButton type="submit" size="xl" :loading="loading" :disabled="submitted"
                                        color="primary" :icon="submitted ? 'i-lucide-check' : 'i-lucide-arrow-right'"
                                        :trailing="!submitted"
                                        class="group relative overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/25 active:scale-95">
                                        <span class="relative z-10 transition-transform duration-300 group-hover:translate-x-1">
                                            {{
                                                submitted
                                                    ? t('landing.waitingList.submittedButton')
                                                    : t('landing.waitingList.submitButton')
                                            }}
                                        </span>
                                        <div class="absolute inset-0 bg-linear-to-r from-primary-600 to-primary-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    </UButton>
                                </UFieldGroup>
                            </UFormField>

                            <div class="flex items-center justify-center gap-2">
                                <UIcon name="i-lucide-shield-check" class="size-4 text-gray-500 dark:text-gray-400" />
                                <p class="text-xs text-gray-500 dark:text-gray-400">
                                    {{ t('landing.waitingList.privacyNote') }}
                                </p>
                            </div>
                        </UForm>
                    </ClientOnly>
                </div>

                <!-- Features -->
                <div class="mx-auto max-w-3xl mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 animate-slide-up-fade"
                    style="animation-delay: 400ms">
                    <div v-for="(feature, index) in features" :key="index"
                        class="flex flex-col items-center text-center p-4 rounded-xl bg-cornsilk-50/50 dark:bg-gray-900/50 backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:bg-cornsilk-50/80 dark:hover:bg-gray-900/80">
                        <div
                            class="size-10 rounded-full bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center mb-3 transition-transform duration-300 group-hover:scale-110">
                            <UIcon :name="feature.icon" class="size-5 text-primary-600 dark:text-primary-400" />
                        </div>
                        <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                            {{ t(feature.title) }}
                        </h3>
                        <p class="text-xs text-gray-600 dark:text-gray-400">
                            {{ t(feature.description) }}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    </UContainer>
</template>

<script lang="ts">
const features = [
    {
        icon: 'i-lucide-zap',
        title: 'landing.waitingList.features.earlyAccess.title',
        description: 'landing.waitingList.features.earlyAccess.description'
    },
    {
        icon: 'i-lucide-gift',
        title: 'landing.waitingList.features.specialBenefits.title',
        description: 'landing.waitingList.features.specialBenefits.description'
    },
    {
        icon: 'i-lucide-bell',
        title: 'landing.waitingList.features.updates.title',
        description: 'landing.waitingList.features.updates.description'
    }
]
</script>

<style scoped>
/* Honeypot: hidden from visual users, visible to bots */
.wl-hp {
    position: absolute;
    left: -9999px;
    top: -9999px;
    width: 0;
    height: 0;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
}

@keyframes fade-in {
    from {
        opacity: 0;
    }

    to {
        opacity: 1;
    }
}

@keyframes slide-up-fade {
    from {
        opacity: 0;
        transform: translateY(20px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.animate-fade-in {
    animation: fade-in 0.6s ease-out forwards;
}

.animate-slide-up-fade {
    animation: slide-up-fade 0.8s ease-out forwards;
    opacity: 0;
}
</style>
