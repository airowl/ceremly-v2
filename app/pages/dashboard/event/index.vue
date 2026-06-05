<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'
import { format } from 'date-fns'
import { it, enUS } from 'date-fns/locale'
import { useUserStore } from '~/stores/userStore'

interface EventListItem {
    id: string
    name: string
    slug: string
    description: string | null
    date: string
    time: string | null
    location: string | null
    primaryColor: string
    showGuestCount: boolean
    autoConfirmRegistration: boolean
    createdAt: string
}

definePageMeta({
    title: 'Events',
    layout: 'dashboard'
})

const { t, locale } = useI18n()
const toast = useToast()
const router = useRouter()
const userStore = useUserStore()

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UIcon = resolveComponent('UIcon')

const search = ref('')

// --- Events data ---
const { data: events, status, error, refresh } = await useAsyncData(
    'events-list',
    async () => {
        if (import.meta.server) return []
        try {
            const response = await $fetch<{ events: EventListItem[] }>('/api/events')
            return response.events ?? []
        } catch (err: any) {
            toast.add({
                title: t('dashboard.eventsList.empty.title'),
                description: err.message,
                color: 'error'
            })
            throw err
        }
    },
    { server: false }
)

provide('refreshEvents', refresh)

function isEventActive(event: EventListItem): boolean {
    const eventDate = new Date(event.date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return eventDate >= today
}

const stats = computed(() => {
    const all = events.value ?? []
    const active = all.filter(isEventActive).length
    return {
        total: all.length,
        active,
        completed: all.length - active
    }
})

function formatDate(dateString: string) {
    const dateLocale = locale.value === 'it' ? it : enUS
    return format(new Date(dateString), 'd MMM yyyy', { locale: dateLocale })
}

const filteredEvents = computed(() => {
    const all = events.value ?? []
    if (!search.value) return all
    const q = search.value.toLowerCase()
    return all.filter((e: EventListItem) =>
        e.name.toLowerCase().includes(q) ||
        e.location?.toLowerCase().includes(q) ||
        e.slug.toLowerCase().includes(q)
    )
})

// --- Create Event Modal ---
const isModalOpen = ref(false)
const isSubmitting = ref(false)

const schema = computed(() => z.object({
    name: z.string().min(1, t('dashboard.eventsList.modal.validation.nameRequired')).max(200),
    date: z.string().min(1, t('dashboard.eventsList.modal.validation.dateRequired')).regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal('')),
    location: z.string().max(200).optional().or(z.literal('')),
    address: z.string().max(500).optional().or(z.literal(''))
}))

type Schema = z.output<typeof schema.value>

const formState = reactive({
    name: '',
    date: '',
    time: '',
    location: '',
    address: ''
})

// Plan limits
const eventLimit = ref<{ allowed: boolean; current: number; limit: number } | null>(null)
const isLoadingLimits = ref(false)

async function loadLimits() {
    if (!userStore.user?.id) return
    isLoadingLimits.value = true
    try {
        eventLimit.value = await userStore.checkEventCreationLimit()
    } catch (err) {
        console.error('Error loading limits:', err)
    } finally {
        isLoadingLimits.value = false
    }
}

const canCreateEvent = computed(() => eventLimit.value?.allowed ?? true)

watch(isModalOpen, async (open) => {
    if (open) {
        await loadLimits()
    } else {
        formState.name = ''
        formState.date = ''
        formState.time = ''
        formState.location = ''
        formState.address = ''
    }
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
    if (!canCreateEvent.value) return

    isSubmitting.value = true
    try {
        const body: Record<string, any> = {
            name: event.data.name,
            date: event.data.date
        }
        if (event.data.time) body.time = event.data.time
        if (event.data.location) body.location = event.data.location
        if (event.data.address) body.address = event.data.address

        const response = await $fetch<{ event: { id: string } }>('/api/events', {
            method: 'POST',
            body
        })

        toast.add({
            title: t('dashboard.eventsList.modal.success'),
            description: t('dashboard.eventsList.modal.successDescription', { name: event.data.name }),
            color: 'success'
        })

        isModalOpen.value = false
        await refresh()

        if (response.event?.id) {
            router.push(`/dashboard/event/${response.event.id}`)
        }
    } catch (err: any) {
        toast.add({
            title: t('dashboard.eventsList.modal.error'),
            description: err.data?.message || err.message || t('dashboard.eventsList.modal.errorDescription'),
            color: 'error'
        })
    } finally {
        isSubmitting.value = false
    }
}

// --- Table columns ---
const columns: TableColumn<EventListItem>[] = [
    {
        accessorKey: 'name',
        header: () => t('dashboard.eventsList.columns.name'),
        cell: ({ row }) => {
            return h('div', { class: 'flex items-center gap-3' }, [
                h('div', {
                    class: 'size-10 rounded-lg flex items-center justify-center shrink-0',
                    style: { backgroundColor: `${row.original.primaryColor}1A` }
                }, [
                    h(UIcon, {
                        name: 'i-lucide-calendar-heart',
                        class: 'size-5',
                        style: { color: row.original.primaryColor }
                    })
                ]),
                h('span', { class: 'font-semibold text-sm text-highlighted' }, row.original.name)
            ])
        }
    },
    {
        accessorKey: 'date',
        header: () => t('dashboard.eventsList.columns.date'),
        cell: ({ row }) => h('span', { class: 'text-sm' }, formatDate(row.original.date))
    },
    {
        accessorKey: 'time',
        header: () => t('dashboard.eventsList.columns.time'),
        cell: ({ row }) => h('span', { class: 'text-sm text-muted' }, row.original.time ?? '—')
    },
    {
        accessorKey: 'location',
        header: () => t('dashboard.eventsList.columns.location'),
        cell: ({ row }) => h('span', { class: 'text-sm text-muted' }, row.original.location ?? '—')
    },
    {
        id: 'status',
        header: () => t('dashboard.eventsList.columns.status'),
        cell: ({ row }) => {
            const active = isEventActive(row.original)
            return h(UBadge, {
                color: active ? 'primary' : 'success',
                variant: 'subtle',
                size: 'sm'
            }, () => active ? t('dashboard.eventsList.status.active') : t('dashboard.eventsList.status.completed'))
        }
    },
    {
        id: 'actions',
        header: () => h('span', { class: 'text-right block' }, t('dashboard.eventsList.columns.actions')),
        cell: ({ row }) => {
            const active = isEventActive(row.original)
            return h('div', { class: 'text-right' }, [
                h(UButton, {
                    icon: active ? 'i-lucide-pencil' : 'i-lucide-eye',
                    color: 'neutral',
                    variant: 'ghost',
                    size: 'sm',
                    to: `/dashboard/event/${row.original.id}`
                })
            ])
        }
    }
]
</script>

<template>
    <UDashboardPanel id="events-list">
        <template #header>
            <UDashboardNavbar :title="$t('dashboard.eventsList.title')" :ui="{ right: 'gap-3' }">
                <template #leading>
                    <UDashboardSidebarCollapse />
                </template>

                <template #right>
                    <UInput
                        v-model="search"
                        icon="i-lucide-search"
                        :placeholder="$t('dashboard.eventsList.search')"
                        class="max-w-64 hidden lg:block"
                    />
                    <UButton
                        icon="i-lucide-plus"
                        :label="$t('dashboard.eventsList.createEvent')"
                        @click="isModalOpen = true"
                    />
                </template>
            </UDashboardNavbar>
        </template>

        <template #body>
            <!-- Stats Overview -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div class="bg-default p-5 rounded-xl border border-default flex items-center justify-between">
                    <div>
                        <p class="text-muted text-sm font-medium mb-1">{{ $t('dashboard.eventsList.stats.total') }}</p>
                        <h3 class="text-3xl font-bold text-highlighted">{{ stats.total }}</h3>
                    </div>
                    <div class="size-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <UIcon name="i-lucide-calendar" class="size-5 text-primary" />
                    </div>
                </div>
                <div class="bg-default p-5 rounded-xl border border-default flex items-center justify-between">
                    <div>
                        <p class="text-muted text-sm font-medium mb-1">{{ $t('dashboard.eventsList.stats.active') }}</p>
                        <h3 class="text-3xl font-bold text-highlighted">{{ stats.active }}</h3>
                    </div>
                    <div class="size-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                        <UIcon name="i-lucide-play-circle" class="size-5 text-emerald-500" />
                    </div>
                </div>
                <div class="bg-default p-5 rounded-xl border border-default flex items-center justify-between">
                    <div>
                        <p class="text-muted text-sm font-medium mb-1">{{ $t('dashboard.eventsList.stats.completed') }}</p>
                        <h3 class="text-3xl font-bold text-highlighted">{{ stats.completed }}</h3>
                    </div>
                    <div class="size-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                        <UIcon name="i-lucide-check-circle" class="size-5 text-amber-500" />
                    </div>
                </div>
            </div>

            <!-- Loading State -->
            <div v-if="status === 'pending'" class="flex items-center justify-center py-12">
                <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-primary" />
            </div>

            <!-- Error State -->
            <div v-else-if="error" class="text-center py-12">
                <UIcon name="i-lucide-alert-circle" class="size-12 text-error mx-auto mb-4" />
                <p class="text-muted">{{ error.message }}</p>
            </div>

            <!-- Empty State -->
            <div v-else-if="!events?.length" class="text-center py-12">
                <UIcon name="i-lucide-calendar-x" class="size-12 text-muted mx-auto mb-4" />
                <h3 class="text-lg font-medium mb-2">{{ $t('dashboard.eventsList.empty.title') }}</h3>
                <p class="text-muted mb-4">{{ $t('dashboard.eventsList.empty.description') }}</p>
                <UButton icon="i-lucide-plus" @click="isModalOpen = true">
                    {{ $t('dashboard.eventsList.empty.createButton') }}
                </UButton>
            </div>

            <!-- Events Table -->
            <div v-else class="bg-default rounded-xl border border-default overflow-hidden">
                <UTable
                    :data="filteredEvents"
                    :columns="columns"
                    :ui="{
                        base: 'table-fixed',
                        thead: '[&>tr]:bg-elevated/50 [&>tr]:after:content-none',
                        tbody: '[&>tr]:last:[&>td]:border-b-0',
                        th: 'py-3 first:rounded-l-lg last:rounded-r-lg text-xs uppercase tracking-wider font-bold',
                        td: 'py-4'
                    }"
                />
            </div>
        </template>
    </UDashboardPanel>

    <!-- Create Event Modal -->
    <UModal v-model:open="isModalOpen" :title="$t('dashboard.eventsList.modal.title')">
        <template #body>
            <!-- Limit Reached Alert -->
            <UAlert v-if="!canCreateEvent && eventLimit" color="warning" variant="subtle" class="mb-4">
                <template #icon>
                    <UIcon name="i-lucide-alert-triangle" class="size-5" />
                </template>
                <template #description>
                    <p class="text-sm">
                        {{ $t('dashboard.eventsList.modal.limitWarning', { limit: eventLimit.limit }) }}
                        <NuxtLink to="/dashboard/subscription" class="underline font-medium">
                            {{ $t('dashboard.eventsList.modal.upgrade') }}
                        </NuxtLink>
                    </p>
                </template>
            </UAlert>

            <!-- Usage Progress Bar -->
            <div v-else-if="eventLimit" class="mb-4 p-3 bg-elevated rounded-lg">
                <div class="flex justify-between items-center text-sm mb-2">
                    <span class="text-muted">{{ $t('dashboard.eventsList.modal.eventsUsed') }}</span>
                    <span class="font-medium">{{ eventLimit.current }} / {{ eventLimit.limit }}</span>
                </div>
                <UProgress
                    :model-value="eventLimit.current"
                    :max="eventLimit.limit"
                    :color="eventLimit.current >= eventLimit.limit ? 'error' : 'primary'"
                />
            </div>

            <!-- Form -->
            <UForm :schema="schema" :state="formState" class="space-y-5" @submit="onSubmit">
                <UFormField :label="$t('dashboard.eventsList.modal.name')" name="name" required>
                    <UInput
                        v-model="formState.name"
                        :placeholder="$t('dashboard.eventsList.modal.namePlaceholder')"
                        :disabled="!canCreateEvent"
                        class="w-full"
                    />
                </UFormField>

                <div class="grid grid-cols-2 gap-4">
                    <UFormField :label="$t('dashboard.eventsList.modal.date')" name="date" required>
                        <UInput
                            v-model="formState.date"
                            type="date"
                            :disabled="!canCreateEvent"
                            class="w-full"
                        >
                            <template #leading>
                                <UIcon name="i-lucide-calendar" class="size-4 text-muted" />
                            </template>
                        </UInput>
                    </UFormField>

                    <UFormField :label="$t('dashboard.eventsList.modal.time')" name="time">
                        <UInput
                            v-model="formState.time"
                            type="time"
                            :disabled="!canCreateEvent"
                            class="w-full"
                        >
                            <template #leading>
                                <UIcon name="i-lucide-clock" class="size-4 text-muted" />
                            </template>
                        </UInput>
                    </UFormField>
                </div>

                <UFormField :label="$t('dashboard.eventsList.modal.location')" name="location">
                    <UInput
                        v-model="formState.location"
                        :placeholder="$t('dashboard.eventsList.modal.locationPlaceholder')"
                        :disabled="!canCreateEvent"
                        class="w-full"
                    >
                        <template #leading>
                            <UIcon name="i-lucide-map-pin" class="size-4 text-muted" />
                        </template>
                    </UInput>
                </UFormField>

                <UFormField :label="$t('dashboard.eventsList.modal.address')" name="address">
                    <UInput
                        v-model="formState.address"
                        :placeholder="$t('dashboard.eventsList.modal.addressPlaceholder')"
                        :disabled="!canCreateEvent"
                        class="w-full"
                    />
                </UFormField>

                <div class="flex items-center justify-end gap-3 pt-2">
                    <UButton
                        :label="$t('dashboard.eventsList.modal.cancel')"
                        color="neutral"
                        variant="ghost"
                        @click="isModalOpen = false"
                    />
                    <UButton
                        :label="isSubmitting ? $t('dashboard.eventsList.modal.creating') : $t('dashboard.eventsList.modal.create')"
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
