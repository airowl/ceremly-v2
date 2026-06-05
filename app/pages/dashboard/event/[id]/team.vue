<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { useUserStore } from '~/stores/userStore'
import { useEventStore, type EventMember, type PendingInvitation, type EventRole } from '~/stores/eventStore'

const { t } = useI18n()
const toast = useToast()
const route = useRoute()
const userStore = useUserStore()
const eventStore = useEventStore()

definePageMeta({
    title: 'Team Management',
    layout: 'dashboard',
})

// State
const showInviteModal = ref(false)
const showRoleModal = ref(false)
const selectedMember = ref<EventMember | null>(null)
const selectedRole = ref<'editor' | 'viewer'>('viewer')
const isInviting = ref(false)
const isUpdatingRole = ref(false)
const isDeletingMember = ref<string | null>(null)
const isResendingInvite = ref<string | null>(null)
const isCancellingInvite = ref<string | null>(null)

// Get event ID from route
const eventId = computed(() => route.params.id as string)

// Current user ID to check ownership
const currentUserId = computed(() => userStore.user?.id)

// Check if current user is owner or editor (can manage team)
const canManageTeam = computed(() => {
    const currentMember = eventStore.teamMembers.find(m => m.id === currentUserId.value)
    if (!currentMember) return false
    return currentMember.is_owner || currentMember.role === 'editor'
})

// Role options for the dropdown
const roleOptions = computed(() => [
    { value: 'editor', label: t('team.roles.editor'), description: t('team.roleDescriptions.editor') },
    { value: 'viewer', label: t('team.roles.viewer'), description: t('team.roleDescriptions.viewer') },
])

// Invite form schema
const inviteSchema = z.object({
    email: z.string().email(t('team.validation.invalidEmail')),
})

type InviteSchema = z.output<typeof inviteSchema>

const inviteFormData = reactive<Partial<InviteSchema>>({
    email: undefined,
})

// Load data on mount
onMounted(async () => {
    if (!eventStore.currentEvent && eventId.value) {
        await eventStore.loadEvent(eventId.value)
    }
    await eventStore.loadTeamMembers()
})

// Format date helper
function formatDate(dateString: string | null): string {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString()
}

// Format relative time helper
function formatRelativeTime(dateString: string | null): string {
    if (!dateString) return t('team.neverLoggedIn')
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return t('team.today')
    if (diffDays === 1) return t('team.yesterday')
    if (diffDays < 7) return t('team.daysAgo', { days: diffDays })
    if (diffDays < 30) return t('team.weeksAgo', { weeks: Math.floor(diffDays / 7) })
    return formatDate(dateString)
}

// Get role label for display
function getRoleLabel(member: EventMember): string {
    if (member.is_owner) return t('team.roles.owner')
    return t(`team.roles.${member.role}`)
}

// Get role badge color
function getRoleBadgeColor(member: EventMember): string {
    if (member.is_owner) return 'success'
    if (member.role === 'editor') return 'info'
    return 'neutral'
}

// Check if member can be removed
function canRemoveMember(member: EventMember): boolean {
    if (member.is_owner) return false
    if (member.id === currentUserId.value) return false
    return canManageTeam.value
}

// Check if member role can be edited
function canEditRole(member: EventMember): boolean {
    if (member.is_owner) return false
    if (member.id === currentUserId.value) return false
    return canManageTeam.value
}

// Open invite modal
function openInviteModal() {
    inviteFormData.email = undefined
    showInviteModal.value = true
}

// Close invite modal
function closeInviteModal() {
    showInviteModal.value = false
}

// Submit invite
async function onInviteSubmit(event: FormSubmitEvent<InviteSchema>) {
    isInviting.value = true

    try {
        const result = await eventStore.inviteTeamMember(
            event.data.email,
            'it' // TODO: get from user preferences
        )

        if (result.success) {
            toast.add({
                title: t('team.inviteSent'),
                description: t('team.inviteSentDescription', { email: event.data.email }),
                icon: 'i-lucide-check',
                color: 'success'
            })
            closeInviteModal()
        } else {
            const errorMessage = result.error?.includes('limit')
                ? t('team.memberLimitReached')
                : result.error || t('team.inviteError')

            toast.add({
                title: t('common.error'),
                description: errorMessage,
                icon: 'i-lucide-alert-circle',
                color: 'error'
            })
        }
    } catch (err: any) {
        toast.add({
            title: t('common.error'),
            description: t('team.inviteError'),
            icon: 'i-lucide-alert-circle',
            color: 'error'
        })
    } finally {
        isInviting.value = false
    }
}

// Open role modal
function openRoleModal(member: EventMember) {
    selectedMember.value = member
    selectedRole.value = member.role === 'editor' ? 'editor' : 'viewer'
    showRoleModal.value = true
}

// Close role modal
function closeRoleModal() {
    showRoleModal.value = false
    selectedMember.value = null
}

// Save role
async function saveRole() {
    if (!selectedMember.value) return

    isUpdatingRole.value = true

    try {
        const result = await eventStore.updateMemberRole(
            selectedMember.value.id,
            selectedRole.value
        )

        if (result.success) {
            toast.add({
                title: t('team.roleUpdated'),
                description: t('team.roleUpdatedDescription', { name: selectedMember.value.name }),
                icon: 'i-lucide-check',
                color: 'success'
            })
            closeRoleModal()
        } else {
            toast.add({
                title: t('common.error'),
                description: result.error || t('team.roleUpdateError'),
                icon: 'i-lucide-alert-circle',
                color: 'error'
            })
        }
    } catch (err: any) {
        toast.add({
            title: t('common.error'),
            description: t('team.roleUpdateError'),
            icon: 'i-lucide-alert-circle',
            color: 'error'
        })
    } finally {
        isUpdatingRole.value = false
    }
}

// Remove member
async function removeMember(member: EventMember) {
    isDeletingMember.value = member.id

    try {
        const result = await eventStore.removeTeamMember(member.id)

        if (result.success) {
            toast.add({
                title: t('team.memberRemoved'),
                description: t('team.memberRemovedDescription', { name: member.name }),
                icon: 'i-lucide-check',
                color: 'success'
            })
        } else {
            toast.add({
                title: t('common.error'),
                description: result.error || t('team.memberRemoveError'),
                icon: 'i-lucide-alert-circle',
                color: 'error'
            })
        }
    } catch (err: any) {
        toast.add({
            title: t('common.error'),
            description: t('team.memberRemoveError'),
            icon: 'i-lucide-alert-circle',
            color: 'error'
        })
    } finally {
        isDeletingMember.value = null
    }
}

// Resend invitation
async function resendInvitation(invitation: PendingInvitation) {
    isResendingInvite.value = invitation.id

    try {
        const result = await eventStore.resendInvitation(invitation.id, 'it')

        if (result.success) {
            toast.add({
                title: t('team.inviteResent'),
                description: t('team.inviteResentDescription', { email: invitation.email }),
                icon: 'i-lucide-check',
                color: 'success'
            })
        } else {
            toast.add({
                title: t('common.error'),
                description: result.error || t('team.inviteResendError'),
                icon: 'i-lucide-alert-circle',
                color: 'error'
            })
        }
    } catch (err: any) {
        toast.add({
            title: t('common.error'),
            description: t('team.inviteResendError'),
            icon: 'i-lucide-alert-circle',
            color: 'error'
        })
    } finally {
        isResendingInvite.value = null
    }
}

// Cancel invitation
async function cancelInvitation(invitation: PendingInvitation) {
    isCancellingInvite.value = invitation.id

    try {
        const result = await eventStore.cancelInvitation(invitation.id)

        if (result.success) {
            toast.add({
                title: t('team.inviteCancelled'),
                description: t('team.inviteCancelledDescription', { email: invitation.email }),
                icon: 'i-lucide-check',
                color: 'success'
            })
        } else {
            toast.add({
                title: t('common.error'),
                description: result.error || t('team.inviteCancelError'),
                icon: 'i-lucide-alert-circle',
                color: 'error'
            })
        }
    } catch (err: any) {
        toast.add({
            title: t('common.error'),
            description: t('team.inviteCancelError'),
            icon: 'i-lucide-alert-circle',
            color: 'error'
        })
    } finally {
        isCancellingInvite.value = null
    }
}

// Check if invitation is expired
function isInvitationExpired(expiresAt: string): boolean {
    return new Date(expiresAt) < new Date()
}
</script>

<template>
    <UDashboardPanel id="team-management">
        <template #header>
            <EventPageHeader :title="t('team.title')">
                <template #actions>
                    <UButton
                        v-if="canManageTeam"
                        :label="t('team.inviteMember')"
                        icon="i-lucide-user-plus"
                        :disabled="!eventStore.teamLimit?.allowed"
                        @click="openInviteModal"
                    />
                </template>
            </EventPageHeader>
        </template>

        <template #body>
            <div class="p-4 sm:p-6 space-y-6">
                <!-- Loading State -->
                <div v-if="eventStore.isLoadingTeam" class="flex items-center justify-center py-12">
                    <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary" />
                </div>

                <template v-else>
                    <!-- Team Limit Indicator -->
                    <div v-if="eventStore.teamLimit" class="flex items-center justify-between bg-default rounded-lg p-4 border border-default">
                        <div class="flex items-center gap-3">
                            <UIcon name="i-lucide-users" class="w-5 h-5 text-primary" />
                            <div>
                                <p class="font-medium">{{ t('team.membersCount') }}</p>
                                <p class="text-sm text-muted">
                                    {{ eventStore.teamLimit.current }} / {{ eventStore.teamLimit.limit }} {{ t('team.members') }}
                                </p>
                            </div>
                        </div>
                        <UProgress
                            :model-value="eventStore.teamLimit.current"
                            :max="eventStore.teamLimit.limit"
                            :color="eventStore.teamLimit.allowed ? 'primary' : 'error'"
                            class="w-32"
                        />
                    </div>

                    <!-- Team Members Section -->
                    <UPageCard
                        :title="t('team.activeMembers')"
                        :description="t('team.activeMembersDescription')"
                        variant="subtle"
                    >
                        <div v-if="eventStore.teamMembers.length === 0" class="text-center py-8">
                            <UIcon name="i-lucide-users" class="w-12 h-12 text-muted mx-auto mb-4" />
                            <p class="text-muted">{{ t('team.noMembers') }}</p>
                        </div>

                        <div v-else class="overflow-x-auto">
                            <table class="w-full">
                                <thead>
                                    <tr class="text-left text-sm text-muted border-b border-default">
                                        <th class="pb-3 font-medium">{{ t('team.member') }}</th>
                                        <th class="pb-3 font-medium">{{ t('team.roleLabel') }}</th>
                                        <th class="pb-3 font-medium hidden md:table-cell">{{ t('team.joinedAt') }}</th>
                                        <th class="pb-3 font-medium hidden lg:table-cell">{{ t('team.lastAccess') }}</th>
                                        <th class="pb-3 font-medium text-right">{{ t('team.actions') }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr
                                        v-for="member in eventStore.teamMembers"
                                        :key="member.id"
                                        class="border-b border-default last:border-b-0"
                                    >
                                        <!-- Member Info -->
                                        <td class="py-4">
                                            <div class="flex items-center gap-3">
                                                <UAvatar
                                                    :src="member.avatar_url || undefined"
                                                    :alt="member.name"
                                                    size="md"
                                                />
                                                <div>
                                                    <p class="font-medium text-highlighted">{{ member.name }}</p>
                                                    <p class="text-sm text-muted">{{ member.email }}</p>
                                                </div>
                                                <UBadge
                                                    v-if="member.id === currentUserId"
                                                    :label="t('team.you')"
                                                    variant="subtle"
                                                    size="xs"
                                                />
                                            </div>
                                        </td>

                                        <!-- Role -->
                                        <td class="py-4">
                                            <UBadge
                                                :label="getRoleLabel(member)"
                                                :color="getRoleBadgeColor(member)"
                                                variant="subtle"
                                            />
                                        </td>

                                        <!-- Joined At -->
                                        <td class="py-4 hidden md:table-cell text-sm text-muted">
                                            {{ formatDate(member.joined_at) }}
                                        </td>

                                        <!-- Last Access -->
                                        <td class="py-4 hidden lg:table-cell text-sm text-muted">
                                            {{ formatRelativeTime(member.last_login_at) }}
                                        </td>

                                        <!-- Actions -->
                                        <td class="py-4 text-right">
                                            <div class="flex items-center justify-end gap-2">
                                                <UTooltip v-if="canEditRole(member)" :text="t('team.changeRole')">
                                                    <UButton
                                                        icon="i-lucide-shield"
                                                        color="neutral"
                                                        variant="ghost"
                                                        size="sm"
                                                        @click="openRoleModal(member)"
                                                    />
                                                </UTooltip>
                                                <UTooltip v-if="canRemoveMember(member)" :text="t('team.removeMember')">
                                                    <UButton
                                                        icon="i-lucide-user-minus"
                                                        color="error"
                                                        variant="ghost"
                                                        size="sm"
                                                        :loading="isDeletingMember === member.id"
                                                        @click="removeMember(member)"
                                                    />
                                                </UTooltip>
                                                <span
                                                    v-if="member.is_owner"
                                                    class="text-xs text-muted italic"
                                                >
                                                    {{ t('team.ownerProtected') }}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </UPageCard>

                    <!-- Pending Invitations Section -->
                    <UPageCard
                        v-if="eventStore.pendingInvitations.length > 0"
                        :title="t('team.pendingInvitations')"
                        :description="t('team.pendingInvitationsDescription')"
                        variant="subtle"
                    >
                        <div class="overflow-x-auto">
                            <table class="w-full">
                                <thead>
                                    <tr class="text-left text-sm text-muted border-b border-default">
                                        <th class="pb-3 font-medium">{{ t('team.email') }}</th>
                                        <th class="pb-3 font-medium hidden md:table-cell">{{ t('team.invitedAt') }}</th>
                                        <th class="pb-3 font-medium hidden lg:table-cell">{{ t('team.expiresAt') }}</th>
                                        <th class="pb-3 font-medium text-right">{{ t('team.actions') }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr
                                        v-for="invitation in eventStore.pendingInvitations"
                                        :key="invitation.id"
                                        class="border-b border-default last:border-b-0"
                                        :class="{ 'opacity-60': isInvitationExpired(invitation.expires_at) }"
                                    >
                                        <!-- Email -->
                                        <td class="py-4">
                                            <div class="flex items-center gap-2">
                                                <UIcon name="i-lucide-mail" class="w-4 h-4 text-muted" />
                                                <span class="font-medium">{{ invitation.email }}</span>
                                                <UBadge
                                                    v-if="isInvitationExpired(invitation.expires_at)"
                                                    :label="t('team.expired')"
                                                    color="error"
                                                    variant="subtle"
                                                    size="xs"
                                                />
                                            </div>
                                        </td>

                                        <!-- Invited At -->
                                        <td class="py-4 hidden md:table-cell text-sm text-muted">
                                            {{ formatDate(invitation.created_at) }}
                                        </td>

                                        <!-- Expires At -->
                                        <td class="py-4 hidden lg:table-cell text-sm text-muted">
                                            {{ formatDate(invitation.expires_at) }}
                                        </td>

                                        <!-- Actions -->
                                        <td class="py-4 text-right">
                                            <div class="flex items-center justify-end gap-2">
                                                <UTooltip :text="t('team.resendInvite')">
                                                    <UButton
                                                        icon="i-lucide-send"
                                                        color="neutral"
                                                        variant="ghost"
                                                        size="sm"
                                                        :loading="isResendingInvite === invitation.id"
                                                        @click="resendInvitation(invitation)"
                                                    />
                                                </UTooltip>
                                                <UTooltip :text="t('team.cancelInvite')">
                                                    <UButton
                                                        icon="i-lucide-x"
                                                        color="error"
                                                        variant="ghost"
                                                        size="sm"
                                                        :loading="isCancellingInvite === invitation.id"
                                                        @click="cancelInvitation(invitation)"
                                                    />
                                                </UTooltip>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </UPageCard>

                    <!-- Error State -->
                    <div v-if="eventStore.teamError" class="text-center py-8">
                        <UIcon name="i-lucide-alert-circle" class="w-12 h-12 text-error mx-auto mb-4" />
                        <p class="text-muted">{{ eventStore.teamError }}</p>
                        <UButton
                            :label="t('common.retry')"
                            variant="outline"
                            class="mt-4"
                            @click="eventStore.loadTeamMembers()"
                        />
                    </div>
                </template>
            </div>

            <!-- Invite Member Modal -->
            <UModal v-model:open="showInviteModal" :ui="{ content: 'max-w-md' }">
                <template #content>
                    <UCard class="overflow-hidden">
                        <template #header>
                            <div class="flex items-start gap-4">
                                <div class="flex-shrink-0 w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                                    <UIcon name="i-lucide-user-plus" class="w-6 h-6 text-primary" />
                                </div>
                                <div class="flex-1 min-w-0">
                                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                                        {{ t('team.inviteMemberTitle') }}
                                    </h3>
                                    <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                        {{ t('team.inviteMemberDescription') }}
                                    </p>
                                </div>
                                <UButton
                                    icon="i-lucide-x"
                                    color="neutral"
                                    variant="ghost"
                                    size="sm"
                                    class="flex-shrink-0 -mt-1 -mr-1"
                                    @click="closeInviteModal"
                                />
                            </div>
                        </template>

                        <UForm
                            :schema="inviteSchema"
                            :state="inviteFormData"
                            class="space-y-5"
                            @submit="onInviteSubmit"
                        >
                            <UFormField
                                name="email"
                                :label="t('team.emailLabel')"
                            >
                                <UInput
                                    v-model="inviteFormData.email"
                                    type="email"
                                    :placeholder="t('team.emailPlaceholder')"
                                    icon="i-lucide-mail"
                                    size="lg"
                                />
                            </UFormField>

                            <!-- Actions -->
                            <div class="flex justify-end gap-3 pt-2">
                                <UButton
                                    :label="t('common.cancel')"
                                    color="neutral"
                                    variant="outline"
                                    @click="closeInviteModal"
                                />
                                <UButton
                                    :label="t('team.sendInvite')"
                                    icon="i-lucide-send"
                                    type="submit"
                                    :loading="isInviting"
                                />
                            </div>
                        </UForm>
                    </UCard>
                </template>
            </UModal>

            <!-- Change Role Modal -->
            <UModal v-model:open="showRoleModal" :ui="{ content: 'max-w-md' }">
                <template #content>
                    <UCard class="overflow-hidden">
                        <template #header>
                            <div class="flex items-start gap-4">
                                <div class="flex-shrink-0">
                                    <UAvatar
                                        v-if="selectedMember"
                                        :src="selectedMember.avatar_url || undefined"
                                        :alt="selectedMember.name"
                                        size="lg"
                                        class="ring-2 ring-primary/20"
                                    />
                                </div>
                                <div class="flex-1 min-w-0">
                                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                                        {{ t('team.changeRoleTitle') }}
                                    </h3>
                                    <p v-if="selectedMember" class="mt-1 text-sm text-gray-500 dark:text-gray-400 truncate">
                                        {{ selectedMember.name }} &bull; {{ selectedMember.email }}
                                    </p>
                                </div>
                                <UButton
                                    icon="i-lucide-x"
                                    color="neutral"
                                    variant="ghost"
                                    size="sm"
                                    class="flex-shrink-0"
                                    @click="closeRoleModal"
                                />
                            </div>
                        </template>

                        <div class="space-y-3">
                            <label
                                v-for="option in roleOptions"
                                :key="option.value"
                                class="flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all"
                                :class="selectedRole === option.value
                                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                    : 'border-default hover:border-primary/50'"
                                @click="selectedRole = option.value as 'editor' | 'viewer'"
                            >
                                <div class="flex items-center justify-center w-5 h-5 mt-0.5 rounded-full border-2 transition-colors"
                                    :class="selectedRole === option.value
                                        ? 'border-primary bg-primary'
                                        : 'border-gray-300 dark:border-gray-600'"
                                >
                                    <div v-if="selectedRole === option.value" class="w-2 h-2 rounded-full bg-white" />
                                </div>
                                <div>
                                    <p class="font-medium text-gray-900 dark:text-white">{{ option.label }}</p>
                                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ option.description }}</p>
                                </div>
                            </label>
                        </div>

                        <template #footer>
                            <div class="flex justify-end gap-3 pt-2">
                                <UButton
                                    :label="t('common.cancel')"
                                    variant="outline"
                                    @click="closeRoleModal"
                                />
                                <UButton
                                    :label="t('team.saveRole')"
                                    :loading="isUpdatingRole"
                                    icon="i-lucide-check"
                                    @click="saveRole"
                                />
                            </div>
                        </template>
                    </UCard>
                </template>
            </UModal>
        </template>
    </UDashboardPanel>
</template>
