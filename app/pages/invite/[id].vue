<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'nuxt/app'
import { useI18n } from 'vue-i18n'
import { useToast } from '@nuxt/ui/composables'
import { useConvexMutation, useConvexQuery } from 'convex-vue'
import { api } from '~~/convex/_generated/api'
import { useUserStore } from '~/stores/userStore'
import { useAuth } from '~/composables/useAuth'
import { convexErrorCode, convexErrorMessage } from '~/composables/useConvexError'
import { isInvitationToken, toInvitationPreview } from '~/lib/organizations'

/**
 * Organization invitation acceptance — Task 14, part b.
 *
 * URL contract: `/invite/{token}`, where `token` is the 64-hex credential the
 * invitation email carries (`send-org-invite-email` job). Before this task the
 * segment was the Better Auth plugin's invitation id and the page talked to the
 * organization client plugin; now it reads `organizations.getInvitationByToken`
 * (public: a visitor without a session sees who invited them, as before) and
 * accepts with `organizations.acceptInvitation({ token })`. A legacy link (plugin
 * id) is not a token and shows "invalid invitation": pending legacy invitations
 * are not migrated and must be re-issued (Task 10).
 */

const userStore = useUserStore()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { t } = useI18n()
const { user: authUser } = useAuth()

// @ts-ignore
definePageMeta({ layout: 'auth' })
// @ts-ignore
useSeoMeta({ title: () => t('invite.title') })

const token = computed(() => String(route.params.id ?? ''))
const tokenIsValid = computed(() => isInvitationToken(token.value))

// A malformed segment never reaches Convex: the query answers `null` for it anyway,
// but there is no reason to ask.
const { data: previewData, error: previewError } = useConvexQuery(
    api.organizations.getInvitationByToken,
    computed(() => ({ token: tokenIsValid.value ? token.value : '' })),
    { server: false },
)
const acceptMutation = useConvexMutation(api.organizations.acceptInvitation)

const invitation = computed(() => toInvitationPreview(previewData.value))
const loading = computed(() => tokenIsValid.value && previewData.value === undefined && !previewError.value)
const error = ref<string | null>(null)
const mode = ref<'login' | 'signup'>('login')
const accepting = ref(false)
const accepted = ref(false)

const loginFields = computed(() => [
    { name: 'email', type: 'text' as const, label: t('invite.email'), placeholder: t('invite.emailPlaceholder'), required: true },
    { name: 'password', type: 'password' as const, label: t('invite.password'), placeholder: t('invite.passwordPlaceholder') },
])
const signupFields = computed(() => [
    { name: 'name', type: 'text' as const, label: t('invite.fullName'), placeholder: t('invite.fullNamePlaceholder'), required: true },
    { name: 'email', type: 'text' as const, label: t('invite.email'), placeholder: t('invite.emailPlaceholder'), required: true },
    { name: 'password', type: 'password' as const, label: t('invite.password'), placeholder: t('invite.passwordPlaceholderSignup') },
])
const loginSchema = computed(() => z.object({
    email: z.string().email(t('invite.validation.invalidEmail')),
    password: z.string().min(8, t('invite.validation.passwordTooShort')),
}))
const signupSchema = computed(() => z.object({
    name: z.string().min(2, t('invite.validation.nameTooShort')),
    email: z.string().email(t('invite.validation.invalidEmail')),
    password: z.string().min(8, t('invite.validation.passwordTooShort')),
}))
interface LoginSchema { email: string; password: string }
interface SignupSchema { name: string; email: string; password: string }

/** Why the invitation cannot be used, or `null` if it can (a pending, unexpired one). */
const unusableReason = computed<string | null>(() => {
    if (!tokenIsValid.value) return t('invite.invalidInvitationMessage')
    if (previewError.value) return t('invite.failedToLoad')
    if (previewData.value === null) return t('invite.invalidInvitationMessage')
    switch (invitation.value?.status) {
        case 'accepted': return accepted.value ? null : t('invite.alreadyAccepted')
        case 'canceled': return t('invite.cancelled')
        case 'expired': return t('invite.expired')
        default: return null
    }
})

const defaultEmail = computed(() => invitation.value?.email || '')

async function acceptInvitation() {
    accepting.value = true
    try {
        await acceptMutation.mutate({ token: token.value })
        accepted.value = true
        toast.add({ title: t('invite.welcomeToTeam'), description: t('invite.youveJoined', { org: invitation.value?.organizationName }), color: 'success' })
        await router.push('/dashboard/organization')
    } catch (err) {
        const code = convexErrorCode(err)
        const message = code === 'INVITATION_EMAIL_MISMATCH'
            ? t('invite.emailMismatchDescription', { email: invitation.value?.email })
            : code === 'INVITATION_EXPIRED'
                ? t('invite.expired')
                : convexErrorMessage(err, t('invite.failedToAccept'))
        error.value = message
        toast.add({ title: t('invite.error'), description: message, color: 'error' })
    } finally {
        accepting.value = false
    }
}

/**
 * Accept automatically once both the session and the invitation are known, and
 * only if the signed-in address is the invited one (the server enforces it too).
 */
async function maybeAccept() {
    if (accepting.value || accepted.value) return
    if (!authUser.value || !invitation.value || unusableReason.value) return
    if (invitation.value.status !== 'pending') return
    const userEmail = authUser.value.email?.toLowerCase()
    if (userEmail !== invitation.value.email.toLowerCase()) {
        error.value = t('invite.emailMismatchDescription', { email: invitation.value.email })
        return
    }
    await acceptInvitation()
}

async function onLoginSubmit(payload: FormSubmitEvent<LoginSchema>) {
    try {
        await userStore.login(payload.data.email, payload.data.password)
        // Full reload, like the login page: the Convex client installed before
        // sign-in has no token, and the reloaded page auto-accepts with one.
        await reloadNuxtApp({ path: route.fullPath })
    } catch (err) {
        toast.add({ title: t('invite.error'), description: err instanceof Error ? err.message : String(err), color: 'error' })
    }
}

async function onSignupSubmit(payload: FormSubmitEvent<SignupSchema>) {
    try {
        await userStore.signup(payload.data.email, payload.data.password, { name: payload.data.name })
        toast.add({ title: t('invite.accountCreated'), description: t('invite.verifyEmailMessage'), color: 'info' })
    } catch (err) {
        toast.add({ title: t('invite.error'), description: err instanceof Error ? err.message : String(err), color: 'error' })
    }
}

async function logoutAndRetry() {
    await userStore.logout()
    error.value = null
}

onMounted(async () => {
    if (!userStore.isAuthenticated) await userStore.initializeAuth()
    await maybeAccept()
})

// The preview arrives after mount (live query): accept as soon as it does.
watch(invitation, () => { void maybeAccept() })
</script>

<template>
    <div class="min-h-screen flex items-center justify-center p-4">
        <UCard class="w-full max-w-md">
            <template v-if="loading">
                <div class="flex flex-col items-center justify-center py-12">
                    <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary mb-4" />
                    <p class="text-muted">{{ $t('invite.loading') }}</p>
                </div>
            </template>

            <template v-else-if="unusableReason">
                <div class="flex flex-col items-center justify-center py-12 text-center">
                    <UIcon name="i-lucide-x-circle" class="w-16 h-16 text-red-500 mb-4" />
                    <h2 class="text-xl font-semibold mb-2">{{ $t('invite.invalidInvitation') }}</h2>
                    <p class="text-muted mb-6">{{ unusableReason }}</p>
                    <UButton to="/login" variant="soft">{{ $t('invite.goToLogin') }}</UButton>
                </div>
            </template>

            <template v-else-if="invitation">
                <div class="mb-6 text-center">
                    <UIcon name="i-lucide-users" class="w-12 h-12 text-primary mb-4 mx-auto" />
                    <h1 class="text-2xl font-bold mb-2">{{ $t('invite.youreInvited') }}</h1>
                    <p class="text-muted">{{ $t('invite.hasInvitedYou', { name: invitation.inviterName }) }}</p>
                    <p class="text-lg font-semibold text-primary mt-1">{{ invitation.organizationName }}</p>
                </div>

                <template v-if="error">
                    <UAlert color="warning" class="mb-4">
                        <template #title>{{ $t('invite.emailMismatch') }}</template>
                        <template #description>{{ error }}</template>
                    </UAlert>
                    <UButton block variant="outline" @click="logoutAndRetry">
                        {{ $t('invite.logoutAndUse') }}
                    </UButton>
                </template>

                <template v-else-if="accepting || userStore.isAuthenticated">
                    <div class="flex flex-col items-center justify-center py-8">
                        <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary mb-4" />
                        <p class="text-muted">{{ $t('invite.processingInvitation') }}</p>
                    </div>
                </template>

                <template v-else>
                    <UTabs
                        :model-value="mode"
                        :items="[{ label: $t('invite.login'), value: 'login' }, { label: $t('invite.signUp'), value: 'signup' }]"
                        class="mb-4"
                        @update:model-value="mode = $event as 'login' | 'signup'"
                    />
                    <template v-if="mode === 'login'">
                        <UAuthForm :fields="loginFields" :schema="loginSchema" title="" :default-values="{ email: defaultEmail }" @submit="onLoginSubmit" />
                    </template>
                    <template v-else>
                        <UAuthForm :fields="signupFields" :schema="signupSchema" title="" :default-values="{ email: defaultEmail }" @submit="onSignupSubmit" />
                    </template>
                </template>
            </template>
        </UCard>
    </div>
</template>
