<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

interface Guest {
    id: string
    name: string
    email: string | null
    phone: string | null
    status: 'pending' | 'yes' | 'no'
    createdAt: string
}

const props = defineProps<{
    guests: Guest[]
    isLoading: boolean
    eventId: string
}>()

// Resolve Nuxt UI components for render functions
const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UIcon = resolveComponent('UIcon')

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

const statusMap: Record<string, { label: string; icon: string }> = {
    yes: { label: 'Confermato', icon: 'i-lucide-circle-check' },
    pending: { label: 'In attesa', icon: 'i-lucide-clock' },
    no: { label: 'Rifiutato', icon: 'i-lucide-circle-x' },
}

function handleWhatsApp(guest: Guest) {
    if (!guest.phone) return
    const phone = guest.phone.replace(/\D/g, '')
    const message = `Ciao ${guest.name}, ti ricordiamo di confermare la tua partecipazione!`
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank')
}

const columns: TableColumn<Guest>[] = [
    {
        accessorKey: 'name',
        header: 'Invitato',
        cell: ({ row }) => {
            const guest = row.original
            return h('div', { class: 'flex items-center gap-3' }, [
                h('div', {
                    class: `h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${getAvatarColor(guest.status)}`,
                }, getInitials(guest.name)),
                h('span', { class: 'font-bold text-sm' }, guest.name),
            ])
        },
    },
    {
        id: 'contact',
        header: 'Contatti',
        cell: ({ row }) => {
            const guest = row.original
            const items: any[] = []
            if (guest.email) {
                items.push(h('p', { class: 'text-sm text-muted' }, guest.email))
            }
            if (guest.phone) {
                items.push(h('p', { class: 'text-xs text-muted' }, guest.phone))
            }
            if (items.length === 0) {
                return h(UBadge, { color: 'warning', variant: 'subtle', size: 'xs' }, () => 'Nessun contatto')
            }
            return h('div', {}, items)
        },
    },
    {
        id: 'status',
        header: 'Stato',
        cell: ({ row }) => {
            const s = statusMap[row.original.status] ?? statusMap.pending!
            return h('span', {
                class: `inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
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
        header: '',
        cell: ({ row }) => {
            const guest = row.original
            if (guest.status === 'pending' && guest.phone) {
                return h(UButton, {
                    icon: 'i-lucide-message-circle',
                    color: 'success',
                    variant: 'soft',
                    size: 'xs',
                    square: true,
                    'aria-label': 'Invia WhatsApp',
                    onClick: () => handleWhatsApp(guest),
                })
            }
            return h(UButton, {
                icon: 'i-lucide-more-vertical',
                color: 'neutral',
                variant: 'ghost',
                size: 'xs',
                square: true,
                to: `/dashboard/event/${props.eventId}/guests`,
            })
        },
    },
]
</script>

<template>
    <div class="bg-default rounded-xl border border-default overflow-hidden">
        <!-- Header -->
        <div class="p-5 border-b border-default flex justify-between items-center">
            <h3 class="text-base font-bold text-highlighted">Ultimi Invitati</h3>
            <div class="flex gap-2">
                <UButton
                    label="Export"
                    icon="i-lucide-download"
                    color="neutral"
                    variant="outline"
                    size="xs"
                    :to="`/dashboard/event/${eventId}/guests`"
                />
                <UButton
                    label="Aggiungi"
                    icon="i-lucide-user-plus"
                    color="primary"
                    size="xs"
                    :to="`/dashboard/event/${eventId}/guests`"
                />
            </div>
        </div>

        <!-- Loading state -->
        <div v-if="isLoading && guests.length === 0" class="p-5 space-y-3">
            <USkeleton v-for="i in 5" :key="i" class="h-12 w-full rounded-lg" />
        </div>

        <!-- Empty state -->
        <div v-else-if="guests.length === 0" class="flex flex-col items-center justify-center gap-3 py-12">
            <UIcon name="i-lucide-users" class="size-10 text-muted" />
            <p class="text-sm text-muted">Nessun invitato ancora</p>
            <UButton
                label="Aggiungi il primo"
                icon="i-lucide-plus"
                color="primary"
                size="sm"
                :to="`/dashboard/event/${eventId}/guests`"
            />
        </div>

        <!-- Guest table -->
        <template v-else>
            <UTable
                :data="guests"
                :columns="columns"
                :ui="{
                    thead: '[&>tr]:bg-elevated/50 [&>tr]:after:content-none',
                    tbody: '[&>tr]:last:[&>td]:border-b-0',
                    th: 'px-5 py-3 text-[11px] font-black uppercase tracking-widest text-muted',
                    td: 'px-5 py-3',
                }"
            />
        </template>

        <!-- Footer link -->
        <div v-if="guests.length > 0" class="p-4 bg-elevated/30 border-t border-default flex justify-center">
            <UButton
                label="Vedi tutti gli invitati"
                color="primary"
                variant="link"
                size="sm"
                class="font-bold"
                icon="i-lucide-arrow-right"
                trailing
                :to="`/dashboard/event/${eventId}/guests`"
            />
        </div>
    </div>
</template>
