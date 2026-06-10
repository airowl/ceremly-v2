<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

const { t } = useI18n()

const schema = z.object({
    name: z.string().min(2, t('landing.newsletter.validation.invalidName')),
    email: z.string().email(t('landing.newsletter.validation.invalidEmail'))
})

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({
    name: undefined,
    email: undefined
})

const submitted = ref(false)
const toast = useToast()

async function onSubmit(event: FormSubmitEvent<Schema>) {
    try {
        // TODO: Implementare chiamata API per l'iscrizione alla newsletter
        // Esempio: await $fetch('/api/newsletter/subscribe', { method: 'POST', body: event.data })
        await new Promise(resolve => setTimeout(resolve, 1000))

        submitted.value = true
        state.name = undefined
        state.email = undefined

        toast.add({
            title: t('landing.newsletter.successTitle'),
            description: t('landing.newsletter.successMessage'),
            color: 'success',
            icon: 'i-lucide-check-circle'
        })
    } catch (error: any) {
        console.error('Newsletter subscription error:', error)

        toast.add({
            title: t('landing.newsletter.errorTitle'),
            description: error?.message || t('landing.newsletter.errorMessage'),
            color: 'error',
            icon: 'i-lucide-alert-circle'
        })
    }
}

const features = [
    {
        icon: 'i-lucide-newspaper',
        title: 'landing.newsletter.features.exclusiveContent.title',
        description: 'landing.newsletter.features.exclusiveContent.description'
    },
    {
        icon: 'i-lucide-gift',
        title: 'landing.newsletter.features.specialOffers.title',
        description: 'landing.newsletter.features.specialOffers.description'
    },
    {
        icon: 'i-lucide-bell',
        title: 'landing.newsletter.features.updates.title',
        description: 'landing.newsletter.features.updates.description'
    }
]
</script>

<template>
    <UContainer id="newsletter-cta">
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
                        <UIcon name="i-lucide-mail" class="size-4 text-primary-600 dark:text-primary-400" />
                        <span class="text-xs font-medium text-primary-700 dark:text-primary-300">
                            {{ t('landing.newsletter.badge') }}
                        </span>
                    </div>

                    <!-- Title -->
                    <h2
class="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-gray-900 dark:text-white mb-4 animate-slide-up-fade"
                        style="animation-delay: 100ms">
                        {{ t('landing.newsletter.title') }}
                    </h2>

                    <!-- Description -->
                    <p
class="text-base sm:text-lg text-gray-600 dark:text-gray-300 max-w-xl mx-auto animate-slide-up-fade"
                        style="animation-delay: 200ms">
                        {{ t('landing.newsletter.description') }}
                    </p>
                </div>

                <!-- Form -->
                <div class="mx-auto max-w-md mt-10 animate-slide-up-fade" style="animation-delay: 300ms">
                    <UForm
                        :schema="schema"
                        :state="state"
                        :disabled="submitted"
                        loading-auto
                        class="space-y-4"
                        @submit="onSubmit"
                    >
                        <UFormField
                            name="name"
                            :label="t('landing.newsletter.nameLabel')"
                            class="w-full"
                            required
                        >
                            <UInput
                                v-model="state.name"
                                type="text"
                                :placeholder="t('landing.newsletter.namePlaceholder')"
                                icon="i-lucide-user"
                                size="xl"
                                color="neutral"
                                variant="outline"
                                autocomplete="name"
                                class="w-full"
                            />
                        </UFormField>

                        <UFormField
                            name="email"
                            :label="t('landing.newsletter.emailLabel')"
                            class="w-full"
                            required
                        >
                            <UInput
                                v-model="state.email"
                                type="email"
                                :placeholder="t('landing.newsletter.emailPlaceholder')"
                                icon="i-lucide-mail"
                                size="xl"
                                color="neutral"
                                variant="outline"
                                autocomplete="email"
                                class="w-full"
                            />
                        </UFormField>

                        <UButton
                            type="submit"
                            size="xl"
                            color="primary"
                            block
                            :icon="submitted ? 'i-lucide-check' : 'i-lucide-arrow-right'"
                            :trailing="!submitted"
                            :disabled="submitted"
                            loading-auto
                            class="group relative overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/25 active:scale-95"
                        >
                            <span class="relative z-10 transition-transform duration-300 group-hover:translate-x-1">
                                {{ submitted ? t('landing.newsletter.submittedButton') : t('landing.newsletter.submitButton') }}
                            </span>
                            <div class="absolute inset-0 bg-linear-to-r from-primary-600 to-primary-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        </UButton>

                        <!-- Privacy Note -->
                        <div class="flex items-center justify-center gap-2 text-sm text-muted">
                            <UIcon name="i-lucide-shield-check" class="size-4" />
                            <p>{{ t('landing.newsletter.privacyNote') }}</p>
                        </div>
                    </UForm>
                </div>

                <!-- Features -->
                <div
class="mx-auto max-w-3xl mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 animate-slide-up-fade"
                    style="animation-delay: 400ms">
                    <div
                        v-for="(feature, index) in features"
                        :key="index"
                        class="group flex flex-col items-center text-center p-4 rounded-xl bg-cornsilk-50/50 dark:bg-gray-900/50 backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:bg-cornsilk-50/80 dark:hover:bg-gray-900/80"
                    >
                        <div
                            class="size-10 rounded-full bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center mb-3 transition-transform duration-300 group-hover:scale-110"
                        >
                            <UIcon :name="feature.icon" class="size-5 text-primary-600 dark:text-primary-400" />
                        </div>
                        <h3 class="text-sm font-semibold text-default mb-1">
                            {{ t(feature.title) }}
                        </h3>
                        <p class="text-xs text-muted">
                            {{ t(feature.description) }}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    </UContainer>
</template>

<style scoped>
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
