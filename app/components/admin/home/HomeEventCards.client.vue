<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { format } from 'date-fns'
import { it, enUS } from 'date-fns/locale'
import { useUserStore } from '~/stores/userStore'

interface EventWithDetails {
    id: string
    name: string
    slug: string
    description: string | null
    created_at: string
    members_count: number
}

const { t, locale } = useI18n()
const userStore = useUserStore()
const toast = useToast()

const events = ref<EventWithDetails[]>([])
const isLoading = ref(true)
const error = ref<string | null>(null)

// Modal state
const isModalOpen = ref(false)

// Form schema
const schema = computed(() => z.object({
    name: z.string().min(2, t('dashboard.home.eventCards.modal.validation.nameTooShort')),
    slug: z.string().min(2, t('dashboard.home.eventCards.modal.validation.slugTooShort')).regex(/^[a-z0-9-]+$/, t('dashboard.home.eventCards.modal.validation.slugInvalid'))
}))

type Schema = z.output<typeof schema.value>

const formState = reactive({
    name: undefined as string | undefined,
    slug: undefined as string | undefined
})

// Auto-generate slug from name
watch(() => formState.name, (newName) => {
    if (newName) {
        formState.slug = newName
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '')
    }
})

// Plan limits
const eventLimit = ref<{ allowed: boolean; current: number; limit: number } | null>(null)
const isLoadingLimits = ref(false)
const isSubmitting = ref(false)

// Load limits when modal opens
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

// Check if user can create event (based on plan limits from backend)
const canCreateEvent = computed(() => {
    return eventLimit.value?.allowed ?? true
})

// Watch modal open state
watch(isModalOpen, async (newOpen) => {
    if (newOpen) {
        await loadLimits()
    } else {
        // Reset form when closing
        formState.name = undefined
        formState.slug = undefined
    }
})

// Submit form
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

        isModalOpen.value = false

        // Refresh events list
        await loadUserEvents()

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

async function loadUserEvents() {
    if (import.meta.server) return

    const userId = userStore.user?.id
    if (!userId) {
        // User not yet available, keep loading state
        return
    }

    try {
        isLoading.value = true
        error.value = null

        // Fetch all events the user is a member of via API
        const data = await $fetch<{ events: EventWithDetails[] }>('/api/events')

        events.value = data.events ?? []

    } catch (err: any) {
        error.value = err.message
        console.error('Error loading events:', err)
    } finally {
        isLoading.value = false
    }
}

// Format date helper
function formatDate(dateString: string) {
    const dateLocale = locale.value === 'it' ? it : enUS
    return format(new Date(dateString), 'd MMM yyyy', { locale: dateLocale })
}

// Watch for user authentication and load events
watch(
    () => userStore.user?.id,
    (userId) => {
        if (userId) {
            loadUserEvents()
        }
    },
    { immediate: true }
)
</script>

<template>
    <div class="mb-8">
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold text-highlighted">{{ $t('dashboard.home.eventCards.title') }}</h2>
            <UButton
                variant="soft"
                size="sm"
                icon="i-lucide-plus"
                :disabled="isLoadingLimits"
                :loading="isLoadingLimits"
                @click="isModalOpen = true"
            >
                {{ $t('dashboard.home.eventCards.newButton') }}
            </UButton>
        </div>

        <!-- Create Event Modal -->
        <UModal v-model:open="isModalOpen" :title="$t('dashboard.home.eventCards.modal.title')" :description="$t('dashboard.home.eventCards.modal.description')">
            <template #body>
                <!-- Limit Reached Alert -->
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

                <!-- Usage Progress Bar -->
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

                <!-- Form -->
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
                            @click="isModalOpen = false"
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

        <!-- Loading State -->
        <div v-if="isLoading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <UCard v-for="i in 3" :key="i">
                <template #header>
                    <USkeleton class="h-6 w-32" />
                </template>
                <div class="space-y-3">
                    <USkeleton class="h-4 w-24" />
                    <USkeleton class="h-4 w-full" />
                </div>
            </UCard>
        </div>

        <!-- Error State -->
        <UCard v-else-if="error" variant="subtle">
            <div class="flex items-center gap-3 text-error">
                <UIcon name="i-lucide-alert-circle" class="size-5" />
                <span>{{ error }}</span>
            </div>
        </UCard>

        <!-- Empty State -->
        <UCard v-else-if="events.length === 0" variant="subtle">
            <div class="text-center py-8">
                <UIcon name="i-lucide-building-2" class="size-12 text-muted mx-auto mb-4" />
                <h3 class="text-lg font-medium mb-2">{{ $t('dashboard.home.eventCards.empty.title') }}</h3>
                <p class="text-muted mb-4">{{ $t('dashboard.home.eventCards.empty.description') }}</p>
                <UButton
                    icon="i-lucide-plus"
                    @click="isModalOpen = true"
                >
                    {{ $t('dashboard.home.eventCards.empty.createButton') }}
                </UButton>
            </div>
        </UCard>

        <!-- Event Cards Grid -->
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <NuxtLink
                v-for="evt in events"
                :key="evt.id"
                :to="`/dashboard/event/${evt.id}`"
                class="block"
            >
                <UCard
                    class="h-full hover:ring-primary/50 hover:ring-2 transition-all duration-200 cursor-pointer"
                >
                <template #header>
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="p-2 rounded-lg bg-primary/10">
                                <UIcon name="i-lucide-calendar-heart" class="size-5 text-primary" />
                            </div>
                            <div>
                                <h3 class="font-semibold text-highlighted">{{ evt.name }}</h3>
                                <span class="text-xs text-muted">{{ evt.slug }}</span>
                            </div>
                        </div>
                        <UIcon name="i-lucide-chevron-right" class="size-5 text-muted" />
                    </div>
                </template>

                <div class="space-y-4">
                    <!-- Members Count -->
                    <div class="flex items-center gap-2 text-sm">
                        <UIcon name="i-lucide-users" class="size-4 text-muted" />
                        <span class="text-muted">{{ evt.members_count }} {{ evt.members_count === 1 ? $t('dashboard.home.eventCards.card.member') : $t('dashboard.home.eventCards.card.members') }}</span>
                    </div>
                </div>

                <template #footer>
                    <div class="flex items-center justify-between text-xs text-muted">
                        <span>{{ $t('dashboard.home.eventCards.card.created') }} {{ formatDate(evt.created_at) }}</span>
                        <UBadge color="primary" variant="subtle" size="xs">
                            {{ $t('dashboard.home.eventCards.card.active') }}
                        </UBadge>
                    </div>
                </template>
                </UCard>
            </NuxtLink>
        </div>
    </div>
</template>
