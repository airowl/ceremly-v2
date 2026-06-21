<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { useOrganizationStore } from '~/stores/organizationStore'

const { t } = useI18n()
const orgStore = useOrganizationStore()
const toast = useToast()

const refreshOrgs = inject<() => Promise<void>>('refreshOrgs')

const schema = computed(() => z.object({
    name: z.string().min(2, t('organization.createModal.validation.tooShort')),
    slug: z.string().min(2, t('organization.createModal.validation.tooShort'))
        .regex(/^[a-z0-9-]+$/, t('organization.createModal.validation.slugFormat'))
}))
const open = ref(false)

type Schema = z.output<typeof schema.value>

const state = reactive({
    name: undefined as string | undefined,
    slug: undefined as string | undefined
})

const isSubmitting = ref(false)
async function onSubmit(event: FormSubmitEvent<Schema>) {
    isSubmitting.value = true
    try {
        const result = await orgStore.createOrganization({ name: event.data.name, slug: event.data.slug })
        if (!result.success) throw new Error(result.error || t('organization.createModal.failedToCreate'))
        await refreshOrgs?.()
        toast.add({
            title: t('organization.createModal.success'),
            description: t('organization.createModal.successDescription', { name: event.data.name }),
            color: 'success'
        })
        open.value = false
        state.name = undefined
        state.slug = undefined
    } catch (err: any) {
        toast.add({ title: t('organization.createModal.error'), description: err.message, color: 'error' })
    } finally {
        isSubmitting.value = false
    }
}
</script>

<template>
    <UModal v-model:open="open" :title="$t('organization.createModal.title')" :description="$t('organization.createModal.description')">
        <UButton
            :label="$t('organization.createModal.button')"
            icon="i-lucide-plus"
        />

        <template #body>
            <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
                <UFormField :label="$t('organization.createModal.name')" :placeholder="$t('organization.createModal.namePlaceholder')" name="name">
                    <UInput v-model="state.name" class="w-full" />
                </UFormField>
                <UFormField :label="$t('organization.createModal.slug')" :placeholder="$t('organization.createModal.slugPlaceholder')" name="slug">
                    <UInput v-model="state.slug" class="w-full" />
                </UFormField>
                <div class="flex justify-end gap-2">
                    <UButton :label="$t('organization.createModal.cancel')" color="neutral" variant="subtle" @click="open = false" />
                    <UButton
                        :label="$t('organization.createModal.create')"
                        color="primary"
                        variant="solid"
                        type="submit"
                        :loading="isSubmitting"
                    />
                </div>
            </UForm>
        </template>
    </UModal>
</template>
