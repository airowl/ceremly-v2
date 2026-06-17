<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

const { t, locale } = useI18n()

const schema = z.object({
    name: z.string({ message: t('landing.contact.validation.requiredName') }).min(2, t('landing.contact.validation.invalidName')),
    email: z.string({ message: t('landing.contact.validation.requiredEmail') }).email(t('landing.contact.validation.invalidEmail')),
    subject: z.string({ message: t('landing.contact.validation.requiredSubject') }).min(3, t('landing.contact.validation.invalidSubject')),
    message: z.string({ message: t('landing.contact.validation.requiredMessage') }).min(10, t('landing.contact.validation.invalidMessage'))
})

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({
    name: undefined,
    email: undefined,
    subject: undefined,
    message: undefined
})

const submitted = ref(false)
const isLoading = ref(false)
const toast = useToast()

// Anti-spam (#8): honeypot (deve restare vuoto) + timestamp di rendering del form.
const website = ref('')
const loadedAt = ref(0)
onMounted(() => { loadedAt.value = Date.now() })

async function onSubmit(event: FormSubmitEvent<Schema>) {
    if (isLoading.value) return

    isLoading.value = true

    try {
        const response = await $fetch<{ success: boolean; error?: string }>('/api/contact', {
            method: 'POST',
            body: {
                ...event.data,
                language: locale.value === 'en' ? 'en' : 'it',
                website: website.value,
                _t: loadedAt.value,
            },
        });

        if (response?.success) {
            submitted.value = true
            state.name = undefined
            state.email = undefined
            state.subject = undefined
            state.message = undefined

            toast.add({
                title: t('landing.contact.successTitle'),
                description: t('landing.contact.successMessage'),
                color: 'success',
                icon: 'i-lucide-check-circle'
            })
        } else {
            throw new Error(response?.error || t('landing.contact.errorMessage'))
        }
    } catch (error: any) {
        console.error('Contact form error:', error)

        // Extract error message from Supabase FunctionsError or generic error
        const errorMessage = error?.context?.body?.error || error?.message || t('landing.contact.errorMessage')

        toast.add({
            title: t('landing.contact.errorTitle'),
            description: errorMessage,
            color: 'error',
            icon: 'i-lucide-alert-circle'
        })
    } finally {
        isLoading.value = false
    }
}

</script>

<template>
    <UContainer id="contact">
        <div
            class="relative overflow-hidden rounded-2xl bg-linear-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 transition-all duration-500">
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
                        <UIcon name="i-lucide-send" class="size-4 text-primary-600 dark:text-primary-400" />
                        <span class="text-xs font-medium text-primary-700 dark:text-primary-300">
                            {{ t('landing.contact.badge') }}
                        </span>
                    </div>

                    <!-- Title -->
                    <h2
class="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-gray-900 dark:text-white mb-4 animate-slide-up-fade"
                        style="animation-delay: 100ms">
                        {{ t('landing.contact.title') }}
                    </h2>

                    <!-- Description -->
                    <p
class="text-base sm:text-lg text-gray-600 dark:text-gray-300 max-w-xl mx-auto animate-slide-up-fade"
                        style="animation-delay: 200ms">
                        {{ t('landing.contact.description') }}
                    </p>
                </div>

                <!-- Form -->
                <div class="mx-auto max-w-lg mt-10 animate-slide-up-fade" style="animation-delay: 300ms">
                    <UForm
                        :schema="schema"
                        :state="state"
                        :disabled="submitted"
                        loading-auto
                        class="space-y-4"
                        @submit="onSubmit"
                    >
                        <!-- Honeypot anti-spam (#8): nascosto agli umani, i bot lo compilano. -->
                        <input
                            v-model="website"
                            type="text"
                            name="website"
                            tabindex="-1"
                            autocomplete="off"
                            aria-hidden="true"
                            style="position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0;"
                        >

                        <!-- Name & Email Row -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <UFormField
                                name="name"
                                :label="t('landing.contact.nameLabel')"
                                class="w-full"
                                required
                            >
                                <UInput
                                    v-model="state.name"
                                    type="text"
                                    :placeholder="t('landing.contact.namePlaceholder')"
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
                                :label="t('landing.contact.emailLabel')"
                                class="w-full"
                                required
                            >
                                <UInput
                                    v-model="state.email"
                                    type="email"
                                    :placeholder="t('landing.contact.emailPlaceholder')"
                                    icon="i-lucide-mail"
                                    size="xl"
                                    color="neutral"
                                    variant="outline"
                                    autocomplete="email"
                                    class="w-full"
                                />
                            </UFormField>
                        </div>

                        <UFormField
                            name="subject"
                            :label="t('landing.contact.subjectLabel')"
                            class="w-full"
                            required
                        >
                            <UInput
                                v-model="state.subject"
                                type="text"
                                :placeholder="t('landing.contact.subjectPlaceholder')"
                                icon="i-lucide-tag"
                                size="xl"
                                color="neutral"
                                variant="outline"
                                class="w-full"
                            />
                        </UFormField>

                        <UFormField
                            name="message"
                            :label="t('landing.contact.messageLabel')"
                            class="w-full"
                            required
                        >
                            <UTextarea
                                v-model="state.message"
                                :placeholder="t('landing.contact.messagePlaceholder')"
                                size="xl"
                                color="neutral"
                                variant="outline"
                                :rows="5"
                                class="w-full"
                            />
                        </UFormField>

                        <UButton
                            type="submit"
                            size="xl"
                            color="primary"
                            block
                            :icon="submitted ? 'i-lucide-check' : 'i-lucide-send'"
                            :trailing="!submitted"
                            :disabled="submitted || isLoading"
                            :loading="isLoading"
                            class="group relative overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/25 active:scale-95"
                        >
                            <span class="relative z-10 transition-transform duration-300 group-hover:translate-x-1">
                                {{ submitted ? t('landing.contact.submittedButton') : t('landing.contact.submitButton') }}
                            </span>
                            <div class="absolute inset-0 bg-linear-to-r from-primary-600 to-primary-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        </UButton>

                        <!-- Privacy Note -->
                        <div class="flex items-center justify-center gap-2 text-sm text-muted">
                            <UIcon name="i-lucide-shield-check" class="size-4" />
                            <p>{{ t('landing.contact.privacyNote') }}</p>
                        </div>
                    </UForm>
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
