<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({
    layout: 'auth',
    auth: { only: 'guest' }
})

const { t } = useI18n()

useSeoMeta({
    title: () => t('auth.login.pageTitle'),
    description: () => t('auth.login.pageDescription')
})

const { signIn, fetchSession, errorCodes } = useAuth()
const toast = useToast()
const route = useRoute()
const loading = ref(false)

const fields = computed(() => [{
    name: 'email',
    type: 'text' as const,
    label: t('auth.login.email'),
    placeholder: t('auth.login.emailPlaceholder'),
    required: true
}, {
    name: 'password',
    label: t('auth.login.password'),
    type: 'password' as const,
    placeholder: t('auth.login.passwordPlaceholder')
}, {
    name: 'remember',
    label: t('auth.login.rememberMe'),
    type: 'checkbox' as const
}])

const providers = computed(() => [
    {
        label: 'Google',
        icon: 'i-simple-icons-google',
        onClick: async () => {
            try {
                loading.value = true
                await signIn.social({
                    provider: 'google',
                    callbackURL: (route.query.redirect as string) || '/dashboard'
                })
            } catch (error: any) {
                toast.add({ title: t('auth.login.errors.title'), description: error.message || t('auth.login.errors.googleFailed') })
            } finally {
                loading.value = false
            }
        }
    }
])

const schema = computed(() => z.object({
    email: z.string().email(t('auth.login.validation.invalidEmail')),
    password: z.string().min(8, t('auth.login.validation.passwordTooShort'))
}))

type Schema = z.output<typeof schema.value>

async function onSubmit(payload: FormSubmitEvent<Schema>) {
    const { email, password } = payload.data
    loading.value = true

    try {
        const { error } = await signIn.email({
            email,
            password,
            callbackURL: (route.query.redirect as string) || '/dashboard'
        })

        if (error) {
            let message = error.message || t('auth.login.errors.signInFailed')
            if (error.code === errorCodes?.INVALID_EMAIL_OR_PASSWORD) {
                message = t('auth.login.errors.invalidCredentials')
            } else if (error.code === errorCodes?.EMAIL_NOT_VERIFIED) {
                message = t('auth.login.errors.emailNotVerified')
            }
            toast.add({ title: t('auth.login.errors.title'), description: message })
            return
        }

        toast.add({ title: t('auth.login.success.title'), description: t('auth.login.success.loggedIn') })
        await fetchSession()
        await reloadNuxtApp({ path: (route.query.redirect as string) || '/dashboard' })
    } catch (error: any) {
        toast.add({ title: t('auth.login.errors.title'), description: error.message || t('auth.login.errors.signInFailed') })
    } finally {
        loading.value = false
    }
}
</script>

<template>
    <UAuthForm :fields="fields" :schema="schema" :providers="providers" :title="$t('auth.login.title')" icon="i-lucide-lock"
        @submit="onSubmit">
        <template #description>
            {{ $t('auth.login.noAccount') }} <ULink to="/signup" class="text-primary font-medium">{{ $t('auth.login.signUp') }}</ULink>.
        </template>

        <template #password-hint>
            <ULink to="/" class="text-primary font-medium" tabindex="-1">{{ $t('auth.login.forgotPassword') }}</ULink>
        </template>

        <template #footer>
            {{ $t('auth.login.termsAgreement') }} <ULink to="/legal/tos" class="text-primary font-medium">{{ $t('auth.login.termsOfService') }}</ULink>.
        </template>
    </UAuthForm>
</template>
