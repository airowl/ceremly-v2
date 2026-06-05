<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import { format } from 'date-fns'
import { it as itLocale, enUS } from 'date-fns/locale'

const { t, locale } = useI18n()
const localePath = useLocalePath()

const UIcon = resolveComponent('UIcon')
const UProgress = resolveComponent('UProgress')
const UButton = resolveComponent('UButton')

interface UpcomingEvent {
    id: string
    name: string
    date: string
    icon: string
    iconBg: string
    iconColor: string
    totalGuests: number
    confirmedGuests: number
    rsvpPercentage: number
}

const events = ref<UpcomingEvent[]>([
    {
        id: '1',
        name: 'Matrimonio Luca & Sofia',
        date: '2026-06-15',
        icon: 'i-lucide-heart',
        iconBg: 'bg-pink-100',
        iconColor: 'text-pink-500',
        totalGuests: 200,
        confirmedGuests: 170,
        rsvpPercentage: 85,
    },
    {
        id: '2',
        name: 'Corporate Gala 2026',
        date: '2026-07-22',
        icon: 'i-lucide-building-2',
        iconBg: 'bg-blue-100',
        iconColor: 'text-blue-500',
        totalGuests: 500,
        confirmedGuests: 210,
        rsvpPercentage: 42,
    },
    {
        id: '3',
        name: 'Compleanno Andrea',
        date: '2026-09-05',
        icon: 'i-lucide-cake',
        iconBg: 'bg-orange-100',
        iconColor: 'text-orange-500',
        totalGuests: 50,
        confirmedGuests: 6,
        rsvpPercentage: 12,
    },
])

function formatDate(dateString: string) {
    const dateLocale = locale.value === 'it' ? itLocale : enUS
    return format(new Date(dateString), 'd MMM yyyy', { locale: dateLocale })
}

const columns: TableColumn<UpcomingEvent>[] = [
    {
        accessorKey: 'name',
        header: () => t('dashboard.home.eventsTable.columns.event'),
        cell: ({ row }) => {
            return h('div', { class: 'flex items-center gap-3' }, [
                h('div', {
                    class: `w-10 h-10 rounded-lg flex items-center justify-center ${row.original.iconBg}`
                }, [
                    h(UIcon, { name: row.original.icon, class: `size-5 ${row.original.iconColor}` })
                ]),
                h('span', { class: 'font-bold text-highlighted' }, row.getValue('name') as string)
            ])
        }
    },
    {
        accessorKey: 'date',
        header: () => t('dashboard.home.eventsTable.columns.date'),
        cell: ({ row }) => h('span', { class: 'text-sm font-medium text-muted' }, formatDate(row.getValue('date') as string))
    },
    {
        accessorKey: 'rsvpPercentage',
        header: () => t('dashboard.home.eventsTable.columns.rsvpProgress'),
        cell: ({ row }) => {
            const pct = row.getValue('rsvpPercentage') as number
            const confirmed = row.original.confirmedGuests
            const total = row.original.totalGuests
            return h('div', { class: 'w-full max-w-xs' }, [
                h('div', { class: 'flex justify-between mb-1 text-xs font-bold' }, [
                    h('span', { class: 'text-primary' }, `${pct}%`),
                    h('span', { class: 'text-muted' }, `${confirmed}/${total}`)
                ]),
                h(UProgress, {
                    'model-value': pct,
                    max: 100,
                    color: 'primary',
                    size: 'xs',
                })
            ])
        }
    },
    {
        accessorKey: 'id',
        header: () => t('dashboard.home.eventsTable.columns.actions'),
        cell: () => {
            return h(UButton, {
                icon: 'i-lucide-more-vertical',
                color: 'neutral',
                variant: 'ghost',
                size: 'xs',
                square: true,
            })
        }
    }
]
</script>

<template>
    <UCard>
        <template #header>
            <div class="flex items-center justify-between">
                <p class="text-base font-semibold text-highlighted">
                    {{ t('dashboard.home.eventsTable.title') }}
                </p>
                <NuxtLink :to="localePath('/dashboard/event')" class="text-primary text-sm font-bold hover:underline">
                    {{ t('dashboard.home.eventsTable.viewAll') }}
                </NuxtLink>
            </div>
        </template>

        <UTable
            :data="events"
            :columns="columns"
            :ui="{
                base: 'table-fixed',
                thead: '[&>tr]:bg-elevated/50 [&>tr]:after:content-none',
                tbody: '[&>tr]:last:[&>td]:border-b-0 [&>tr]:hover:bg-elevated/30 [&>tr]:transition-colors',
                th: 'text-xs uppercase text-muted font-black tracking-widest',
                td: 'border-b border-default py-4'
            }"
        />
    </UCard>
</template>
