<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'

definePageMeta({
    title: 'Nuovo Reminder',
})

const route = useRoute()
const router = useRouter()
const toast = useToast()
const eventId = computed(() => route.params.id as string)
const { createTemplate } = useReminders(eventId)

const isSubmitting = ref(false)
const formRef = ref<{ handleSubmit: () => void } | null>(null)

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
        label: 'Nuovo Reminder',
        icon: 'i-lucide-plus',
    },
])

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
        const result = await createTemplate({
            name: data.name,
            type: data.type,
            subject: data.subject,
            body: data.body,
        })

        if (result?.success) {
            toast.add({ title: 'Reminder creato', color: 'success' })
            router.push(`/dashboard/event/${eventId.value}/reminders`)
        } else {
            toast.add({
                title: 'Errore',
                description: result?.error || 'Impossibile creare il reminder.',
                color: 'error',
            })
        }
    } catch {
        toast.add({
            title: 'Errore',
            description: 'Impossibile creare il reminder.',
            color: 'error',
        })
    } finally {
        isSubmitting.value = false
    }
}
</script>

<template>
    <UDashboardPanel id="reminder-new">
        <template #header>
            <EventPageHeader :breadcrumbs="breadcrumbItems" :back-to="`/dashboard/event/${eventId}/reminders`">
                <template #actions>
                    <UButton
                        label="Annulla"
                        color="neutral"
                        variant="ghost"
                        :to="`/dashboard/event/${eventId}/reminders`"
                    />
                    <UButton
                        label="Salva Reminder"
                        icon="i-lucide-save"
                        :loading="isSubmitting"
                        @click="formRef?.handleSubmit()"
                    />
                </template>
            </EventPageHeader>
        </template>

        <template #body>
            <div class="p-4 sm:p-6 lg:p-8">
                <ReminderForm
                    ref="formRef"
                    mode="create"
                    :is-submitting="isSubmitting"
                    @submit="handleSubmit"
                />
            </div>
        </template>
    </UDashboardPanel>
</template>
