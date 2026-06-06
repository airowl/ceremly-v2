<script setup lang="ts">
import { ref, computed, provide, h } from 'vue'
import { resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import { format } from 'date-fns'
import { it, enUS } from 'date-fns/locale'
import { useOrganizationStore, type OrganizationListItem } from '~/stores/organizationStore'

definePageMeta({ title: 'Organizations', layout: 'dashboard' })

const { t, locale } = useI18n()
const router = useRouter()
const orgStore = useOrganizationStore()

const UButton = resolveComponent('UButton')

const search = ref('')

await useAsyncData('organizations-list', async () => {
    if (import.meta.server) return []
    await orgStore.loadOrganizations()
    return orgStore.organizations
}, { server: false })

provide('refreshOrgs', () => orgStore.loadOrganizations())

const filteredOrgs = computed(() => {
    const all = orgStore.organizations
    if (!search.value) return all
    const q = search.value.toLowerCase()
    return all.filter(o => o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q))
})

function formatDate(s: string) {
    return format(new Date(s), 'd MMM yyyy', { locale: locale.value === 'it' ? it : enUS })
}

async function openOrg(id: string) {
    await orgStore.setActiveOrganization(id)
    router.push(`/dashboard/organization/${id}`)
}

const columns: TableColumn<OrganizationListItem>[] = [
    {
        accessorKey: 'name',
        header: () => t('dashboard.organizationsList.columns.name'),
        cell: ({ row }) => h('span', { class: 'font-semibold text-sm text-highlighted' }, row.original.name)
    },
    {
        accessorKey: 'slug',
        header: () => t('dashboard.organizationsList.columns.slug'),
        cell: ({ row }) => h('span', { class: 'text-sm text-muted' }, row.original.slug)
    },
    {
        accessorKey: 'createdAt',
        header: () => t('dashboard.organizationsList.columns.createdAt'),
        cell: ({ row }) => h('span', { class: 'text-sm' }, formatDate(row.original.createdAt))
    },
    {
        id: 'actions',
        header: () => h('span', { class: 'text-right block' }, t('dashboard.organizationsList.columns.actions')),
        cell: ({ row }) => h('div', { class: 'text-right' }, [
            h(UButton, {
                icon: 'i-lucide-arrow-right', color: 'neutral', variant: 'ghost', size: 'sm',
                onClick: () => openOrg(row.original.id)
            })
        ])
    }
]
</script>

<template>
    <UDashboardPanel id="organizations-list">
        <template #header>
            <UDashboardNavbar :title="$t('dashboard.organizationsList.title')" :ui="{ right: 'gap-3' }">
                <template #leading>
                    <UDashboardSidebarCollapse />
                </template>
                <template #right>
                    <UInput v-model="search" icon="i-lucide-search" :placeholder="$t('dashboard.organizationsList.search')" class="max-w-64 hidden lg:block" />
                    <AdminOrgsAddOrgModal />
                </template>
            </UDashboardNavbar>
        </template>

        <template #body>
            <div v-if="orgStore.isLoading" class="flex items-center justify-center py-12">
                <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-primary" />
            </div>
            <div v-else-if="!orgStore.organizations.length" class="text-center py-12">
                <UIcon name="i-lucide-building-2" class="size-12 text-muted mx-auto mb-4" />
                <h3 class="text-lg font-medium mb-2">{{ $t('dashboard.organizationsList.empty.title') }}</h3>
                <p class="text-muted mb-4">{{ $t('dashboard.organizationsList.empty.description') }}</p>
                <AdminOrgsAddOrgModal />
            </div>
            <div v-else class="bg-default rounded-xl border border-default overflow-hidden">
                <UTable :data="filteredOrgs" :columns="columns" />
            </div>
        </template>
    </UDashboardPanel>
</template>
