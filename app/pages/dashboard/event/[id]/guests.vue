<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { FormSubmitEvent } from '@nuxt/ui'
import { getPaginationRowModel } from '@tanstack/vue-table'
import * as z from 'zod'

// ---------------------------------------------------------------------------
// Page meta
// ---------------------------------------------------------------------------
definePageMeta({
    title: 'Invitati',
})

// ---------------------------------------------------------------------------
// Core refs & composables
// ---------------------------------------------------------------------------
const route = useRoute()
const toast = useToast()
const eventId = computed(() => route.params.id as string)
const eventStore = useEventStore()
const { guests, summary, isLoading, error, filters, loadGuests, addGuest, updateGuest, deleteGuest, importGuests } = useGuests(eventId)

// Load event data for breadcrumb if not already loaded
onMounted(async () => {
    if (!eventStore.currentEvent && eventId.value) {
        await eventStore.loadEvent(eventId.value)
    }
})

// ---------------------------------------------------------------------------
// Resolve Nuxt UI components for render functions
// ---------------------------------------------------------------------------
const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UIcon = resolveComponent('UIcon')

// ---------------------------------------------------------------------------
// Guest type (local for template typing)
// ---------------------------------------------------------------------------
interface Guest {
    id: string
    name: string
    email: string | null
    phone: string | null
    group: string | null
    status: 'pending' | 'yes' | 'no'
    source: 'manual' | 'csv' | 'registration'
    respondedAt: string | null
    lastEmailSentAt: string | null
    emailSentCount: number
    lastWhatsappClickedAt: string | null
    createdAt: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
    return name.slice(0, 2).toUpperCase()
}

function getAvatarColor(status: string): string {
    if (status === 'yes') return 'bg-emerald-100 text-emerald-600'
    if (status === 'no') return 'bg-red-100 text-red-600'
    return 'bg-elevated text-muted'
}

const groupColorMap: Record<string, string> = {}
const groupColors = [
    'bg-blue-100 text-blue-600',
    'bg-purple-100 text-purple-600',
    'bg-teal-100 text-teal-600',
    'bg-orange-100 text-orange-600',
    'bg-pink-100 text-pink-600',
    'bg-cyan-100 text-cyan-600',
]

function getGroupColor(group: string): string {
    if (!groupColorMap[group]) {
        const idx = Object.keys(groupColorMap).length % groupColors.length
        groupColorMap[group] = groupColors[idx]!
    }
    return groupColorMap[group]!
}

// ---------------------------------------------------------------------------
// Status filter (segmented tabs)
// ---------------------------------------------------------------------------
const statusFilter = ref<string>('all')
const statusTabs = [
    { label: 'Tutti', value: 'all' },
    { label: 'Sì', value: 'yes' },
    { label: 'No', value: 'no' },
    { label: 'In attesa', value: 'pending' },
]

watch(statusFilter, (val) => {
    filters.value.status = val === 'all' ? null : val as 'pending' | 'yes' | 'no'
    loadGuests()
})

// ---------------------------------------------------------------------------
// Search (debounced)
// ---------------------------------------------------------------------------
const searchQuery = ref('')
let searchTimeout: ReturnType<typeof setTimeout> | null = null

watch(searchQuery, (val) => {
    if (searchTimeout) clearTimeout(searchTimeout)
    searchTimeout = setTimeout(() => {
        filters.value.search = val || ''
        loadGuests()
    }, 300)
})

// ---------------------------------------------------------------------------
// Table columns
// ---------------------------------------------------------------------------
const statusMap: Record<string, { label: string; color: 'success' | 'warning' | 'error'; icon: string }> = {
    yes: { label: 'Sì', color: 'success', icon: 'i-lucide-circle-check' },
    pending: { label: 'In attesa', color: 'warning', icon: 'i-lucide-clock' },
    no: { label: 'No', color: 'error', icon: 'i-lucide-circle-x' },
}

const columns: TableColumn<Guest>[] = [
    {
        accessorKey: 'name',
        header: 'Nome Invitato',
        cell: ({ row }) => {
            const guest = row.original
            return h('div', { class: 'flex items-center gap-3' }, [
                h('div', {
                    class: `h-9 w-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${getAvatarColor(guest.status)}`,
                }, getInitials(guest.name)),
                h('span', { class: 'font-bold' }, guest.name),
            ])
        },
    },
    {
        id: 'contact',
        header: 'Contatto',
        cell: ({ row }) => {
            const guest = row.original
            if (guest.email) return h('span', { class: 'text-sm text-muted font-medium' }, guest.email)
            if (guest.phone) return h('span', { class: 'text-sm text-muted font-medium' }, guest.phone)
            return h(UBadge, { color: 'warning', variant: 'subtle', size: 'sm' }, () => 'Non contattabile')
        },
    },
    {
        accessorKey: 'group',
        header: 'Gruppo',
        cell: ({ row }) => {
            const group = row.original.group
            if (!group) return h('span', { class: 'text-muted' }, '-')
            return h('span', {
                class: `inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${getGroupColor(group)}`,
            }, group)
        },
    },
    {
        id: 'status',
        accessorKey: 'status',
        header: 'Stato',
        cell: ({ row }) => {
            const s = statusMap[row.original.status] ?? statusMap.pending!
            return h('span', {
                class: `inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border ${
                    row.original.status === 'yes'
                        ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                        : row.original.status === 'no'
                            ? 'bg-red-100 text-red-700 border-red-200'
                            : 'bg-amber-100 text-amber-700 border-amber-200'
                }`,
            }, [
                h(UIcon, { name: s.icon, class: 'size-3.5' }),
                s.label,
            ])
        },
    },
    {
        id: 'actions',
        header: 'Azioni',
        cell: ({ row }) => {
            const guest = row.original
            const buttons: any[] = []

            // WhatsApp button for pending guests with phone
            if (guest.status === 'pending' && guest.phone) {
                buttons.push(h(UButton, {
                    label: 'Invia WhatsApp',
                    icon: 'i-lucide-message-circle',
                    color: 'success',
                    variant: 'soft',
                    size: 'xs',
                    onClick: () => handleWhatsApp(guest),
                }))
            }

            // Edit button (always)
            buttons.push(h(UButton, {
                icon: 'i-lucide-pencil',
                color: 'neutral',
                variant: 'ghost',
                size: 'xs',
                square: true,
                'aria-label': 'Modifica invitato',
                onClick: () => openEditModal(guest),
            }))

            // Delete button (not for pending with WhatsApp - design choice)
            if (guest.status !== 'pending') {
                buttons.push(h(UButton, {
                    icon: 'i-lucide-trash-2',
                    color: 'error',
                    variant: 'ghost',
                    size: 'xs',
                    square: true,
                    'aria-label': 'Elimina invitato',
                    onClick: () => openDeleteConfirm(guest),
                }))
            }

            return h('div', { class: 'flex items-center justify-end gap-2' }, buttons)
        },
    },
]

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------
const pagination = ref({
    pageIndex: 0,
    pageSize: 15,
})

const table = useTemplateRef('guestTable')

const paginationText = computed(() => {
    const total = (guests.value as Guest[])?.length || 0
    if (total === 0) return ''
    const start = pagination.value.pageIndex * pagination.value.pageSize + 1
    const end = Math.min(start + pagination.value.pageSize - 1, total)
    return `Mostrando ${start}-${end} di ${total} invitati`
})

// ---------------------------------------------------------------------------
// WhatsApp handler
// ---------------------------------------------------------------------------
async function handleWhatsApp(guest: Guest) {
    if (!guest.phone) return

    const phone = guest.phone.replace(/\D/g, '')
    const message = `Ciao ${guest.name}, ti ricordiamo di confermare la tua partecipazione!`
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank')

    // Track the click
    try {
        await updateGuest(guest.id, { customFields: { lastWhatsappClick: new Date().toISOString() } })
    } catch {
        // Non-blocking — tracking failure should not affect UX
    }
}

// ---------------------------------------------------------------------------
// Add Guest Modal
// ---------------------------------------------------------------------------
const showAddModal = ref(false)

const addSchema = z.object({
    name: z.string().min(1, 'Il nome e obbligatorio').max(200),
    email: z.string().email('Email non valida').optional().or(z.literal('')),
    phone: z.string().max(30).optional().or(z.literal('')),
    group: z.string().max(100).optional().or(z.literal('')),
})
type AddSchema = z.output<typeof addSchema>

const addState = reactive<{ name: string; email: string; phone: string; group: string }>({
    name: '',
    email: '',
    phone: '',
    group: '',
})
const isAddSubmitting = ref(false)

function resetAddForm() {
    addState.name = ''
    addState.email = ''
    addState.phone = ''
    addState.group = ''
}

async function onAddSubmit(event: FormSubmitEvent<AddSchema>) {
    isAddSubmitting.value = true
    try {
        await addGuest({
            name: event.data.name,
            email: event.data.email || undefined,
            phone: event.data.phone || undefined,
            group: event.data.group || undefined,
        })
        toast.add({ title: 'Invitato aggiunto', color: 'success' })
        showAddModal.value = false
        resetAddForm()
        await loadGuests()
    } catch (err: any) {
        toast.add({
            title: 'Errore',
            description: err?.data?.statusMessage || err?.message || 'Impossibile aggiungere l\'invitato',
            color: 'error',
        })
    } finally {
        isAddSubmitting.value = false
    }
}

// ---------------------------------------------------------------------------
// Edit Guest Modal
// ---------------------------------------------------------------------------
const showEditModal = ref(false)

const editSchema = z.object({
    name: z.string().min(1, 'Il nome e obbligatorio').max(200),
    email: z.string().email('Email non valida').optional().or(z.literal('')),
    phone: z.string().max(30).optional().or(z.literal('')),
    group: z.string().max(100).optional().or(z.literal('')),
    status: z.enum(['pending', 'yes', 'no']),
})
type EditSchema = z.output<typeof editSchema>

const editState = reactive<{ id: string; name: string; email: string; phone: string; group: string; status: 'pending' | 'yes' | 'no' }>({
    id: '',
    name: '',
    email: '',
    phone: '',
    group: '',
    status: 'pending',
})
const isEditSubmitting = ref(false)

const editStatusOptions = [
    { label: 'In attesa', value: 'pending' },
    { label: 'Confermato', value: 'yes' },
    { label: 'Declinato', value: 'no' },
]

function openEditModal(guest: Guest) {
    editState.id = guest.id
    editState.name = guest.name
    editState.email = guest.email ?? ''
    editState.phone = guest.phone ?? ''
    editState.group = guest.group ?? ''
    editState.status = guest.status
    showEditModal.value = true
}

async function onEditSubmit(event: FormSubmitEvent<EditSchema>) {
    isEditSubmitting.value = true
    try {
        await updateGuest(editState.id, {
            name: event.data.name,
            email: event.data.email || null,
            phone: event.data.phone || null,
            group: event.data.group || null,
            status: event.data.status,
        })
        toast.add({ title: 'Invitato aggiornato', color: 'success' })
        showEditModal.value = false
        await loadGuests()
    } catch (err: any) {
        toast.add({
            title: 'Errore',
            description: err?.data?.statusMessage || err?.message || 'Impossibile aggiornare l\'invitato',
            color: 'error',
        })
    } finally {
        isEditSubmitting.value = false
    }
}

// ---------------------------------------------------------------------------
// Delete Confirmation Modal
// ---------------------------------------------------------------------------
const showDeleteModal = ref(false)
const guestToDelete = ref<Guest | null>(null)
const isDeleting = ref(false)

function openDeleteConfirm(guest: Guest) {
    guestToDelete.value = guest
    showDeleteModal.value = true
}

async function confirmDelete() {
    if (!guestToDelete.value) return
    isDeleting.value = true
    try {
        await deleteGuest(guestToDelete.value.id)
        toast.add({ title: 'Invitato eliminato', color: 'success' })
        showDeleteModal.value = false
        guestToDelete.value = null
        await loadGuests()
    } catch (err: any) {
        toast.add({
            title: 'Errore',
            description: err?.data?.statusMessage || err?.message || 'Impossibile eliminare l\'invitato',
            color: 'error',
        })
    } finally {
        isDeleting.value = false
    }
}

// ---------------------------------------------------------------------------
// CSV Import Modal
// ---------------------------------------------------------------------------
const showImportModal = ref(false)
const importStep = ref<'upload' | 'preview' | 'result'>('upload')
const csvFile = ref<File | null>(null)
const csvRows = ref<Array<{ name: string; email: string; phone: string; group: string }>>([])
const csvParseError = ref('')
const isImporting = ref(false)
const importResult = ref<{ imported: number; duplicates: number; errors: string[] } | null>(null)

function resetImport() {
    importStep.value = 'upload'
    csvFile.value = null
    csvRows.value = []
    csvParseError.value = ''
    importResult.value = null
}

function handleFileChange(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    csvFile.value = file
    csvParseError.value = ''

    const reader = new FileReader()
    reader.onload = () => {
        try {
            const text = reader.result as string
            const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
            if (lines.length < 2) {
                csvParseError.value = 'Il file deve contenere almeno una riga di intestazione e una riga di dati.'
                return
            }

            const separator = lines[0]!.includes(';') ? ';' : ','
            const headerLine = lines[0]!.toLowerCase()
            const headers = headerLine.split(separator).map((h) => h.trim())

            const nameIdx = headers.findIndex((h) => h === 'name' || h === 'nome')
            const emailIdx = headers.findIndex((h) => h === 'email' || h === 'e-mail')
            const phoneIdx = headers.findIndex((h) => h === 'phone' || h === 'telefono' || h === 'tel')
            const groupIdx = headers.findIndex((h) => h === 'group' || h === 'gruppo')

            if (nameIdx === -1) {
                csvParseError.value = 'Colonna "name" o "nome" non trovata nell\'intestazione del CSV.'
                return
            }

            const parsed: typeof csvRows.value = []
            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i]!.split(separator).map((c) => c.trim())
                const name = cols[nameIdx] ?? ''
                if (!name) continue

                parsed.push({
                    name,
                    email: emailIdx !== -1 ? (cols[emailIdx] ?? '') : '',
                    phone: phoneIdx !== -1 ? (cols[phoneIdx] ?? '') : '',
                    group: groupIdx !== -1 ? (cols[groupIdx] ?? '') : '',
                })
            }

            if (parsed.length === 0) {
                csvParseError.value = 'Nessuna riga valida trovata nel file CSV.'
                return
            }

            csvRows.value = parsed
            importStep.value = 'preview'
        } catch {
            csvParseError.value = 'Errore durante la lettura del file CSV.'
        }
    }
    reader.readAsText(file)
}

async function submitImport() {
    if (csvRows.value.length === 0) return
    isImporting.value = true
    try {
        const result = await importGuests(
            csvRows.value.map((r: { name: string; email: string; phone: string; group: string }) => ({
                name: r.name,
                email: r.email || undefined,
                phone: r.phone || undefined,
                group: r.group || undefined,
            })),
        )
        if (result && 'imported' in result) {
            importResult.value = { imported: result.imported, duplicates: result.duplicates, errors: result.errors }
        }
        importStep.value = 'result'
        await loadGuests()
    } catch (err: any) {
        toast.add({
            title: 'Errore importazione',
            description: err?.data?.statusMessage || err?.message || 'Impossibile importare gli invitati',
            color: 'error',
        })
    } finally {
        isImporting.value = false
    }
}
</script>

<template>
    <UDashboardPanel id="event-guests">
        <template #header>
            <EventPageHeader title="Invitati">
                <template #actions>
                    <UButton
                        label="Importa CSV"
                        icon="i-lucide-upload"
                        color="neutral"
                        variant="outline"
                        size="sm"
                        @click="resetImport(); showImportModal = true"
                    />
                    <UButton
                        label="Aggiungi Invitato"
                        icon="i-lucide-user-plus"
                        color="primary"
                        size="sm"
                        @click="resetAddForm(); showAddModal = true"
                    />
                </template>
            </EventPageHeader>
        </template>

        <template #body>
            <!-- Error state -->
            <div v-if="error" class="flex flex-col items-center justify-center gap-4 py-16">
                <UIcon name="i-lucide-alert-circle" class="size-12 text-error" />
                <p class="text-sm text-muted">Errore nel caricamento degli invitati.</p>
                <UButton label="Riprova" color="primary" variant="soft" @click="loadGuests" />
            </div>

            <template v-else>
                <!-- ========================================================= -->
                <!-- Stats Cards                                               -->
                <!-- ========================================================= -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <!-- Total -->
                    <div class="bg-default p-5 rounded-xl border border-default">
                        <div class="flex justify-between items-start mb-3">
                            <div class="p-2 bg-primary/10 rounded-lg">
                                <UIcon name="i-lucide-users" class="size-5 text-primary" />
                            </div>
                        </div>
                        <p class="text-muted text-xs font-bold uppercase tracking-widest">Totale Invitati</p>
                        <p class="text-3xl font-black text-highlighted mt-1">{{ summary.total }}</p>
                    </div>

                    <!-- Confirmed -->
                    <div class="bg-default p-5 rounded-xl border border-default border-l-4 border-l-emerald-500">
                        <div class="flex justify-between items-start mb-3">
                            <div class="p-2 bg-emerald-500/10 rounded-lg">
                                <UIcon name="i-lucide-circle-check" class="size-5 text-emerald-500" />
                            </div>
                        </div>
                        <p class="text-muted text-xs font-bold uppercase tracking-widest">Confermati (Sì)</p>
                        <p class="text-3xl font-black text-highlighted mt-1">{{ summary.confirmed }}</p>
                    </div>

                    <!-- Declined -->
                    <div class="bg-default p-5 rounded-xl border border-default border-l-4 border-l-red-500">
                        <div class="flex justify-between items-start mb-3">
                            <div class="p-2 bg-red-500/10 rounded-lg">
                                <UIcon name="i-lucide-circle-x" class="size-5 text-red-500" />
                            </div>
                        </div>
                        <p class="text-muted text-xs font-bold uppercase tracking-widest">Rifiutati (No)</p>
                        <p class="text-3xl font-black text-highlighted mt-1">{{ summary.declined }}</p>
                    </div>

                    <!-- Pending -->
                    <div class="bg-default p-5 rounded-xl border border-default border-l-4 border-l-amber-500">
                        <div class="flex justify-between items-start mb-3">
                            <div class="p-2 bg-amber-500/10 rounded-lg">
                                <UIcon name="i-lucide-clock" class="size-5 text-amber-500" />
                            </div>
                        </div>
                        <p class="text-muted text-xs font-bold uppercase tracking-widest">In attesa</p>
                        <p class="text-3xl font-black text-highlighted mt-1">{{ summary.pending }}</p>
                    </div>
                </div>

                <!-- ========================================================= -->
                <!-- Table Card                                                -->
                <!-- ========================================================= -->
                <div class="bg-default rounded-xl border border-default overflow-hidden flex flex-col">
                    <!-- Toolbar -->
                    <div class="p-4 border-b border-default flex flex-col sm:flex-row items-center justify-between gap-4">
                        <UInput
                            v-model="searchQuery"
                            icon="i-lucide-search"
                            placeholder="Cerca invitato per nome, email o gruppo..."
                            class="w-full sm:w-96"
                        />
                        <div class="flex items-center gap-2 w-full sm:w-auto">
                            <div class="flex bg-elevated/50 p-1 rounded-lg">
                                <button
                                    v-for="tab in statusTabs"
                                    :key="tab.value"
                                    class="px-4 py-1.5 text-xs font-bold rounded-md transition-colors"
                                    :class="statusFilter === tab.value
                                        ? 'bg-default shadow-sm text-primary'
                                        : 'text-muted hover:text-highlighted'"
                                    @click="statusFilter = tab.value"
                                >
                                    {{ tab.label }}
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Loading state -->
                    <div v-if="isLoading && (!guests || guests.length === 0)" class="p-6 space-y-3">
                        <USkeleton v-for="i in 5" :key="i" class="h-14 w-full rounded-lg" />
                    </div>

                    <!-- Empty state -->
                    <div v-else-if="!guests || guests.length === 0" class="flex flex-col items-center justify-center gap-4 py-16">
                        <UIcon name="i-lucide-users" class="size-12 text-muted" />
                        <div class="text-center space-y-1">
                            <p class="font-medium">Nessun invitato</p>
                            <p class="text-sm text-muted">Aggiungi invitati manualmente o importali da un file CSV.</p>
                        </div>
                        <div class="flex items-center gap-2">
                            <UButton
                                label="Importa CSV"
                                icon="i-lucide-upload"
                                color="neutral"
                                variant="outline"
                                size="sm"
                                @click="resetImport(); showImportModal = true"
                            />
                            <UButton
                                label="Aggiungi invitato"
                                icon="i-lucide-plus"
                                color="primary"
                                size="sm"
                                @click="resetAddForm(); showAddModal = true"
                            />
                        </div>
                    </div>

                    <!-- Guest table -->
                    <template v-else>
                        <div class="overflow-x-auto">
                            <UTable
                                ref="guestTable"
                                v-model:pagination="pagination"
                                :pagination-options="{
                                    getPaginationRowModel: getPaginationRowModel(),
                                }"
                                :data="(guests as Guest[])"
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
            </template>

            <!-- ============================================================ -->
            <!-- Add Guest Modal                                              -->
            <!-- ============================================================ -->
            <UModal v-model:open="showAddModal" title="Aggiungi invitato" description="Inserisci i dati del nuovo invitato.">
                <template #body>
                    <UForm :schema="addSchema" :state="addState" class="space-y-4" @submit="onAddSubmit">
                        <UFormField label="Nome" name="name" required>
                            <UInput v-model="addState.name" placeholder="Mario Rossi" class="w-full" />
                        </UFormField>
                        <UFormField label="Email" name="email">
                            <UInput v-model="addState.email" type="email" placeholder="mario@esempio.it" class="w-full" />
                        </UFormField>
                        <UFormField label="Telefono" name="phone">
                            <UInput v-model="addState.phone" type="tel" placeholder="+39 333 1234567" class="w-full" />
                        </UFormField>
                        <UFormField label="Gruppo" name="group">
                            <UInput v-model="addState.group" placeholder="es. Amici, Famiglia, Colleghi" class="w-full" />
                        </UFormField>
                        <div class="flex justify-end gap-2 pt-2">
                            <UButton label="Annulla" color="neutral" variant="subtle" @click="showAddModal = false" />
                            <UButton label="Aggiungi" color="primary" type="submit" :loading="isAddSubmitting" />
                        </div>
                    </UForm>
                </template>
            </UModal>

            <!-- ============================================================ -->
            <!-- Edit Guest Modal                                             -->
            <!-- ============================================================ -->
            <UModal v-model:open="showEditModal" title="Modifica invitato" description="Modifica i dati dell'invitato.">
                <template #body>
                    <UForm :schema="editSchema" :state="editState" class="space-y-4" @submit="onEditSubmit">
                        <UFormField label="Nome" name="name" required>
                            <UInput v-model="editState.name" class="w-full" />
                        </UFormField>
                        <UFormField label="Email" name="email">
                            <UInput v-model="editState.email" type="email" class="w-full" />
                        </UFormField>
                        <UFormField label="Telefono" name="phone">
                            <UInput v-model="editState.phone" type="tel" class="w-full" />
                        </UFormField>
                        <UFormField label="Gruppo" name="group">
                            <UInput v-model="editState.group" placeholder="es. Amici, Famiglia, Colleghi" class="w-full" />
                        </UFormField>
                        <UFormField label="Stato" name="status">
                            <USelect v-model="editState.status" :items="editStatusOptions" class="w-full" />
                        </UFormField>
                        <div class="flex justify-end gap-2 pt-2">
                            <UButton label="Annulla" color="neutral" variant="subtle" @click="showEditModal = false" />
                            <UButton label="Salva" color="primary" type="submit" :loading="isEditSubmitting" />
                        </div>
                    </UForm>
                </template>
            </UModal>

            <!-- ============================================================ -->
            <!-- Delete Confirmation Modal                                    -->
            <!-- ============================================================ -->
            <UModal v-model:open="showDeleteModal" title="Elimina invitato" description="Questa azione non puo essere annullata.">
                <template #body>
                    <div class="space-y-4">
                        <div class="bg-error/10 border border-error/20 rounded-lg p-4">
                            <div class="flex items-start gap-3">
                                <UIcon name="i-lucide-alert-triangle" class="size-5 text-error shrink-0 mt-0.5" />
                                <p class="text-sm">
                                    Sei sicuro di voler eliminare <strong>{{ guestToDelete?.name }}</strong>?
                                    Tutti i dati associati verranno rimossi permanentemente.
                                </p>
                            </div>
                        </div>
                        <div class="flex justify-end gap-2">
                            <UButton label="Annulla" color="neutral" variant="subtle" @click="showDeleteModal = false" />
                            <UButton label="Elimina" color="error" :loading="isDeleting" @click="confirmDelete" />
                        </div>
                    </div>
                </template>
            </UModal>

            <!-- ============================================================ -->
            <!-- CSV Import Modal                                             -->
            <!-- ============================================================ -->
            <UModal
                v-model:open="showImportModal"
                title="Importa invitati da CSV"
                :description="importStep === 'upload'
                    ? 'Seleziona un file CSV con colonne: nome, email (opzionale), telefono (opzionale), gruppo (opzionale).'
                    : importStep === 'preview'
                        ? `${csvRows.length} righe trovate. Verifica i dati e conferma l\'importazione.`
                        : 'Risultato dell\'importazione.'"
            >
                <template #body>
                    <!-- Step 1: File upload -->
                    <div v-if="importStep === 'upload'" class="space-y-4">
                        <div class="border-2 border-dashed border-default rounded-lg p-8 text-center">
                            <UIcon name="i-lucide-file-up" class="size-10 text-muted mx-auto mb-3" />
                            <p class="text-sm text-muted mb-4">Trascina un file CSV o clicca per selezionarlo</p>
                            <label
                                class="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-white text-sm font-medium cursor-pointer hover:bg-primary-600 transition-colors"
                            >
                                <UIcon name="i-lucide-upload" class="size-4" />
                                Seleziona file
                                <input
                                    type="file"
                                    accept=".csv,text/csv"
                                    class="sr-only"
                                    @change="handleFileChange"
                                />
                            </label>
                            <p v-if="csvFile" class="text-xs text-muted mt-3">{{ csvFile.name }}</p>
                        </div>

                        <div v-if="csvParseError" class="bg-error/10 border border-error/20 rounded-lg p-3">
                            <p class="text-sm text-error">{{ csvParseError }}</p>
                        </div>

                        <div class="bg-elevated/30 rounded-lg p-3">
                            <p class="text-xs text-muted font-medium mb-1">Formato richiesto:</p>
                            <code class="text-xs block">nome,email,telefono,gruppo</code>
                            <code class="text-xs block">Mario Rossi,mario@esempio.it,+39 333 1234567,Amici</code>
                        </div>
                    </div>

                    <!-- Step 2: Preview -->
                    <div v-else-if="importStep === 'preview'" class="space-y-4">
                        <div class="max-h-64 overflow-auto border border-default rounded-lg">
                            <table class="min-w-full text-sm" role="table">
                                <thead class="bg-elevated/50">
                                    <tr>
                                        <th class="px-3 py-2 text-left font-medium text-muted">#</th>
                                        <th class="px-3 py-2 text-left font-medium text-muted">Nome</th>
                                        <th class="px-3 py-2 text-left font-medium text-muted">Email</th>
                                        <th class="px-3 py-2 text-left font-medium text-muted">Telefono</th>
                                        <th class="px-3 py-2 text-left font-medium text-muted">Gruppo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="(row, idx) in csvRows" :key="idx" class="border-t border-default">
                                        <td class="px-3 py-2 text-muted">{{ idx + 1 }}</td>
                                        <td class="px-3 py-2">{{ row.name }}</td>
                                        <td class="px-3 py-2">{{ row.email || '-' }}</td>
                                        <td class="px-3 py-2">{{ row.phone || '-' }}</td>
                                        <td class="px-3 py-2">{{ row.group || '-' }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <p class="text-sm text-muted">
                            <strong>{{ csvRows.length }}</strong> invitati verranno importati.
                        </p>

                        <div class="flex justify-end gap-2">
                            <UButton label="Indietro" color="neutral" variant="subtle" @click="importStep = 'upload'" />
                            <UButton label="Importa" color="primary" :loading="isImporting" @click="submitImport" />
                        </div>
                    </div>

                    <!-- Step 3: Result -->
                    <div v-else-if="importStep === 'result' && importResult" class="space-y-4">
                        <div class="bg-success/10 border border-success/20 rounded-lg p-4">
                            <div class="flex items-center gap-3">
                                <UIcon name="i-lucide-check-circle" class="size-6 text-success shrink-0" />
                                <div>
                                    <p class="font-medium">Importazione completata</p>
                                    <p class="text-sm text-muted mt-1">
                                        <strong>{{ importResult.imported }}</strong> invitati importati con successo.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div v-if="importResult.duplicates > 0" class="bg-warning/10 border border-warning/20 rounded-lg p-3">
                            <p class="text-sm">
                                <strong>{{ importResult.duplicates }}</strong> duplicati ignorati (email gia presenti).
                            </p>
                        </div>

                        <div v-if="importResult.errors.length > 0" class="bg-error/10 border border-error/20 rounded-lg p-3">
                            <p class="text-sm font-medium mb-1">Errori:</p>
                            <ul class="text-sm text-muted space-y-1">
                                <li v-for="(err, idx) in importResult.errors" :key="idx">{{ err }}</li>
                            </ul>
                        </div>

                        <div class="flex justify-end">
                            <UButton label="Chiudi" color="neutral" variant="subtle" @click="showImportModal = false" />
                        </div>
                    </div>
                </template>
            </UModal>
        </template>
    </UDashboardPanel>
</template>
