<script setup lang="ts">
import { ref } from 'vue'
import { useOrganizationStore } from '~/stores/organizationStore'

const props = defineProps<{ organizationId: string; organizationName: string }>()
const emit = defineEmits<{ deleted: [] }>()

const { t } = useI18n()
const orgStore = useOrganizationStore()
const toast = useToast()
const open = ref(false)
const isDeleting = ref(false)

async function onSubmit() {
    isDeleting.value = true
    try {
        const result = await orgStore.deleteOrganization(props.organizationId)
        if (!result.success) throw new Error(result.error || t('organization.deleteModal.error'))
        toast.add({ title: t('organization.deleteModal.success'), color: 'success' })
        open.value = false
        emit('deleted')
    } catch (err: any) {
        toast.add({ title: t('organization.deleteModal.error'), description: err.message, color: 'error' })
    } finally {
        isDeleting.value = false
    }
}
</script>

<template>
    <UModal
        v-model:open="open"
        :title="t('organization.deleteModal.title', { name: organizationName })"
        :description="t('organization.deleteModal.description')"
    >
        <slot />
        <template #body>
            <div class="flex justify-end gap-2">
                <UButton :label="t('common.cancel')" color="neutral" variant="subtle" @click="open = false" />
                <UButton :label="t('organization.deleteModal.confirm')" color="error" variant="solid" :loading="isDeleting" @click="onSubmit" />
            </div>
        </template>
    </UModal>
</template>
