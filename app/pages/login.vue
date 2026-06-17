<script setup lang="ts">
// Login Ceremly — port di LoginScreen (docs/ui/project/screens/auth.jsx).
// La logica Better Auth (signIn email/password + Google, error handling,
// redirect post-login) è identica alla pagina precedente: cambia solo la pelle.
import * as z from 'zod'

definePageMeta({
    layout: false,
    auth: { only: 'guest' }
})

const { t } = useI18n()

useSeoMeta({
    title: t('ceremly.login.seoTitle'),
    description: t('ceremly.login.seoDescription')
})

const { signIn, fetchSession, errorCodes } = useAuth()
const toast = useToast()
const route = useRoute()
const loading = ref(false)

// Redirect post-login SOLO se same-origin relativo (deve iniziare con un singolo
// '/'): blocca l'open-redirect `?redirect=//evil.com` o `?redirect=https://…`
// (phishing post-auth). Altrimenti fallback a /dashboard.
function safeRedirect(): string {
    const raw = route.query.redirect
    const path = typeof raw === 'string' ? raw : ''
    return /^\/(?!\/)/.test(path) ? path : '/dashboard'
}

const email = ref('')
const password = ref('')
const remember = ref(true)
const formError = ref<string | null>(null)

const schema = z.object({
    email: z.string().email(t('ceremly.login.validationEmail')),
    password: z.string().min(8, t('ceremly.login.validationPassword'))
})

async function signInWithGoogle() {
    try {
        loading.value = true
        await signIn.social({
            provider: 'google',
            callbackURL: safeRedirect()
        })
    } catch (error) {
        toast.add({ title: t('ceremly.login.errorTitle'), description: error instanceof Error && error.message ? error.message : t('ceremly.login.errorGoogle') })
    } finally {
        loading.value = false
    }
}

async function onSubmit() {
    formError.value = null

    const parsed = schema.safeParse({ email: email.value, password: password.value })
    if (!parsed.success) {
        formError.value = parsed.error.issues[0]?.message ?? t('ceremly.login.validationGeneric')
        return
    }

    loading.value = true

    try {
        const { error } = await signIn.email({
            email: parsed.data.email,
            password: parsed.data.password,
            callbackURL: safeRedirect()
        })

        if (error) {
            let message = error.message || t('ceremly.login.errorFallback')
            if (error.code === errorCodes?.INVALID_EMAIL_OR_PASSWORD) {
                message = t('ceremly.login.errorInvalidCredentials')
            } else if (error.code === errorCodes?.EMAIL_NOT_VERIFIED) {
                message = t('ceremly.login.errorEmailNotVerified')
            }
            toast.add({ title: t('ceremly.login.errorTitle'), description: message })
            return
        }

        toast.add({ title: t('ceremly.login.successTitle'), description: t('ceremly.login.successDescription') })
        await fetchSession()
        await reloadNuxtApp({ path: safeRedirect() })
    } catch (error) {
        toast.add({ title: t('ceremly.login.errorTitle'), description: error instanceof Error && error.message ? error.message : t('ceremly.login.errorFallback') })
    } finally {
        loading.value = false
    }
}
</script>

<template>
    <CeremlyAuthShell
        :label="$t('ceremly.login.shellLabel')"
        :body="$t('ceremly.login.shellBody')"
        :quote="{
            text: $t('ceremly.login.quoteText')
        }"
        :foot="$t('ceremly.login.shellFoot')"
    >
        <template #title>
            {{ $t('ceremly.login.titleLine1') }}<br>{{ $t('ceremly.login.titleLine2') }}<br><span style="color: #fff; text-decoration: underline; text-decoration-color: var(--orange); text-decoration-thickness: 4px; text-underline-offset: 6px;">{{ $t('ceremly.login.titleLine3') }}</span>.
        </template>

        <div class="serif" style="font-size: 42px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.05;">{{ $t('ceremly.login.heading') }}</div>
        <p style="font-size: 14px; color: var(--ink-500); margin-top: 8px;">
            {{ $t('ceremly.login.newHere') }} <NuxtLink to="/signup" style="color: var(--purple); font-weight: 600; text-decoration: none;">{{ $t('ceremly.login.createAccount') }}</NuxtLink>
        </p>

        <div style="margin-top: 32px;">
            <!-- Social: SOLO Google (Apple non configurato) -->
            <div style="display: grid; grid-template-columns: 1fr; gap: 10px;">
                <button
                    type="button"
                    class="cer-btn ghost"
                    style="justify-content: center; padding: 11px 12px; font-size: 13px;"
                    :disabled="loading"
                    @click="signInWithGoogle"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="#EA4335" d="M12 11v3.2h5.3c-.2 1.4-1.6 4-5.3 4-3.2 0-5.8-2.6-5.8-5.9s2.6-5.9 5.8-5.9c1.8 0 3 .8 3.7 1.5l2.5-2.4C16.7 4 14.5 3 12 3 6.9 3 2.8 7.1 2.8 12.2S6.9 21.4 12 21.4c6.9 0 9.5-4.8 9.5-7.3 0-.5-.1-.9-.1-1.3H12z" /></svg>
                    {{ $t('ceremly.login.continueWithGoogle') }}
                </button>
            </div>

            <div class="row" style="gap: 12px; margin: 20px 0; align-items: center;">
                <div style="flex: 1; height: 1px; background: var(--bone-200);" />
                <span class="mono" style="font-size: 10px; color: var(--ink-400); letter-spacing: 0.08em;">{{ $t('ceremly.login.or') }}</span>
                <div style="flex: 1; height: 1px; background: var(--bone-200);" />
            </div>

            <form class="col" style="gap: 16px;" novalidate @submit.prevent="onSubmit">
                <label class="col" style="gap: 6px;">
                    <div class="row" style="justify-content: space-between;">
                        <span class="mono" style="font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-500);">Email</span>
                    </div>
                    <input v-model="email" class="cer-input" type="email" autocomplete="email" :placeholder="$t('ceremly.login.emailPlaceholder')">
                </label>
                <label class="col" style="gap: 6px;">
                    <div class="row" style="justify-content: space-between;">
                        <span class="mono" style="font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-500);">Password</span>
                        <NuxtLink to="/" tabindex="-1" class="small" style="color: var(--wine); text-decoration: none;">{{ $t('ceremly.login.forgotPassword') }}</NuxtLink>
                    </div>
                    <input v-model="password" class="cer-input" type="password" autocomplete="current-password" placeholder="••••••••••••">
                </label>

                <label class="row" style="gap: 8px; font-size: 13px; color: var(--ink-700); cursor: pointer;">
                    <input v-model="remember" type="checkbox" style="accent-color: var(--purple);">
                    {{ $t('ceremly.login.rememberMe') }}
                </label>

                <p v-if="formError" class="small" style="color: var(--decline); margin: 0;">{{ formError }}</p>

                <button
                    type="submit"
                    class="cer-btn"
                    style="width: 100%; justify-content: center; padding: 13px 16px; margin-top: 4px;"
                    :disabled="loading"
                >
                    {{ loading ? $t('ceremly.login.signingIn') : $t('common.signIn') }}
                </button>
            </form>

            <div class="row" style="justify-content: center; gap: 6px; margin-top: 24px; font-size: 12px; color: var(--ink-500);">
                <CeremlyCerIcon name="check" :s="12" /> {{ $t('ceremly.login.e2eNotice') }}
            </div>
        </div>
    </CeremlyAuthShell>
</template>

<style scoped>
.cer-btn:disabled {
    opacity: 0.6;
    cursor: default;
}
</style>
