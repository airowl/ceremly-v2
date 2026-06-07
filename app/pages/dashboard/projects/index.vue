<script setup lang="ts">
import type { TableColumn, FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'
import { format } from 'date-fns'
import { it, enUS } from 'date-fns/locale'
import { useProjects, type ProjectItem } from '~/composables/useProjects'

definePageMeta({
    title: 'Projects',
    layout: 'dashboard'
})

const { t, locale } = useI18n()
const toast = useToast()
const { create, update, remove } = useProjects()

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UIcon = resolveComponent('UIcon')

const search = ref('')

// --- Projects data (CSR) ---
const { data: projects, status, error, refresh } = await useAsyncData(
    'projects-list',
    async () => {
        if (import.meta.server) return []
        const res = await $fetch<{ projects: ProjectItem[] }>('/api/projects')
        return res.projects ?? []
    },
    { server: false }
)

const filteredProjects = computed(() => {
    const all = projects.value ?? []
    if (!search.value) return all
    const q = search.value.toLowerCase()
    return all.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description?.toLowerCase().includes(q) ?? false)
    )
})

function formatDate(dateString: string) {
    const dateLocale = locale.value === 'it' ? it : enUS
    return format(new Date(dateString), 'd MMM yyyy', { locale: dateLocale })
}

// --- Create/Edit Modal (un solo modale guidato da editingId) ---
const isModalOpen = ref(false)
const isSubmitting = ref(false)
const editingId = ref<string | null>(null)

const statusOptions = computed(() => [
    { label: t('dashboard.projects.status.active'), value: 'active' },
    { label: t('dashboard.projects.status.archived'), value: 'archived' }
])

const formSchema = computed(() => z.object({
    name: z.string().min(1, t('dashboard.projects.modal.validation.nameRequired')).max(200),
    description: z.string().max(2000).optional().or(z.literal('')),
    status: z.enum(['active', 'archived'])
}))

type FormSchema = z.output<typeof formSchema.value>

const formState = reactive({
    name: '',
    description: '',
    status: 'active' as 'active' | 'archived'
})

function openCreate() {
    editingId.value = null
    formState.name = ''
    formState.description = ''
    formState.status = 'active'
    isModalOpen.value = true
}

function openEdit(project: ProjectItem) {
    editingId.value = project.id
    formState.name = project.name
    formState.description = project.description ?? ''
    formState.status = project.status
    isModalOpen.value = true
}

async function onSubmit(event: FormSubmitEvent<FormSchema>) {
    isSubmitting.value = true
    try {
        if (editingId.value) {
            await update(editingId.value, {
                name: event.data.name,
                description: event.data.description ? event.data.description : null,
                status: event.data.status
            })
            toast.add({ title: t('dashboard.projects.modal.updateSuccess'), color: 'success' })
        } else {
            await create({
                name: event.data.name,
                description: event.data.description ? event.data.description : null,
                status: event.data.status
            })
            toast.add({ title: t('dashboard.projects.modal.createSuccess'), color: 'success' })
        }
        isModalOpen.value = false
        await refresh()
    } catch (err: any) {
        toast.add({
            title: t('dashboard.projects.modal.error'),
            description: err.data?.message || err.message,
            color: 'error'
        })
    } finally {
        isSubmitting.value = false
    }
}

// --- Delete with confirmation ---
const isDeleteOpen = ref(false)
const isDeleting = ref(false)
const deleteTarget = ref<ProjectItem | null>(null)

function openDelete(project: ProjectItem) {
    deleteTarget.value = project
    isDeleteOpen.value = true
}

async function confirmDelete() {
    if (!deleteTarget.value) return
    isDeleting.value = true
    try {
        await remove(deleteTarget.value.id)
        toast.add({ title: t('dashboard.projects.delete.success'), color: 'success' })
        isDeleteOpen.value = false
        deleteTarget.value = null
        await refresh()
    } catch (err: any) {
        toast.add({
            title: t('dashboard.projects.delete.error'),
            description: err.data?.message || err.message,
            color: 'error'
        })
    } finally {
        isDeleting.value = false
    }
}

// --- Table columns ---
const columns: TableColumn<ProjectItem>[] = [
    {
        accessorKey: 'name',
        header: () => t('dashboard.projects.columns.name'),
        cell: ({ row }) => h('span', { class: 'font-semibold text-sm text-highlighted' }, row.original.name)
    },
    {
        accessorKey: 'description',
        header: () => t('dashboard.projects.columns.description'),
        cell: ({ row }) => h('span', { class: 'text-sm text-muted' }, row.original.description ?? '—')
    },
    {
        id: 'status',
        header: () => t('dashboard.projects.columns.status'),
        cell: ({ row }) => {
            const archived = row.original.status === 'archived'
            return h(UBadge, {
                color: archived ? 'neutral' : 'primary',
                variant: 'subtle',
                size: 'sm'
            }, () => archived
                ? t('dashboard.projects.status.archived')
                : t('dashboard.projects.status.active'))
        }
    },
    {
        accessorKey: 'createdAt',
        header: () => t('dashboard.projects.columns.createdAt'),
        cell: ({ row }) => h('span', { class: 'text-sm text-muted' }, formatDate(row.original.createdAt))
    },
    {
        id: 'actions',
        header: () => h('span', { class: 'text-right block' }, t('dashboard.projects.columns.actions')),
        cell: ({ row }) => h('div', { class: 'flex items-center justify-end gap-1' }, [
            h(UButton, {
                icon: 'i-lucide-pencil',
                color: 'neutral',
                variant: 'ghost',
                size: 'sm',
                onClick: () => openEdit(row.original)
            }),
            h(UButton, {
                icon: 'i-lucide-trash-2',
                color: 'error',
                variant: 'ghost',
                size: 'sm',
                onClick: () => openDelete(row.original)
            })
        ])
    }
]
</script>

<template>
    <UDashboardPanel id="projects-list">
        <template #header>
            <UDashboardNavbar :title="$t('dashboard.projects.title')" :ui="{ right: 'gap-3' }">
                <template #leading>
                    <UDashboardSidebarCollapse />
                </template>

                <template #right>
                    <UInput
                        v-model="search"
                        icon="i-lucide-search"
                        :placeholder="$t('dashboard.projects.search')"
                        class="max-w-64 hidden lg:block"
                    />
                    <UButton
                        icon="i-lucide-plus"
                        :label="$t('dashboard.projects.create')"
                        @click="openCreate"
                    />
                </template>
            </UDashboardNavbar>
        </template>

        <template #body>
            <p class="text-muted text-sm mb-6">{{ $t('dashboard.projects.subtitle') }}</p>

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
            <div v-else-if="!projects?.length" class="text-center py-12">
                <UIcon name="i-lucide-folder-open" class="size-12 text-muted mx-auto mb-4" />
                <h3 class="text-lg font-medium mb-2">{{ $t('dashboard.projects.empty.title') }}</h3>
                <p class="text-muted mb-4">{{ $t('dashboard.projects.empty.description') }}</p>
                <UButton icon="i-lucide-plus" @click="openCreate">
                    {{ $t('dashboard.projects.empty.createButton') }}
                </UButton>
            </div>

            <!-- Projects Table -->
            <div v-else class="bg-default rounded-xl border border-default overflow-hidden">
                <UTable
                    :data="filteredProjects"
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

    <!-- Create/Edit Modal -->
    <UModal
        v-model:open="isModalOpen"
        :title="editingId ? $t('dashboard.projects.modal.editTitle') : $t('dashboard.projects.modal.createTitle')"
    >
        <template #body>
            <UForm :schema="formSchema" :state="formState" class="space-y-5" @submit="onSubmit">
                <UFormField :label="$t('dashboard.projects.modal.name')" name="name" required>
                    <UInput
                        v-model="formState.name"
                        :placeholder="$t('dashboard.projects.modal.namePlaceholder')"
                        class="w-full"
                    />
                </UFormField>

                <UFormField :label="$t('dashboard.projects.modal.description')" name="description">
                    <UTextarea
                        v-model="formState.description"
                        :placeholder="$t('dashboard.projects.modal.descriptionPlaceholder')"
                        :rows="3"
                        class="w-full"
                    />
                </UFormField>

                <UFormField :label="$t('dashboard.projects.modal.status')" name="status">
                    <USelect
                        v-model="formState.status"
                        :items="statusOptions"
                        value-key="value"
                        class="w-full"
                    />
                </UFormField>

                <div class="flex items-center justify-end gap-3 pt-2">
                    <UButton
                        :label="$t('dashboard.projects.modal.cancel')"
                        color="neutral"
                        variant="ghost"
                        @click="isModalOpen = false"
                    />
                    <UButton
                        :label="isSubmitting ? $t('dashboard.projects.modal.saving') : $t('dashboard.projects.modal.save')"
                        color="primary"
                        type="submit"
                        :loading="isSubmitting"
                    />
                </div>
            </UForm>
        </template>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="isDeleteOpen" :title="$t('dashboard.projects.delete.title')">
        <template #body>
            <p class="text-sm text-muted">
                {{ $t('dashboard.projects.delete.confirm', { name: deleteTarget?.name ?? '' }) }}
            </p>
        </template>
        <template #footer>
            <div class="flex items-center justify-end gap-3 w-full">
                <UButton
                    :label="$t('dashboard.projects.delete.cancel')"
                    color="neutral"
                    variant="ghost"
                    @click="isDeleteOpen = false"
                />
                <UButton
                    :label="$t('dashboard.projects.delete.confirmButton')"
                    color="error"
                    :loading="isDeleting"
                    @click="confirmDelete"
                />
            </div>
        </template>
    </UModal>
</template>
