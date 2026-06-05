<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { useUserStore } from '~/stores/userStore'

const userStore = useUserStore()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { t } = useI18n()
const { user: authUser, session } = useAuth()

definePageMeta({
    layout: 'auth',
})

useSeoMeta({
    title: () => t('invite.title'),
    description: () => t('invite.title')
})

// State
const invitation = ref<{
    id: string
    event_id: string
    event_name: string
    email: string
    invited_by: string
    expires_at: string
    created_at: string
} | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const mode = ref<'login' | 'signup'>('login')
const accepting = ref(false)

// Get token from URL
const token = computed(() => route.params.token as string)

// Form fields for login
const loginFields = computed(() => [{
    name: 'email',
    type: 'text' as const,
    label: t('invite.email'),
    placeholder: t('invite.emailPlaceholder'),
    required: true
}, {
    name: 'password',
    label: t('invite.password'),
    type: 'password' as const,
    placeholder: t('invite.passwordPlaceholder')
}])

// Form fields for signup
const signupFields = computed(() => [{
    name: 'name',
    type: 'text' as const,
    label: t('invite.fullName'),
    placeholder: t('invite.fullNamePlaceholder'),
    required: true
}, {
    name: 'email',
    type: 'text' as const,
    label: t('invite.email'),
    placeholder: t('invite.emailPlaceholder'),
    required: true
}, {
    name: 'password',
    label: t('invite.password'),
    type: 'password' as const,
    placeholder: t('invite.passwordPlaceholderSignup')
}, {
    name: 'confirmPassword',
    label: t('invite.confirmPassword'),
    type: 'password' as const,
    placeholder: t('invite.confirmPasswordPlaceholder')
}])

const loginSchema = computed(() => z.object({
    email: z.string().email(t('invite.validation.invalidEmail')),
    password: z.string().min(8, t('invite.validation.passwordTooShort'))
}))

const signupSchema = computed(() => z.object({
    name: z.string().min(2, t('invite.validation.nameTooShort')),
    email: z.string().email(t('invite.validation.invalidEmail')),
    password: z.string().min(8, t('invite.validation.passwordTooShort')),
    confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
    message: t('invite.validation.passwordsMustMatch'),
    path: ['confirmPassword']
}))

// Manual type definitions since schemas are computed for i18n
interface LoginSchema {
    email: string
    password: string
}

interface SignupSchema {
    name: string
    email: string
    password: string
    confirmPassword: string
}

const providers = [
    {
        label: 'Google',
        icon: 'i-simple-icons-google',
        onClick: async () => {
            try {
                // Store token in localStorage for post-OAuth flow
                localStorage.setItem('invite_token', token.value)
                await userStore.loginOAuth('google')
            } catch (err: any) {
                toast.add({ title: t('invite.error'), description: err.message, color: 'error' })
            }
        }
    }
]

// Fetch invitation details
async function fetchInvitation() {
    loading.value = true
    error.value = null

    try {
        const data = await $fetch<{
            success: boolean
            status: 'pending' | 'accepted' | 'expired' | 'cancelled'
            message?: string
            event_name?: string
            invitation?: {
                id: string
                email: string
                event_id: string
                event_name: string
                invited_by: string
                expires_at: string
                created_at: string
            }
        }>(`/api/team/invite/${token.value}`)

        if (!data.success) {
            // Handle different statuses
            if (data.status === 'accepted') {
                error.value = data.message || t('invite.alreadyAccepted')
            } else if (data.status === 'expired') {
                error.value = data.message || t('invite.expired')
            } else if (data.status === 'cancelled') {
                error.value = data.message || t('invite.cancelled')
            } else {
                error.value = data.message || t('invite.invalidInvitationMessage')
            }
            return
        }

        invitation.value = data.invitation || null
    } catch (err: any) {
        error.value = err.message || err.data?.message || t('invite.failedToLoad')
    } finally {
        loading.value = false
    }
}

// Default email from invitation
const defaultEmail = computed(() => invitation.value?.email || '')

// Accept the invitation after authentication
async function acceptInvitation() {
    accepting.value = true

    try {
        if (!session.value) {
            throw new Error(t('invite.authRequired'))
        }

        const data = await $fetch<{ success: boolean; event_name?: string; error?: string }>(
            '/api/team/accept-invite',
            {
                method: 'POST',
                body: { token: token.value },
            }
        )

        if (!data.success) {
            throw new Error(data.error || t('invite.failedToAccept'))
        }

        toast.add({
            title: t('invite.welcomeToTeam'),
            description: t('invite.youveJoined', { event: data.event_name || 'the event' }),
            color: 'success'
        })

        // Redirect to dashboard (user will need to select the event)
        await router.push('/dashboard')
    } catch (err: any) {
        toast.add({ title: t('invite.error'), description: err.data?.message || err.message, color: 'error' })
    } finally {
        accepting.value = false
    }
}

// Login and accept
async function onLoginSubmit(payload: FormSubmitEvent<LoginSchema>) {
    try {
        await userStore.login(payload.data.email, payload.data.password)
        toast.add({ title: t('invite.success'), description: t('invite.loggedInSuccessfully'), color: 'success' })

        // Now accept the invitation
        await acceptInvitation()
    } catch (err: any) {
        toast.add({ title: t('invite.error'), description: err.message, color: 'error' })
    }
}

// Signup and accept
async function onSignupSubmit(payload: FormSubmitEvent<SignupSchema>) {
    try {
        await userStore.signup(payload.data.email, payload.data.password, {
            name: payload.data.name,
        })

        toast.add({
            title: t('invite.accountCreated'),
            description: t('invite.verifyEmailMessage'),
            color: 'info'
        })

        // Note: User needs to verify email first before accepting
        // We can't auto-accept without verified email
    } catch (err: any) {
        toast.add({ title: t('invite.error'), description: err.message, color: 'error' })
    }
}

// Check if already authenticated on mount
onMounted(async () => {
    await fetchInvitation()

    // Check for stored token from OAuth flow
    const storedToken = localStorage.getItem('invite_token')
    if (storedToken) {
        localStorage.removeItem('invite_token')
    }

    // Initialize auth and check if already logged in
    if (!userStore.isAuthenticated) {
        await userStore.initializeAuth()
    }

    // If already authenticated, try to accept immediately
    if (authUser.value && invitation.value) {
        // Verify the email matches
        const userEmail = authUser.value.email?.toLowerCase()
        const inviteEmail = invitation.value.email?.toLowerCase()

        if (userEmail === inviteEmail) {
            await acceptInvitation()
        } else {
            error.value = t('invite.emailMismatchDescription', { email: invitation.value.email })
        }
    }
})

// Format expiration date
const formattedExpiresAt = computed(() => {
    if (!invitation.value?.expires_at) return ''
    return new Date(invitation.value.expires_at).toLocaleDateString()
})
</script>

<template>
    <div class="min-h-screen flex items-center justify-center p-4">
        <UCard class="w-full max-w-md">
            <!-- Loading state -->
            <template v-if="loading">
                <div class="flex flex-col items-center justify-center py-12">
                    <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary mb-4" />
                    <p class="text-muted">{{ $t('invite.loading') }}</p>
                </div>
            </template>

            <!-- Error state -->
            <template v-else-if="error && !invitation">
                <div class="flex flex-col items-center justify-center py-12 text-center">
                    <UIcon name="i-lucide-x-circle" class="w-16 h-16 text-red-500 mb-4" />
                    <h2 class="text-xl font-semibold mb-2">{{ $t('invite.invalidInvitation') }}</h2>
                    <p class="text-muted mb-6">{{ error }}</p>
                    <UButton to="/login" variant="soft">
                        {{ $t('invite.goToLogin') }}
                    </UButton>
                </div>
            </template>

            <!-- Invitation found -->
            <template v-else-if="invitation">
                <!-- Invitation details -->
                <div class="mb-6 text-center">
                    <UIcon name="i-lucide-users" class="w-12 h-12 text-primary mb-4 mx-auto" />
                    <h1 class="text-2xl font-bold mb-2">{{ $t('invite.youreInvited') }}</h1>
                    <p class="text-muted">
                        {{ $t('invite.hasInvitedYou', { name: invitation.invited_by }) }}
                    </p>
                    <p class="text-lg font-semibold text-primary mt-1">
                        {{ invitation.event_name }}
                    </p>
                </div>

                <!-- Already authenticated error -->
                <template v-if="error">
                    <UAlert color="warning" class="mb-4">
                        <template #title>{{ $t('invite.emailMismatch') }}</template>
                        <template #description>{{ error }}</template>
                    </UAlert>

                    <UButton
                        block
                        variant="outline"
                        @click="userStore.logout().then(() => { error = null })"
                    >
                        {{ $t('invite.logoutAndUse') }}
                    </UButton>
                </template>

                <!-- Accepting state -->
                <template v-else-if="accepting">
                    <div class="flex flex-col items-center justify-center py-8">
                        <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary mb-4" />
                        <p class="text-muted">{{ $t('invite.joiningEvent') }}</p>
                    </div>
                </template>

                <!-- Already authenticated - auto-accepting -->
                <template v-else-if="userStore.isAuthenticated">
                    <div class="flex flex-col items-center justify-center py-8">
                        <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary mb-4" />
                        <p class="text-muted">{{ $t('invite.processingInvitation') }}</p>
                    </div>
                </template>

                <!-- Not authenticated - show login/signup -->
                <template v-else>
                    <!-- Mode tabs -->
                    <UTabs
                        :model-value="mode"
                        @update:model-value="mode = $event as 'login' | 'signup'"
                        :items="[
                            { label: $t('invite.login'), value: 'login' },
                            { label: $t('invite.signUp'), value: 'signup' }
                        ]"
                        class="mb-4"
                    />

                    <!-- Login form -->
                    <template v-if="mode === 'login'">
                        <UAuthForm
                            :fields="loginFields"
                            :schema="loginSchema"
                            :providers="providers"
                            title=""
                            :default-values="{ email: defaultEmail }"
                            @submit="onLoginSubmit"
                        >
                            <template #footer>
                                <p class="text-sm text-muted text-center">
                                    {{ $t('invite.bySigningIn', { event: invitation.event_name }) }}
                                </p>
                            </template>
                        </UAuthForm>
                    </template>

                    <!-- Signup form -->
                    <template v-else>
                        <UAuthForm
                            :fields="signupFields"
                            :schema="signupSchema"
                            :providers="providers"
                            title=""
                            :default-values="{ email: defaultEmail }"
                            @submit="onSignupSubmit"
                        >
                            <template #footer>
                                <p class="text-sm text-muted text-center">
                                    {{ $t('invite.afterSignUp', { event: invitation.event_name }) }}
                                </p>
                            </template>
                        </UAuthForm>
                    </template>
                </template>

                <!-- Expiration notice -->
                <div class="mt-6 pt-4 border-t text-center">
                    <p class="text-xs text-muted">
                        {{ $t('invite.expiresOn', { date: formattedExpiresAt }) }}
                    </p>
                </div>
            </template>
        </UCard>
    </div>
</template>
