<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { getPaginationRowModel } from '@tanstack/vue-table'

// Types
interface ReminderTemplate {
    id: string
    eventId: string
    name: string
    type: 'email' | 'whatsapp'
    subject: string | null
    body: string
    isDefault: boolean
    isActive: boolean
    createdAt: string
    updatedAt: string
}

definePageMeta({
    title: 'Reminder',
})

// ── Core refs & composables ──
const route = useRoute()
const toast = useToast()
const eventId = computed(() => route.params.id as string)

const {
    templates,
    stats,
    isLoading,
    loadTemplates,
    loadStats,
    toggleActive,
    deleteTemplate,
} = useReminders(eventId)

// ── Resolve Nuxt UI components for render functions ──
const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UIcon = resolveComponent('UIcon')
const USwitch = resolveComponent('USwitch')

// ── Search (debounced, client-side) ──
const searchQuery = ref('')
let searchTimeout: ReturnType<typeof setTimeout> | null = null
const debouncedSearch = ref('')

watch(searchQuery, (val) => {
    if (searchTimeout) clearTimeout(searchTimeout)
    searchTimeout = setTimeout(() => {
        debouncedSearch.value = val.toLowerCase()
    }, 300)
})

const filteredTemplates = computed(() => {
    if (!debouncedSearch.value) return templates.value
    const q = debouncedSearch.value
    return templates.value.filter(t =>
        t.name.toLowerCase().includes(q)
        || t.type.toLowerCase().includes(q)
        || (t.isActive ? 'attivo' : 'disattivato').includes(q),
    )
})

// ── Table columns ──
const columns: TableColumn<ReminderTemplate>[] = [
    {
        accessorKey: 'name',
        header: 'Titolo Reminder',
        cell: ({ row }) => {
            const t = row.original
            return h('div', { class: 'space-y-0.5' }, [
                h('span', { class: 'font-bold' }, t.name),
                h('p', { class: 'text-xs text-muted font-medium' },
                    `Creato il ${new Date(t.createdAt).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}`,
                ),
            ])
        },
    },
    {
        id: 'channel',
        header: 'Canale',
        cell: ({ row }) => {
            const t = row.original
            const isEmail = t.type === 'email'
            return h('div', { class: 'flex items-center gap-2' }, [
                h('div', {
                    class: `p-1.5 rounded ${isEmail ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`,
                }, [
                    h(UIcon, {
                        name: isEmail ? 'i-lucide-mail' : 'i-lucide-message-circle',
                        class: 'size-4',
                    }),
                ]),
                h('span', { class: 'text-sm font-medium' }, isEmail ? 'Email' : 'WhatsApp'),
            ])
        },
    },
    {
        id: 'status',
        header: 'Stato',
        cell: ({ row }) => {
            const t = row.original
            return h('div', { class: 'flex justify-center' }, [
                h(USwitch, {
                    'modelValue': t.isActive,
                    'onUpdate:modelValue': (val: boolean) => handleToggle(t.id, val),
                }),
            ])
        },
    },
    {
        id: 'actions',
        header: 'Azioni Rapide',
        cell: ({ row }) => {
            const t = row.original
            return h('div', { class: 'flex items-center justify-end gap-2' }, [
                h(UButton, {
                    'icon': 'i-lucide-pencil',
                    'color': 'neutral',
                    'variant': 'ghost',
                    'size': 'xs',
                    'square': true,
                    'aria-label': 'Modifica reminder',
                    'to': `/dashboard/event/${eventId.value}/reminders/${t.id}`,
                }),
                h(UButton, {
                    'icon': 'i-lucide-trash-2',
                    'color': 'error',
                    'variant': 'ghost',
                    'size': 'xs',
                    'square': true,
                    'aria-label': 'Elimina reminder',
                    'disabled': t.isDefault,
                    'onClick': () => confirmDeleteTemplate(t),
                }),
            ])
        },
    },
]

// ── Pagination (client-side via TanStack) ──
const pagination = ref({ pageIndex: 0, pageSize: 10 })
const table = useTemplateRef('reminderTable')

const paginationText = computed(() => {
    const total = filteredTemplates.value.length
    if (total === 0) return ''
    const start = pagination.value.pageIndex * pagination.value.pageSize + 1
    const end = Math.min(start + pagination.value.pageSize - 1, total)
    return `Mostrando ${start}-${end} di ${total} reminder`
})

// ── Toggle handler ──
async function handleToggle(templateId: string, isActive: boolean) {
    const result = await toggleActive(templateId, isActive)
    if (result.success) {
        toast.add({
            title: isActive ? 'Reminder attivato' : 'Reminder disattivato',
            color: 'success',
        })
    } else {
        toast.add({
            title: 'Errore',
            description: result.error || 'Impossibile aggiornare lo stato.',
            color: 'error',
        })
    }
}

// ── Delete confirmation ──
const showDeleteModal = ref(false)
const templateToDelete = ref<ReminderTemplate | null>(null)
const isDeleting = ref(false)

function confirmDeleteTemplate(t: ReminderTemplate) {
    templateToDelete.value = t
    showDeleteModal.value = true
}

async function handleDeleteTemplate() {
    if (!templateToDelete.value) return
    isDeleting.value = true
    try {
        await deleteTemplate(templateToDelete.value.id)
        toast.add({ title: 'Reminder eliminato', color: 'success' })
        showDeleteModal.value = false
        templateToDelete.value = null
        await loadStats()
    } catch {
        toast.add({
            title: 'Errore',
            description: 'Impossibile eliminare il reminder.',
            color: 'error',
        })
    } finally {
        isDeleting.value = false
    }
}

// ── Lifecycle ──
onMounted(async () => {
    await Promise.all([loadTemplates(), loadStats()])
})
</script>

<template>
    <UDashboardPanel id="reminders">
        <template #header>
            <EventPageHeader title="Reminder">
                <template #actions>
                    <UButton
                        label="Nuovo Reminder"
                        icon="i-lucide-plus"
                        :to="`/dashboard/event/${eventId}/reminders/new`"
                    />
                </template>
            </EventPageHeader>
        </template>

        <template #body>
            <div class="p-4 sm:p-6 space-y-6">
                <!-- Page title -->
                <div>
                    <h1 class="text-2xl font-extrabold tracking-tight">Lista Contenuti Reminder</h1>
                    <p class="text-muted text-sm mt-1">
                        Gestisci i tuoi trigger e le notifiche automatiche per ogni canale.
                    </p>
                </div>

                <!-- Loading state -->
                <div v-if="isLoading && templates.length === 0" class="p-6 space-y-3">
                    <USkeleton v-for="i in 4" :key="i" class="h-16 w-full rounded-lg" />
                </div>

                <template v-else>
                    <!-- Table card -->
                    <div class="bg-default rounded-xl border border-default overflow-hidden flex flex-col">
                        <!-- Search bar -->
                        <div class="p-4 border-b border-default">
                            <UInput
                                v-model="searchQuery"
                                icon="i-lucide-search"
                                placeholder="Cerca reminder per titolo, canale o stato..."
                                class="w-full"
                            />
                        </div>

                        <!-- Empty state -->
                        <div
                            v-if="filteredTemplates.length === 0"
                            class="flex flex-col items-center justify-center gap-4 py-16"
                        >
                            <UIcon name="i-lucide-bell-off" class="size-12 text-muted" />
                            <div class="text-center space-y-1">
                                <p class="font-medium">Nessun reminder trovato</p>
                                <p class="text-sm text-muted">
                                    {{ debouncedSearch ? 'Prova a modificare la ricerca.' : 'Crea il tuo primo reminder per iniziare.' }}
                                </p>
                            </div>
                            <UButton
                                v-if="!debouncedSearch"
                                label="Crea Reminder"
                                icon="i-lucide-plus"
                                :to="`/dashboard/event/${eventId}/reminders/new`"
                            />
                        </div>

                        <!-- Reminder table -->
                        <template v-else>
                            <div class="overflow-x-auto">
                                <UTable
                                    ref="reminderTable"
                                    v-model:pagination="pagination"
                                    :pagination-options="{
                                        getPaginationRowModel: getPaginationRowModel(),
                                    }"
                                    :data="filteredTemplates"
                                    :columns="columns"
                                    :loading="isLoading"
                                    class="shrink-0"
                                    :ui="{
                                        base: 'table-fixed',
                                        thead: '[&>tr]:bg-elevated/50 [&>tr]:after:content-none',
                                        tbody: '[&>tr]:last:[&>td]:border-b-0',
                                        th: 'px-6 py-3 first:rounded-l-lg last:rounded-r-lg text-[11px] font-black uppercase tracking-widest text-muted',
                                        td: 'px-6 py-4',
                                    }"
                                />
                            </div>

                            <!-- Pagination -->
                            <div class="px-6 py-4 bg-elevated/30 border-t border-default flex items-center justify-between">
                                <p class="text-xs font-bold text-muted uppercase tracking-widest">
                                    {{ paginationText }}
                                </p>
                                <UPagination
                                    :default-page="(table?.tableApi?.getState().pagination.pageIndex || 0) + 1"
                                    :items-per-page="table?.tableApi?.getState().pagination.pageSize"
                                    :total="table?.tableApi?.getFilteredRowModel().rows.length"
                                    @update:page="(p: number) => table?.tableApi?.setPageIndex(p - 1)"
                                />
                            </div>
                        </template>
                    </div>

                    <!-- Stats cards -->
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <!-- Total Active -->
                        <div class="bg-default p-5 rounded-xl border border-default border-l-4 border-l-primary">
                            <div class="flex justify-between items-start mb-3">
                                <div class="p-2 bg-primary/10 rounded-lg">
                                    <UIcon name="i-lucide-bell-ring" class="size-5 text-primary" />
                                </div>
                            </div>
                            <p class="text-primary text-xs font-bold uppercase tracking-widest">Total Active</p>
                            <p class="text-3xl font-black text-highlighted mt-1">{{ stats.totalActive }}</p>
                        </div>

                        <!-- Email Sent Today -->
                        <div class="bg-default p-5 rounded-xl border border-default">
                            <div class="flex justify-between items-start mb-3">
                                <div class="p-2 bg-blue-500/10 rounded-lg">
                                    <UIcon name="i-lucide-mail" class="size-5 text-blue-500" />
                                </div>
                            </div>
                            <p class="text-muted text-xs font-bold uppercase tracking-widest">Email Sent Today</p>
                            <p class="text-3xl font-black text-highlighted mt-1">{{ stats.emailSentToday }}</p>
                        </div>

                        <!-- WhatsApp Sent Today -->
                        <div class="bg-default p-5 rounded-xl border border-default">
                            <div class="flex justify-between items-start mb-3">
                                <div class="p-2 bg-green-500/10 rounded-lg">
                                    <UIcon name="i-lucide-message-circle" class="size-5 text-green-500" />
                                </div>
                            </div>
                            <p class="text-muted text-xs font-bold uppercase tracking-widest">WhatsApp Sent Today</p>
                            <p class="text-3xl font-black text-highlighted mt-1">{{ stats.whatsappSentToday }}</p>
                        </div>
                    </div>
                </template>
            </div>
        </template>
    </UDashboardPanel>

    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="showDeleteModal">
        <template #content>
            <UCard>
                <template #header>
                    <h3 class="text-lg font-semibold text-error">Elimina Reminder</h3>
                </template>

                <p>
                    Sei sicuro di voler eliminare il reminder
                    <strong>{{ templateToDelete?.name }}</strong>?
                    Questa azione non puo' essere annullata.
                </p>

                <template #footer>
                    <div class="flex justify-end gap-2">
                        <UButton
                            label="Annulla"
                            color="neutral"
                            variant="ghost"
                            @click="showDeleteModal = false"
                        />
                        <UButton
                            label="Elimina"
                            color="error"
                            :loading="isDeleting"
                            @click="handleDeleteTemplate"
                        />
                    </div>
                </template>
            </UCard>
        </template>
    </UModal>
</template>
