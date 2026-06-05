<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'

definePageMeta({
    title: 'Modifica Reminder',
})

const route = useRoute()
const router = useRouter()
const toast = useToast()
const eventId = computed(() => route.params.id as string)
const templateId = computed(() => route.params.templateId as string)
const { templates, loadTemplates, updateTemplate } = useReminders(eventId)

const isSubmitting = ref(false)
const isPageLoading = ref(true)
const formRef = ref<{ handleSubmit: () => void } | null>(null)
const initialData = ref<{ name: string; type: 'email' | 'whatsapp'; subject: string; body: string } | undefined>()
const templateName = ref('')

const breadcrumbItems = computed<BreadcrumbItem[]>(() => [
    {
        label: 'Dashboard',
        icon: 'i-lucide-layout-dashboard',
        to: `/dashboard/event/${eventId.value}`,
    },
    {
        label: 'Reminder',
        icon: 'i-lucide-bell',
        to: `/dashboard/event/${eventId.value}/reminders`,
    },
    {
        label: templateName.value || 'Modifica',
        icon: 'i-lucide-pencil',
    },
])

// ── Load template data ──
onMounted(async () => {
    await loadTemplates()

    const existing = templates.value.find(t => t.id === templateId.value)
    if (!existing) {
        toast.add({
            title: 'Errore',
            description: 'Template non trovato.',
            color: 'error',
        })
        router.push(`/dashboard/event/${eventId.value}/reminders`)
        return
    }

    initialData.value = {
        name: existing.name,
        type: existing.type,
        subject: existing.subject ?? '',
        body: existing.body,
    }
    templateName.value = existing.name
    isPageLoading.value = false
})

// ── Submit ──
async function handleSubmit(data: { name: string; type: 'email' | 'whatsapp'; subject: string | null; body: string }) {
    if (!data.name || !data.body) {
        toast.add({
            title: 'Errore',
            description: 'Nome e corpo del messaggio sono obbligatori.',
            color: 'error',
        })
        return
    }

    isSubmitting.value = true
    try {
        const result = await updateTemplate(templateId.value, {
            name: data.name,
            type: data.type,
            subject: data.subject,
            body: data.body,
        })

        if (result?.success) {
            toast.add({ title: 'Reminder aggiornato', color: 'success' })
            router.push(`/dashboard/event/${eventId.value}/reminders`)
        } else {
            toast.add({
                title: 'Errore',
                description: result?.error || 'Impossibile aggiornare il reminder.',
                color: 'error',
            })
        }
    } catch {
        toast.add({
            title: 'Errore',
            description: 'Impossibile aggiornare il reminder.',
            color: 'error',
        })
    } finally {
        isSubmitting.value = false
    }
}
</script>

<template>
    <UDashboardPanel id="reminder-edit">
        <template #header>
            <EventPageHeader :breadcrumbs="breadcrumbItems">
                <template #actions>
                    <UButton
                        label="Annulla"
                        color="neutral"
                        variant="ghost"
                        :to="`/dashboard/event/${eventId}/reminders`"
                    />
                    <UButton
                        label="Salva Modifiche"
                        icon="i-lucide-save"
                        :loading="isSubmitting"
                        :disabled="isPageLoading"
                        @click="formRef?.handleSubmit()"
                    />
                </template>
            </EventPageHeader>
        </template>

        <template #body>
            <!-- Loading -->
            <div v-if="isPageLoading" class="flex items-center justify-center py-12">
                <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary" />
            </div>

            <div v-else class="p-4 sm:p-6 lg:p-8">
                <ReminderForm
                    ref="formRef"
                    mode="edit"
                    :initial-data="initialData"
                    :is-submitting="isSubmitting"
                    @submit="handleSubmit"
                />
            </div>
        </template>
    </UDashboardPanel>
</template>
