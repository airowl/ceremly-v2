<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({
    layout: 'auth',
    auth: { only: 'guest' }
})

const { t } = useI18n()

useSeoMeta({
    title: () => t('auth.signup.pageTitle'),
    description: () => t('auth.signup.pageDescription')
})

const { signUp, signIn, fetchSession, errorCodes } = useAuth()
const toast = useToast()
const route = useRoute()
const loading = ref(false)

const fields = computed(() => [
    {
        name: 'name',
        type: 'text' as const,
        label: t('auth.signup.name'),
        placeholder: t('auth.signup.namePlaceholder')
    }, {
        name: 'email',
        type: 'text' as const,
        label: t('auth.signup.email'),
        placeholder: t('auth.signup.emailPlaceholder')
    }, {
        name: 'password',
        label: t('auth.signup.password'),
        type: 'password' as const,
        placeholder: t('auth.signup.passwordPlaceholder')
    }
])

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
                toast.add({ title: t('auth.signup.errors.title'), description: error.message || t('auth.signup.errors.googleFailed') })
            } finally {
                loading.value = false
            }
        }
    }
])

const schema = computed(() => z.object({
    name: z.string().min(1, t('auth.signup.validation.nameRequired')),
    email: z.string().email(t('auth.signup.validation.invalidEmail')),
    password: z.string().min(8, t('auth.signup.validation.passwordTooShort'))
}))

type Schema = z.output<typeof schema.value>

async function onSubmit(payload: FormSubmitEvent<Schema>) {
    const { name, email, password } = payload.data
    loading.value = true

    try {
        const { error } = await signUp.email({
            email,
            password,
            name,
            callbackURL: (route.query.redirect as string) || '/dashboard'
        })

        if (error) {
            let message = error.message || t('auth.signup.errors.signUpFailed')
            if (error.code === errorCodes?.USER_ALREADY_EXISTS) {
                message = t('auth.signup.errors.userAlreadyExists')
            }
            toast.add({ title: t('auth.signup.errors.title'), description: message })
            return
        }

        toast.add({ title: t('auth.signup.success.title'), description: t('auth.signup.success.checkEmail') })
        await fetchSession()
    } catch (error: any) {
        toast.add({ title: t('auth.signup.errors.title'), description: error.message || t('auth.signup.errors.signUpFailed') })
    } finally {
        loading.value = false
    }
}
</script>

<template>
    <UAuthForm :fields="fields" :schema="schema" :providers="providers" :title="$t('auth.signup.title')"
        :submit="{ label: $t('auth.signup.createAccount') }" @submit="onSubmit">
        <template #description>
            {{ $t('auth.signup.alreadyHaveAccount') }} <ULink to="/login" class="text-primary font-medium">{{ $t('auth.signup.login') }}</ULink>.
        </template>

        <template #footer>
            {{ $t('auth.signup.termsAgreement') }} <ULink to="/legal/tos" class="text-primary font-medium">{{ $t('auth.signup.termsOfService') }}</ULink>.
        </template>
    </UAuthForm>
</template>
