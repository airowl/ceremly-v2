<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

const { t } = useI18n()
const toast = useToast()
const route = useRoute()
const localePath = useLocalePath()
const eventStore = useEventStore()

definePageMeta({
    title: 'Event Settings',
})

// Get event ID from route
const eventId = computed(() => route.params.id as string)

// Permission check
const canEditSettings = computed(() => {
    return eventStore.userPermissions?.can_edit_settings ?? false
})

const isOwner = computed(() => {
    return eventStore.userPermissions?.is_owner ?? false
})

// Badge Live: has slug + future date
const isLive = computed(() => {
    if (!eventStore.currentEvent) return false
    const eventDate = new Date(eventStore.currentEvent.date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return eventStore.currentEvent.slug && eventDate >= today
})

// Landing page URL
const landingUrl = computed(() => {
    if (!eventStore.currentEvent?.slug) return null
    return localePath(`/event/${eventStore.currentEvent.slug}`)
})

// Form schema with validation
const eventSchema = z.object({
    name: z.string()
        .min(2, t('event.settings.validation.nameTooShort'))
        .max(200, t('event.settings.validation.nameTooLong')),
    slug: z.string()
        .min(2, t('event.settings.validation.slugTooShort'))
        .max(50, t('event.settings.validation.slugTooLong'))
        .regex(/^[a-z0-9-]+$/, t('event.settings.validation.slugInvalid')),
    description: z.string().max(500).nullable().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
    location: z.string().max(200).nullable().optional(),
    address: z.string().max(500).nullable().optional(),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    showGuestCount: z.boolean(),
    socialProofEnabled: z.boolean(),
    maxGuests: z.number().int().min(1),
    autoConfirmRegistration: z.boolean(),
})

type EventSchema = z.output<typeof eventSchema>

// Form state - initialized from store
const formData = reactive<Partial<EventSchema>>({
    name: undefined,
    slug: undefined,
    description: undefined,
    date: undefined,
    time: undefined,
    location: undefined,
    address: undefined,
    deadline: undefined,
    primaryColor: undefined,
    showGuestCount: undefined,
    socialProofEnabled: undefined,
    maxGuests: undefined,
    autoConfirmRegistration: undefined,
})

const isSubmitting = ref(false)
const lastSavedAt = ref<Date | null>(null)
const formRef = ref()


// Computed: detect changes
const hasChanges = computed(() => {
    const ev = eventStore.currentEvent
    if (!ev) return false
    return formData.name !== ev.name
        || formData.slug !== ev.slug
        || (formData.description ?? null) !== (ev.description ?? null)
        || formData.date !== ev.date
        || (formData.time ?? null) !== (ev.time ?? null)
        || (formData.location ?? null) !== (ev.location ?? null)
        || (formData.address ?? null) !== (ev.address ?? null)
        || (formData.deadline ?? null) !== (ev.deadline ?? null)
        || formData.primaryColor !== ev.primaryColor
        || formData.showGuestCount !== ev.showGuestCount
        || formData.socialProofEnabled !== ev.socialProofEnabled
        || formData.maxGuests !== ev.maxGuests
        || formData.autoConfirmRegistration !== ev.autoConfirmRegistration
})

// Initialize form data
function syncFormFromEvent(event: typeof eventStore.currentEvent) {
    if (!event) return
    formData.name = event.name
    formData.slug = event.slug
    formData.description = event.description ?? ''
    formData.date = event.date
    formData.time = event.time ?? ''
    formData.location = event.location ?? ''
    formData.address = event.address ?? ''
    formData.deadline = event.deadline ?? ''
    formData.primaryColor = event.primaryColor
    formData.showGuestCount = event.showGuestCount
    formData.socialProofEnabled = event.socialProofEnabled
    formData.maxGuests = event.maxGuests
    formData.autoConfirmRegistration = event.autoConfirmRegistration
    lastSavedAt.value = new Date(event.updatedAt)
}

watch(() => eventStore.currentEvent, (event) => {
    if (event) syncFormFromEvent(event)
}, { immediate: true })

// Load event if not loaded
onMounted(async () => {
    if (!eventStore.currentEvent && eventId.value) {
        await eventStore.loadEvent(eventId.value)
    }
})

// Cancel handler: reset form
function onCancel() {
    syncFormFromEvent(eventStore.currentEvent)
}

// Submit handler: send only changed fields
async function onSubmit(event: FormSubmitEvent<EventSchema>) {
    if (!hasChanges.value || !canEditSettings.value) return

    isSubmitting.value = true

    try {
        const ev = eventStore.currentEvent!
        const updates: Record<string, unknown> = {}

        if (event.data.name !== ev.name) updates.name = event.data.name
        if (event.data.slug !== ev.slug) updates.slug = event.data.slug
        if ((event.data.description ?? null) !== (ev.description ?? null)) updates.description = event.data.description || null
        if (event.data.date !== ev.date) updates.date = event.data.date
        if ((event.data.time ?? null) !== (ev.time ?? null)) updates.time = event.data.time || null
        if ((event.data.location ?? null) !== (ev.location ?? null)) updates.location = event.data.location || null
        if ((event.data.address ?? null) !== (ev.address ?? null)) updates.address = event.data.address || null
        if ((event.data.deadline ?? null) !== (ev.deadline ?? null)) updates.deadline = event.data.deadline || null
        if (event.data.primaryColor !== ev.primaryColor) updates.primaryColor = event.data.primaryColor
        if (event.data.showGuestCount !== ev.showGuestCount) updates.showGuestCount = event.data.showGuestCount
        if (event.data.socialProofEnabled !== ev.socialProofEnabled) updates.socialProofEnabled = event.data.socialProofEnabled
        if (event.data.maxGuests !== ev.maxGuests) updates.maxGuests = event.data.maxGuests
        if (event.data.autoConfirmRegistration !== ev.autoConfirmRegistration) updates.autoConfirmRegistration = event.data.autoConfirmRegistration

        if (Object.keys(updates).length === 0) return

        const result = await eventStore.updateEvent(eventId.value, updates as any)

        if (result?.success) {
            lastSavedAt.value = new Date()
            toast.add({
                title: t('common.success'),
                description: t('event.settings.updateSuccess'),
                icon: 'i-lucide-check',
                color: 'success',
            })
        } else {
            const errorMessage = result?.error?.includes('permission')
                ? t('event.settings.permissionDenied')
                : t('event.settings.updateError')
            toast.add({
                title: t('common.error'),
                description: errorMessage,
                icon: 'i-lucide-alert-circle',
                color: 'error',
            })
        }
    } catch {
        toast.add({
            title: t('common.error'),
            description: t('event.settings.updateError'),
            icon: 'i-lucide-alert-circle',
            color: 'error',
        })
    } finally {
        isSubmitting.value = false
    }
}

// Delete event
const showDeleteModal = ref(false)
const deleteConfirmText = ref('')
const isDeleting = ref(false)

const deleteConfirmMatch = computed(() => {
    return deleteConfirmText.value === eventStore.currentEvent?.name
})

async function onDeleteEvent() {
    if (!deleteConfirmMatch.value || isDeleting.value) return

    isDeleting.value = true
    try {
        const result = await eventStore.deleteEvent(eventId.value)
        if (result?.success) {
            toast.add({
                title: t('common.success'),
                description: t('event.settings.deleteEvent.successMessage'),
                icon: 'i-lucide-check',
                color: 'success',
            })
            showDeleteModal.value = false
            await navigateTo(localePath('/dashboard'))
        }
    } catch {
        toast.add({
            title: t('common.error'),
            description: t('event.settings.updateError'),
            icon: 'i-lucide-alert-circle',
            color: 'error',
        })
    } finally {
        isDeleting.value = false
    }
}

// Last saved relative time
const lastSavedText = computed(() => {
    if (!lastSavedAt.value) return ''
    const diff = Math.floor((Date.now() - lastSavedAt.value.getTime()) / 1000)
    if (diff < 60) return t('event.settings.lastSaved.justNow')
    if (diff < 3600) return t('event.settings.lastSaved.minutesAgo', { n: Math.floor(diff / 60) })
    return t('event.settings.lastSaved.hoursAgo', { n: Math.floor(diff / 3600) })
})

// Refresh lastSavedText every 30s
const refreshTimer = ref<ReturnType<typeof setInterval>>()
onMounted(() => {
    refreshTimer.value = setInterval(() => {
        // Force reactivity refresh
        if (lastSavedAt.value) lastSavedAt.value = new Date(lastSavedAt.value.getTime())
    }, 30000)
})
onUnmounted(() => {
    if (refreshTimer.value) clearInterval(refreshTimer.value)
})
</script>

<template>
    <UDashboardPanel id="event-settings">
        <template #header>
            <EventPageHeader>
                <template #title>
                    <div class="flex items-center gap-3">
                        <span class="text-lg font-bold">{{ t('event.settings.title') }}</span>
                        <UBadge
                            v-if="eventStore.currentEvent"
                            :color="isLive ? 'success' : 'neutral'"
                            variant="soft"
                            size="xs"
                        >
                            {{ isLive ? t('event.settings.badge.live') : t('event.settings.badge.draft') }}
                        </UBadge>
                    </div>
                </template>
                <template #actions>
                    <UButton
                        v-if="landingUrl"
                        :to="landingUrl"
                        target="_blank"
                        variant="outline"
                        color="neutral"
                        icon="i-lucide-external-link"
                        :label="t('event.settings.viewLanding')"
                        size="sm"
                    />
                </template>
            </EventPageHeader>
        </template>

        <template #body>
            <div class="p-4 sm:p-6 space-y-8 pb-24">
                <!-- Loading State -->
                <div v-if="eventStore.isLoading && !eventStore.currentEvent" class="flex items-center justify-center py-12">
                    <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary" />
                </div>

                <!-- Settings Form -->
                <template v-else-if="eventStore.currentEvent">
                    <!-- Permission Notice -->
                    <UPageCard
                        v-if="!canEditSettings"
                        :title="t('event.settings.readOnly.title')"
                        :description="t('event.settings.readOnly.description')"
                        variant="subtle"
                        class="border-warning/30 bg-warning/5"
                    >
                        <div class="flex items-center gap-3 text-warning">
                            <UIcon name="i-lucide-lock" class="w-5 h-5 shrink-0" />
                            <p class="text-sm">{{ t('event.settings.readOnly.message') }}</p>
                        </div>
                    </UPageCard>

                    <UForm
                        ref="formRef"
                        :schema="eventSchema"
                        :state="formData"
                        @submit="onSubmit"
                    >
                        <!-- ═══ Section 1: Informazioni Base ═══ -->
                        <section class="bg-default rounded-xl border border-default overflow-hidden shadow-sm mb-8">
                            <div class="p-6 border-b border-default flex items-center gap-3">
                                <UIcon name="i-lucide-info" class="w-5 h-5 text-primary" />
                                <h3 class="font-bold text-lg">{{ t('event.settings.sections.basicInfo.title') }}</h3>
                            </div>
                            <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                                <!-- Name (full width) -->
                                <UFormField name="name" :label="t('event.settings.general.name')" class="col-span-1 md:col-span-2">
                                    <UInput
                                        v-model="formData.name"
                                        :placeholder="t('event.settings.general.namePlaceholder')"
                                        :disabled="!canEditSettings || isSubmitting"
                                        class="w-full"
                                    />
                                </UFormField>

                                <!-- Slug -->
                                <UFormField name="slug" :label="t('event.settings.general.slug')" class="col-span-1 md:col-span-2">
                                    <UInput
                                        v-model="formData.slug"
                                        :placeholder="t('event.settings.general.slugPlaceholder')"
                                        :disabled="!canEditSettings || isSubmitting"
                                        class="w-full"
                                    >
                                        <template #leading>
                                            <span class="text-muted text-sm">/</span>
                                        </template>
                                    </UInput>
                                </UFormField>

                                <!-- Description -->
                                <UFormField name="description" :label="t('event.settings.fields.description')" class="col-span-1 md:col-span-2">
                                    <UTextarea
                                        v-model="formData.description"
                                        :placeholder="t('event.settings.fields.descriptionPlaceholder')"
                                        :rows="3"
                                        :disabled="!canEditSettings || isSubmitting"
                                        class="w-full"
                                    />
                                </UFormField>

                                <!-- Date -->
                                <UFormField name="date" :label="t('event.settings.fields.date')">
                                    <UInput
                                        v-model="formData.date"
                                        type="date"
                                        :disabled="!canEditSettings || isSubmitting"
                                        class="w-full"
                                    >
                                        <template #leading>
                                            <UIcon name="i-lucide-calendar" class="text-muted" />
                                        </template>
                                    </UInput>
                                </UFormField>

                                <!-- Time -->
                                <UFormField name="time" :label="t('event.settings.fields.time')">
                                    <UInput
                                        v-model="formData.time"
                                        type="time"
                                        :placeholder="t('event.settings.fields.timePlaceholder')"
                                        :disabled="!canEditSettings || isSubmitting"
                                        class="w-full"
                                    >
                                        <template #leading>
                                            <UIcon name="i-lucide-clock" class="text-muted" />
                                        </template>
                                    </UInput>
                                </UFormField>

                                <!-- Max Guests -->
                                <UFormField name="maxGuests" :label="t('event.settings.fields.maxGuests')" :description="t('event.settings.fields.maxGuestsDescription')" class="col-span-1 md:col-span-2">
                                    <UInput
                                        v-model.number="formData.maxGuests"
                                        type="number"
                                        :min="1"
                                        :disabled="!canEditSettings || isSubmitting"
                                        class="w-full"
                                    />
                                </UFormField>
                            </div>
                        </section>

                        <!-- ═══ Section 2: Logistica ═══ -->
                        <section class="bg-default rounded-xl border border-default overflow-hidden shadow-sm mb-8">
                            <div class="p-6 border-b border-default flex items-center gap-3">
                                <UIcon name="i-lucide-map-pin" class="w-5 h-5 text-primary" />
                                <h3 class="font-bold text-lg">{{ t('event.settings.sections.logistics.title') }}</h3>
                            </div>
                            <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                                <!-- Location fields -->
                                <div class="flex flex-col gap-6">
                                    <UFormField name="location" :label="t('event.settings.fields.location')">
                                        <UInput
                                            v-model="formData.location"
                                            :placeholder="t('event.settings.fields.locationPlaceholder')"
                                            :disabled="!canEditSettings || isSubmitting"
                                            class="w-full"
                                        />
                                    </UFormField>

                                    <UFormField name="address" :label="t('event.settings.fields.address')">
                                        <UInput
                                            v-model="formData.address"
                                            :placeholder="t('event.settings.fields.addressPlaceholder')"
                                            :disabled="!canEditSettings || isSubmitting"
                                            class="w-full"
                                        />
                                    </UFormField>
                                </div>

                                <!-- Map placeholder -->
                                <div class="h-full min-h-[180px] rounded-xl overflow-hidden bg-muted/30 relative border border-default flex items-center justify-center">
                                    <div v-if="formData.address" class="text-center p-4">
                                        <UIcon name="i-lucide-map-pin" class="w-8 h-8 text-muted mb-2" />
                                        <p class="text-sm text-muted font-medium">{{ formData.address }}</p>
                                        <p class="text-xs text-muted mt-1">{{ t('event.settings.mapPlaceholder.configureKey') }}</p>
                                    </div>
                                    <div v-else class="text-center p-4">
                                        <UIcon name="i-lucide-map" class="w-8 h-8 text-muted mb-2" />
                                        <p class="text-sm text-muted">{{ t('event.settings.mapPlaceholder.title') }}</p>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <!-- ═══ Section 3: Landing & Personalizzazione ═══ -->
                        <section class="bg-default rounded-xl border border-default overflow-hidden shadow-sm mb-8">
                            <div class="p-6 border-b border-default flex items-center gap-3">
                                <UIcon name="i-lucide-palette" class="w-5 h-5 text-primary" />
                                <h3 class="font-bold text-lg">{{ t('event.settings.sections.landing.title') }}</h3>
                            </div>
                            <div class="p-6 space-y-8">
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <!-- Deadline -->
                                    <UFormField name="deadline" :label="t('event.settings.fields.deadline')">
                                        <UInput
                                            v-model="formData.deadline"
                                            type="date"
                                            :disabled="!canEditSettings || isSubmitting"
                                            class="w-full"
                                        />
                                    </UFormField>

                                    <!-- Primary Color -->
                                    <UFormField name="primaryColor" :label="t('event.settings.fields.primaryColor')">
                                        <div class="flex items-center gap-3">
                                            <input
                                                v-model="formData.primaryColor"
                                                type="color"
                                                class="w-12 h-12 rounded-lg border-2 border-default cursor-pointer p-1 shrink-0"
                                                :disabled="!canEditSettings || isSubmitting"
                                            >
                                            <div class="flex-1 px-4 py-3 rounded-lg border border-default bg-muted/30 text-sm font-mono">
                                                {{ formData.primaryColor?.toUpperCase() }}
                                            </div>
                                        </div>
                                    </UFormField>
                                </div>

                                <!-- Toggles -->
                                <div class="space-y-4 pt-4 border-t border-default">
                                    <!-- Show Guest Count -->
                                    <div class="flex items-center justify-between p-4 rounded-xl bg-muted/30">
                                        <div>
                                            <p class="font-bold text-sm">{{ t('event.settings.fields.showGuestCount') }}</p>
                                            <p class="text-xs text-muted">{{ t('event.settings.fields.showGuestCountDescription') }}</p>
                                        </div>
                                        <USwitch
                                            v-model="formData.showGuestCount"
                                            :disabled="!canEditSettings || isSubmitting"
                                        />
                                    </div>

                                    <!-- Social Proof -->
                                    <div class="flex items-center justify-between p-4 rounded-xl bg-muted/30">
                                        <div>
                                            <p class="font-bold text-sm">{{ t('event.settings.fields.socialProof') }}</p>
                                            <p class="text-xs text-muted">{{ t('event.settings.fields.socialProofDescription') }}</p>
                                        </div>
                                        <USwitch
                                            v-model="formData.socialProofEnabled"
                                            :disabled="!canEditSettings || isSubmitting"
                                        />
                                    </div>
                                </div>
                            </div>
                        </section>

                        <!-- ═══ Section 4: Automazione ═══ -->
                        <section class="bg-default rounded-xl border border-default overflow-hidden shadow-sm mb-8">
                            <div class="p-6 border-b border-default flex items-center gap-3">
                                <UIcon name="i-lucide-bot" class="w-5 h-5 text-primary" />
                                <h3 class="font-bold text-lg">{{ t('event.settings.sections.automation.title') }}</h3>
                            </div>
                            <div class="p-6">
                                <div class="flex items-center justify-between p-4 rounded-xl border-2 border-primary/20 bg-primary/5">
                                    <div class="flex gap-4">
                                        <UIcon name="i-lucide-check-circle-2" class="w-8 h-8 text-primary shrink-0" />
                                        <div>
                                            <p class="font-bold">{{ t('event.settings.fields.autoConfirm') }}</p>
                                            <p class="text-sm text-muted max-w-md">{{ t('event.settings.fields.autoConfirmDescription') }}</p>
                                        </div>
                                    </div>
                                    <USwitch
                                        v-model="formData.autoConfirmRegistration"
                                        :disabled="!canEditSettings || isSubmitting"
                                    />
                                </div>
                            </div>
                        </section>

                        <!-- ═══ Section 5: Danger Zone ═══ -->
                        <section
                            v-if="isOwner"
                            class="rounded-xl border-2 border-error/20 bg-error/5 p-6 flex flex-col md:flex-row items-center justify-between gap-4"
                        >
                            <div>
                                <h3 class="font-bold text-error">{{ t('event.settings.deleteEvent.title') }}</h3>
                                <p class="text-sm text-error/80">{{ t('event.settings.deleteEvent.description') }}</p>
                            </div>
                            <UButton
                                :label="t('event.settings.deleteEvent.button')"
                                color="error"
                                variant="outline"
                                @click="showDeleteModal = true"
                            />
                        </section>

                        <!-- Hidden submit trigger -->
                        <button ref="submitBtn" type="submit" class="hidden" />
                    </UForm>

                    <!-- Delete Confirmation Modal -->
                    <UModal v-model:open="showDeleteModal">
                        <template #header>
                            <h3 class="font-bold text-lg">{{ t('event.settings.deleteEvent.confirmTitle') }}</h3>
                        </template>
                        <template #body>
                            <div class="space-y-4">
                                <p class="text-sm text-muted">{{ t('event.settings.deleteEvent.confirmMessage') }}</p>
                                <UFormField :label="t('event.settings.deleteEvent.confirmInput')">
                                    <UInput
                                        v-model="deleteConfirmText"
                                        :placeholder="eventStore.currentEvent?.name"
                                    />
                                </UFormField>
                                <div class="flex justify-end gap-3">
                                    <UButton
                                        :label="t('common.cancel')"
                                        color="neutral"
                                        variant="subtle"
                                        @click="showDeleteModal = false; deleteConfirmText = ''"
                                    />
                                    <UButton
                                        :label="t('event.settings.deleteEvent.button')"
                                        color="error"
                                        :disabled="!deleteConfirmMatch"
                                        :loading="isDeleting"
                                        @click="onDeleteEvent"
                                    />
                                </div>
                            </div>
                        </template>
                    </UModal>
                </template>

                <!-- Error State -->
                <div v-else-if="eventStore.error" class="text-center py-12">
                    <UIcon name="i-lucide-alert-circle" class="w-12 h-12 text-error mx-auto mb-4" />
                    <p class="text-muted">{{ eventStore.error }}</p>
                </div>
            </div>

            <!-- ═══ Sticky Footer Bar ═══ -->
            <div
                v-if="canEditSettings && eventStore.currentEvent"
                class="sticky bottom-0 left-0 right-0 bg-default border-t border-default p-4 shadow-lg z-20"
            >
                <div class="max-w-4xl mx-auto flex items-center justify-between">
                    <p v-if="lastSavedText" class="text-xs text-muted font-medium flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full bg-muted animate-pulse" />
                        {{ lastSavedText }}
                    </p>
                    <div v-else />
                    <div class="flex items-center gap-4">
                        <UButton
                            :label="t('event.settings.cancel')"
                            color="neutral"
                            variant="ghost"
                            :disabled="!hasChanges || isSubmitting"
                            @click="onCancel"
                        />
                        <UButton
                            :label="t('common.saveChanges')"
                            icon="i-lucide-save"
                            :loading="isSubmitting"
                            :disabled="!hasChanges || isSubmitting"
                            @click="formRef?.$el?.requestSubmit()"
                        />
                    </div>
                </div>
            </div>
        </template>
    </UDashboardPanel>
</template>
