<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { useUserStore } from '~/stores/userStore'

const model = defineModel<boolean>({ default: false })

const emit = defineEmits<{
    created: []
}>()

const { t } = useI18n()
const userStore = useUserStore()
const toast = useToast()

const schema = computed(() => z.object({
    name: z.string().min(2, t('dashboard.home.eventCards.modal.validation.nameTooShort')),
    slug: z.string().min(2, t('dashboard.home.eventCards.modal.validation.slugTooShort')).regex(/^[a-z0-9-]+$/, t('dashboard.home.eventCards.modal.validation.slugInvalid'))
}))

type Schema = z.output<typeof schema.value>

const formState = reactive({
    name: undefined as string | undefined,
    slug: undefined as string | undefined
})

watch(() => formState.name, (newName) => {
    if (newName) {
        formState.slug = newName
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '')
    }
})

const eventLimit = ref<{ allowed: boolean; current: number; limit: number } | null>(null)
const isLoadingLimits = ref(false)
const isSubmitting = ref(false)

async function loadLimits() {
    const userId = userStore.user?.id
    if (!userId) return

    isLoadingLimits.value = true
    try {
        eventLimit.value = await userStore.checkEventCreationLimit()
    } catch (err) {
        console.error('Error loading limits:', err)
    } finally {
        isLoadingLimits.value = false
    }
}

const canCreateEvent = computed(() => {
    return eventLimit.value?.allowed ?? true
})

watch(model, async (newOpen) => {
    if (newOpen) {
        await loadLimits()
    } else {
        formState.name = undefined
        formState.slug = undefined
    }
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
    if (!canCreateEvent.value) {
        toast.add({
            title: t('dashboard.home.eventCards.modal.limitReached'),
            description: t('dashboard.home.eventCards.modal.limitReachedDescription'),
            color: 'warning'
        })
        return
    }

    isSubmitting.value = true
    try {
        await $fetch('/api/events', {
            method: 'POST',
            body: { name: event.data.name, slug: event.data.slug }
        })

        toast.add({
            title: t('dashboard.home.eventCards.modal.success'),
            description: t('dashboard.home.eventCards.modal.successDescription', { name: event.data.name }),
            color: 'success'
        })

        model.value = false
        emit('created')
    } catch (err: any) {
        toast.add({
            title: t('dashboard.home.eventCards.modal.error'),
            description: err.message || t('dashboard.home.eventCards.modal.errorDescription'),
            color: 'error'
        })
    } finally {
        isSubmitting.value = false
    }
}
</script>

<template>
    <UModal v-model:open="model" :title="$t('dashboard.home.eventCards.modal.title')" :description="$t('dashboard.home.eventCards.modal.description')">
        <template #body>
            <UAlert v-if="!canCreateEvent && eventLimit" color="warning" variant="subtle" class="mb-4">
                <template #icon>
                    <UIcon name="i-lucide-alert-triangle" class="size-5" />
                </template>
                <template #description>
                    <p class="text-sm">
                        {{ $t('dashboard.home.eventCards.modal.limitWarning', { limit: eventLimit.limit }) }}
                        <NuxtLink to="/dashboard/subscription" class="underline font-medium">{{ $t('dashboard.home.eventCards.modal.upgrade') }}</NuxtLink>
                    </p>
                </template>
            </UAlert>

            <div v-else-if="eventLimit" class="mb-4 p-3 bg-elevated rounded-lg">
                <div class="flex justify-between items-center text-sm mb-2">
                    <span class="text-muted">{{ $t('dashboard.home.eventCards.modal.eventsUsed') }}</span>
                    <span class="font-medium">{{ eventLimit.current }} / {{ eventLimit.limit }}</span>
                </div>
                <UProgress
                    :model-value="eventLimit.current"
                    :max="eventLimit.limit"
                    :color="eventLimit.current >= eventLimit.limit ? 'error' : 'primary'"
                />
            </div>

            <UForm :schema="schema" :state="formState" class="space-y-4" @submit="onSubmit">
                <UFormField :label="$t('dashboard.home.eventCards.modal.name')" name="name" required>
                    <UInput
                        v-model="formState.name"
                        :placeholder="$t('dashboard.home.eventCards.modal.namePlaceholder')"
                        :disabled="!canCreateEvent"
                        class="w-full"
                    />
                </UFormField>

                <UFormField :label="$t('dashboard.home.eventCards.modal.slug')" name="slug" :hint="$t('dashboard.home.eventCards.modal.slugHint')" required>
                    <UInput
                        v-model="formState.slug"
                        :placeholder="$t('dashboard.home.eventCards.modal.slugPlaceholder')"
                        :disabled="!canCreateEvent"
                        class="w-full"
                    >
                        <template #leading>
                            <span class="text-muted text-sm">/org/</span>
                        </template>
                    </UInput>
                </UFormField>

                <div class="flex justify-end gap-2 pt-2">
                    <UButton
                        :label="$t('dashboard.home.eventCards.modal.cancel')"
                        color="neutral"
                        variant="subtle"
                        @click="model = false"
                    />
                    <UButton
                        :label="$t('dashboard.home.eventCards.modal.create')"
                        color="primary"
                        type="submit"
                        :disabled="!canCreateEvent"
                        :loading="isSubmitting"
                    />
                </div>
            </UForm>
        </template>
    </UModal>
</template>
