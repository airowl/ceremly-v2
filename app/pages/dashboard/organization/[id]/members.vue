<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { computed, ref, reactive, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'nuxt/app'
import { useToast } from '@nuxt/ui/composables'
import { useUserStore } from '~/stores/userStore'
import { useOrganizationStore, type OrganizationMember, type OrganizationInvitation, type OrgRole } from '~/stores/organizationStore'
import { useOrganization } from '~/composables/useOrganization'

const { t } = useI18n()
const toast = useToast()
const route = useRoute()
const userStore = useUserStore()
const orgStore = useOrganizationStore()
const { canManageMembers } = useOrganization()

// @ts-ignore
definePageMeta({ title: 'Members', layout: 'dashboard' })

const orgId = computed(() => route.params.id as string)
const currentUserId = computed(() => userStore.user?.id)

const loadError = ref<string | null>(null)

const showInviteModal = ref(false)
const showRoleModal = ref(false)
const selectedMember = ref<OrganizationMember | null>(null)
const selectedRole = ref<OrgRole>('member')
const memberToRemove = ref<OrganizationMember | null>(null)
const isInviting = ref(false)
const isUpdatingRole = ref(false)
const isDeletingMember = ref<string | null>(null)
const isCancellingInvite = ref<string | null>(null)

const roleOptions = computed(() => [
    { value: 'admin', label: t('members.roles.admin'), description: t('members.roleDescriptions.admin') },
    { value: 'member', label: t('members.roles.member'), description: t('members.roleDescriptions.member') },
])

const inviteSchema = z.object({ email: z.string().email(t('members.validation.invalidEmail')) })
type InviteSchema = z.output<typeof inviteSchema>
const inviteFormData = reactive<Partial<InviteSchema>>({ email: undefined })

onMounted(async () => {
    if (orgStore.currentOrganization?.id !== orgId.value) {
        loadError.value = null
        const result = await orgStore.setActiveOrganization(orgId.value)
        if (!result.success) loadError.value = result.error ?? 'Error loading organization'
    }
})

function getRoleLabel(m: OrganizationMember): string {
    return t(`members.roles.${m.role}`)
}

function getRoleBadgeColor(m: OrganizationMember): 'success' | 'info' | 'neutral' {
    if (m.role === 'owner') return 'success'
    if (m.role === 'admin') return 'info'
    return 'neutral'
}

function canEditMember(m: OrganizationMember): boolean {
    if (m.role === 'owner') return false
    if (m.userId === currentUserId.value) return false
    return canManageMembers.value
}

async function onInviteSubmit(event: FormSubmitEvent<InviteSchema>) {
    isInviting.value = true
    try {
        const result = await orgStore.inviteMember(event.data.email, 'member')
        if (result.success) {
            toast.add({ title: t('members.inviteSent'), description: t('members.inviteSentDescription', { email: event.data.email }), color: 'success' })
            showInviteModal.value = false
            inviteFormData.email = undefined
        } else {
            toast.add({ title: t('common.error'), description: result.error || t('members.inviteError'), color: 'error' })
        }
    } finally {
        isInviting.value = false
    }
}

function openRoleModal(m: OrganizationMember) {
    selectedMember.value = m
    selectedRole.value = m.role === 'admin' ? 'admin' : 'member'
    showRoleModal.value = true
}

async function saveRole() {
    if (!selectedMember.value) return
    isUpdatingRole.value = true
    try {
        const result = await orgStore.updateMemberRole(selectedMember.value.id, selectedRole.value)
        if (result.success) {
            toast.add({ title: t('members.roleUpdated'), color: 'success' })
            showRoleModal.value = false
        } else {
            toast.add({ title: t('common.error'), description: result.error || t('members.roleUpdateError'), color: 'error' })
        }
    } finally {
        isUpdatingRole.value = false
    }
}

async function removeMember(m: OrganizationMember) {
    isDeletingMember.value = m.id
    try {
        const result = await orgStore.removeMember(m.id)
        if (result.success) toast.add({ title: t('members.memberRemoved'), color: 'success' })
        else toast.add({ title: t('common.error'), description: result.error || t('members.memberRemoveError'), color: 'error' })
    } finally {
        isDeletingMember.value = null
        memberToRemove.value = null
    }
}

async function cancelInvitation(inv: OrganizationInvitation) {
    isCancellingInvite.value = inv.id
    try {
        const result = await orgStore.cancelInvitation(inv.id)
        if (result.success) toast.add({ title: t('members.inviteCancelled'), color: 'success' })
        else toast.add({ title: t('common.error'), description: result.error || t('members.inviteCancelError'), color: 'error' })
    } finally {
        isCancellingInvite.value = null
    }
}
</script>

<template>
    <UDashboardPanel id="members-management">
        <template #header>
            <EventPageHeader :title="t('members.title')" :back-to="`/dashboard/organization/${orgId}`">
                <template #actions>
                    <UButton
                        v-if="canManageMembers"
                        :label="t('members.inviteMember')"
                        icon="i-lucide-user-plus"
                        @click="showInviteModal = true"
                    />
                </template>
            </EventPageHeader>
        </template>

        <template #body>
            <div class="p-4 sm:p-6 space-y-6">
                <AppTableSkeleton
                    v-if="orgStore.isLoading && !orgStore.currentOrganization"
                    :rows="4"
                    :columns="3"
                    avatar
                />

                <div v-else-if="loadError || orgStore.error" class="text-center py-8">
                    <UIcon name="i-lucide-alert-circle" class="w-12 h-12 text-error mx-auto mb-4" />
                    <p class="text-muted">{{ loadError || orgStore.error }}</p>
                </div>

                <template v-else>
                    <UPageCard :title="t('members.activeMembers')" variant="subtle">
                        <div v-if="orgStore.members.length === 0" class="text-center py-8">
                            <UIcon name="i-lucide-users" class="w-12 h-12 text-muted mx-auto mb-4" />
                            <p class="text-muted">{{ t('members.noMembers') }}</p>
                        </div>
                        <div v-else class="overflow-x-auto">
                            <table class="w-full">
                                <thead>
                                    <tr class="text-left text-sm text-muted border-b border-default">
                                        <th class="pb-3 font-medium">{{ t('members.member') }}</th>
                                        <th class="pb-3 font-medium">{{ t('members.roleLabel') }}</th>
                                        <th class="pb-3 font-medium text-right">{{ t('members.actions') }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="m in orgStore.members" :key="m.id" class="border-b border-default last:border-b-0">
                                        <td class="py-4">
                                            <div class="flex items-center gap-3">
                                                <UAvatar :src="m.user.image || undefined" :alt="m.user.name" size="md" />
                                                <div>
                                                    <p class="font-medium text-highlighted">{{ m.user.name }}</p>
                                                    <p class="text-sm text-muted">{{ m.user.email }}</p>
                                                </div>
                                                <UBadge v-if="m.userId === currentUserId" :label="t('members.you')" variant="subtle" size="xs" />
                                            </div>
                                        </td>
                                        <td class="py-4">
                                            <UBadge :label="getRoleLabel(m)" :color="getRoleBadgeColor(m)" variant="subtle" />
                                        </td>
                                        <td class="py-4 text-right">
                                            <div class="flex items-center justify-end gap-2">
                                                <UTooltip v-if="canEditMember(m)" :text="t('members.changeRole')">
                                                    <UButton icon="i-lucide-shield" color="neutral" variant="ghost" size="sm" @click="openRoleModal(m)" />
                                                </UTooltip>
                                                <UTooltip v-if="canEditMember(m)" :text="t('members.removeMember')">
                                                    <UButton icon="i-lucide-user-minus" color="error" variant="ghost" size="sm" :loading="isDeletingMember === m.id" @click="memberToRemove = m" />
                                                </UTooltip>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </UPageCard>

                    <UPageCard v-if="orgStore.pendingInvitations.length > 0" :title="t('members.pendingInvitations')" variant="subtle">
                        <div class="overflow-x-auto">
                            <table class="w-full">
                                <thead>
                                    <tr class="text-left text-sm text-muted border-b border-default">
                                        <th class="pb-3 font-medium">{{ t('members.email') }}</th>
                                        <th class="pb-3 font-medium text-right">{{ t('members.actions') }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="inv in orgStore.pendingInvitations" :key="inv.id" class="border-b border-default last:border-b-0">
                                        <td class="py-4">
                                            <div class="flex items-center gap-2">
                                                <UIcon name="i-lucide-mail" class="w-4 h-4 text-muted" />
                                                <span class="font-medium">{{ inv.email }}</span>
                                            </div>
                                        </td>
                                        <td class="py-4 text-right">
                                            <UTooltip v-if="canManageMembers" :text="t('members.cancelInvite')">
                                                <UButton icon="i-lucide-x" color="error" variant="ghost" size="sm" :loading="isCancellingInvite === inv.id" @click="cancelInvitation(inv)" />
                                            </UTooltip>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </UPageCard>
                </template>
            </div>

            <UModal v-model:open="showInviteModal" :ui="{ content: 'max-w-md' }">
                <template #content>
                    <UCard>
                        <template #header>
                            <h3 class="text-lg font-semibold">{{ t('members.inviteMemberTitle') }}</h3>
                        </template>
                        <UForm :schema="inviteSchema" :state="inviteFormData" class="space-y-5" @submit="onInviteSubmit">
                            <UFormField name="email" :label="t('members.emailLabel')">
                                <UInput v-model="inviteFormData.email" type="email" :placeholder="t('members.emailPlaceholder')" icon="i-lucide-mail" size="lg" />
                            </UFormField>
                            <div class="flex justify-end gap-3 pt-2">
                                <UButton :label="t('common.cancel')" color="neutral" variant="outline" @click="showInviteModal = false" />
                                <UButton :label="t('members.sendInvite')" icon="i-lucide-send" type="submit" :loading="isInviting" />
                            </div>
                        </UForm>
                    </UCard>
                </template>
            </UModal>

            <UModal v-model:open="showRoleModal" :ui="{ content: 'max-w-md' }">
                <template #content>
                    <UCard>
                        <template #header>
                            <h3 class="text-lg font-semibold">{{ t('members.changeRoleTitle') }}</h3>
                        </template>
                        <div class="space-y-3">
                            <label
                                v-for="option in roleOptions"
                                :key="option.value"
                                class="flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all"
                                :class="selectedRole === option.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-default hover:border-primary/50'"
                                @click="selectedRole = option.value as OrgRole"
                            >
                                <div>
                                    <p class="font-medium">{{ option.label }}</p>
                                    <p class="text-sm text-muted mt-0.5">{{ option.description }}</p>
                                </div>
                            </label>
                        </div>
                        <template #footer>
                            <div class="flex justify-end gap-3 pt-2">
                                <UButton :label="t('common.cancel')" variant="outline" @click="showRoleModal = false" />
                                <UButton :label="t('members.saveRole')" :loading="isUpdatingRole" icon="i-lucide-check" @click="saveRole" />
                            </div>
                        </template>
                    </UCard>
                </template>
            </UModal>

            <UModal :open="!!memberToRemove" :ui="{ content: 'max-w-md' }" @update:open="(v: boolean) => { if (!v) memberToRemove = null }">
                <template #content>
                    <UCard>
                        <template #header>
                            <h3 class="text-lg font-semibold">{{ t('members.removeMemberTitle') }}</h3>
                        </template>
                        <p class="text-muted">{{ t('members.removeMemberConfirm', { name: memberToRemove?.user.name }) }}</p>
                        <template #footer>
                            <div class="flex justify-end gap-3 pt-2">
                                <UButton :label="t('common.cancel')" color="neutral" variant="outline" @click="memberToRemove = null" />
                                <UButton :label="t('members.removeMember')" color="error" :loading="isDeletingMember === memberToRemove?.id" @click="memberToRemove && removeMember(memberToRemove)" />
                            </div>
                        </template>
                    </UCard>
                </template>
            </UModal>
        </template>
    </UDashboardPanel>
</template>
