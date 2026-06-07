<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { useOrganizationStore } from '~/stores/organizationStore'
import { useUserStore } from '~/stores/userStore'

const { t } = useI18n()
const userStore = useUserStore()
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

const orgLimit = ref<{ allowed: boolean; current: number; limit: number } | null>(null)
const isLoadingLimits = ref(false)

async function loadLimits() {
    if (!userStore.user?.id) return
    isLoadingLimits.value = true
    try {
        orgLimit.value = await userStore.checkOrgCreationLimit()
    } catch (error) {
        console.error('Error loading limits:', error)
    } finally {
        isLoadingLimits.value = false
    }
}

const canCreateOrg = computed(() => orgLimit.value?.allowed ?? true)

const isSubmitting = ref(false)
async function onSubmit(event: FormSubmitEvent<Schema>) {
    if (!canCreateOrg.value) {
        toast.add({
            title: t('organization.createModal.limitReached'),
            description: t('organization.createModal.limitReachedDescription'),
            color: 'warning'
        })
        return
    }
    isSubmitting.value = true
    try {
        const result = await orgStore.createOrganization({ name: event.data.name, slug: event.data.slug })
        if (!result.success) throw new Error(result.error || t('organization.createModal.failedToCreate'))
        await refreshOrgs?.()
        if (orgLimit.value) orgLimit.value.current += 1
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

watch(open, async (newOpen: boolean) => {
    if (newOpen) await loadLimits()
})
</script>

<template>
    <UModal v-model:open="open" :title="$t('organization.createModal.title')" :description="$t('organization.createModal.description')">
        <UButton
            :label="$t('organization.createModal.button')"
            icon="i-lucide-plus"
            :disabled="!canCreateOrg || isLoadingLimits"
            :loading="isLoadingLimits"
        />

        <template #body>
            <!-- Limite org raggiunto -->
            <UAlert v-if="!canCreateOrg && orgLimit" color="warning" variant="subtle" class="mb-4">
                <UIcon name="i-lucide-alert-triangle" class="size-5 shrink-0" />
                <p class="text-sm">
                    {{ $t('organization.createModal.limitWarning', { limit: orgLimit.limit }) }}
                    <NuxtLink to="/dashboard/subscription" class="underline">{{ $t('organization.createModal.upgradeLink') }}</NuxtLink>
                </p>
            </UAlert>

            <!-- Utilizzo corrente -->
            <div v-else-if="orgLimit" class="mb-4 p-3 bg-muted rounded-lg">
                <div class="flex justify-between items-center text-sm">
                    <span>{{ $t('organization.createModal.orgsUsed') }}</span>
                    <span class="font-medium">{{ orgLimit.current }} / {{ orgLimit.limit }}</span>
                </div>
                <UProgress
                    :model-value="orgLimit.current"
                    :max="orgLimit.limit"
                    class="mt-2"
                    color="primary"
                />
            </div>

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
                        :disabled="!canCreateOrg"
                        :loading="isSubmitting"
                    />
                </div>
            </UForm>
        </template>
    </UModal>
</template>
