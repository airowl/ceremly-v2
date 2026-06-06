<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'nuxt/app'
import { useI18n } from 'vue-i18n'
import { useToast } from '@nuxt/ui/composables'
import { useUserStore } from '~/stores/userStore'
import { useAuth } from '~/composables/useAuth'

const userStore = useUserStore()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { t } = useI18n()
const { user: authUser, client } = useAuth()

// @ts-ignore
definePageMeta({ layout: 'auth' })
// @ts-ignore
useSeoMeta({ title: () => t('invite.title') })

const invitationId = computed(() => route.params.id as string)

const invitation = ref<{
    id: string
    email: string
    organizationName: string
    inviterEmail: string
    status: string
    expiresAt: string
} | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const mode = ref<'login' | 'signup'>('login')
const accepting = ref(false)

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

async function fetchInvitation() {
    loading.value = true
    error.value = null
    try {
        const { data, error: apiErr } = await client.organization.getInvitation({ query: { id: invitationId.value } })
        if (apiErr || !data) {
            error.value = apiErr?.message || t('invite.invalidInvitationMessage')
            return
        }
        invitation.value = {
            id: data.id,
            email: data.email,
            organizationName: (data as any).organizationName ?? (data as any).organization?.name ?? '',
            inviterEmail: (data as any).inviterEmail ?? (data as any).inviter?.user?.email ?? '',
            status: data.status,
            expiresAt: data.expiresAt as unknown as string,
        }
        if (invitation.value.status !== 'pending') {
            error.value = t('invite.alreadyAccepted')
        }
    } catch (err: any) {
        error.value = err.message || err.data?.message || t('invite.failedToLoad')
    } finally {
        loading.value = false
    }
}

const defaultEmail = computed(() => invitation.value?.email || '')

async function acceptInvitation() {
    accepting.value = true
    try {
        const { error: apiErr } = await client.organization.acceptInvitation({ invitationId: invitationId.value })
        if (apiErr) throw new Error(apiErr.message || t('invite.failedToAccept'))
        toast.add({ title: t('invite.welcomeToTeam'), description: t('invite.youveJoined', { org: invitation.value?.organizationName }), color: 'success' })
        await router.push('/dashboard/organization')
    } catch (err: any) {
        error.value = err.data?.message || err.message || t('invite.failedToAccept')
        toast.add({ title: t('invite.error'), description: err.data?.message || err.message, color: 'error' })
    } finally {
        accepting.value = false
    }
}

async function onLoginSubmit(payload: FormSubmitEvent<LoginSchema>) {
    try {
        await userStore.login(payload.data.email, payload.data.password)
        await acceptInvitation()
    } catch (err: any) {
        toast.add({ title: t('invite.error'), description: err.message, color: 'error' })
    }
}

async function onSignupSubmit(payload: FormSubmitEvent<SignupSchema>) {
    try {
        await userStore.signup(payload.data.email, payload.data.password, { name: payload.data.name })
        toast.add({ title: t('invite.accountCreated'), description: t('invite.verifyEmailMessage'), color: 'info' })
    } catch (err: any) {
        toast.add({ title: t('invite.error'), description: err.message, color: 'error' })
    }
}

onMounted(async () => {
    await fetchInvitation()
    if (!userStore.isAuthenticated) await userStore.initializeAuth()
    if (authUser.value && invitation.value && !error.value) {
        const userEmail = authUser.value.email?.toLowerCase()
        const inviteEmail = invitation.value.email?.toLowerCase()
        if (userEmail === inviteEmail) await acceptInvitation()
        else error.value = t('invite.emailMismatchDescription', { email: invitation.value.email })
    }
})
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

            <template v-else-if="error && !invitation">
                <div class="flex flex-col items-center justify-center py-12 text-center">
                    <UIcon name="i-lucide-x-circle" class="w-16 h-16 text-red-500 mb-4" />
                    <h2 class="text-xl font-semibold mb-2">{{ $t('invite.invalidInvitation') }}</h2>
                    <p class="text-muted mb-6">{{ error }}</p>
                    <UButton to="/login" variant="soft">{{ $t('invite.goToLogin') }}</UButton>
                </div>
            </template>

            <template v-else-if="invitation">
                <div class="mb-6 text-center">
                    <UIcon name="i-lucide-users" class="w-12 h-12 text-primary mb-4 mx-auto" />
                    <h1 class="text-2xl font-bold mb-2">{{ $t('invite.youreInvited') }}</h1>
                    <p class="text-muted">{{ $t('invite.hasInvitedYou', { name: invitation.inviterEmail }) }}</p>
                    <p class="text-lg font-semibold text-primary mt-1">{{ invitation.organizationName }}</p>
                </div>

                <template v-if="error">
                    <UAlert color="warning" class="mb-4">
                        <template #title>{{ $t('invite.emailMismatch') }}</template>
                        <template #description>{{ error }}</template>
                    </UAlert>
                    <UButton block variant="outline" @click="userStore.logout().then(() => { error = null })">
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
                        @update:model-value="mode = $event as 'login' | 'signup'"
                        :items="[{ label: $t('invite.login'), value: 'login' }, { label: $t('invite.signUp'), value: 'signup' }]"
                        class="mb-4"
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
