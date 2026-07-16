<script setup lang="ts">
// Ceremly signup — port of RegisterScreen (docs/ui/project/screens/auth.jsx).
// The Better Auth logic (signUp email/password + Google, error handling,
// fetchSession post-registration) is identical to the previous page:
// only the skin changes. The chosen event type is saved in localStorage
// ('ceremly:onboarding-type') for the wizard pre-selection, NOT in the backend.
import * as z from 'zod'
import { EVENT_TYPES } from '~~/shared/constants/eventTypes'
import type { EventTypeKey } from '~~/shared/types/ceremly'

definePageMeta({
    layout: false,
    auth: { only: 'guest' }
})

const { t } = useI18n()

useSeoMeta({
    title: () => t('ceremly.signup.seoTitle'),
    description: () => t('ceremly.signup.seoDescription')
})

const ONBOARDING_TYPE_KEY = 'ceremly:onboarding-type'

const { signUp, signIn, fetchSession, errorCodes } = useAuth()
const toast = useToast()
const route = useRoute()
const loading = ref(false)

// Post-signup redirect ONLY if same-origin relative (single leading '/'):
// blocks open-redirect '//evil.com' and '/\evil.com' (WHATWG URL parsing
// normalizes a leading backslash to '/', making it protocol-relative too) /
// 'https://…'. Backstopped by Better Auth's originCheck server-side, kept
// here for consistency (F13).
function safeRedirect(): string {
    const raw = route.query.redirect
    const path = typeof raw === 'string' ? raw : ''
    return /^\/(?![/\\])/.test(path) ? path : '/dashboard'
}

const firstName = ref('')
const lastName = ref('')
const email = ref('')
const password = ref('')
const acceptTerms = ref(false)
const formError = ref<string | null>(null)

const selectedType = ref<EventTypeKey>('matrimonio')

onMounted(() => {
    const saved = localStorage.getItem(ONBOARDING_TYPE_KEY)
    if (saved && EVENT_TYPES.some(t => t.key === saved)) {
        selectedType.value = saved as EventTypeKey
    }
})

function selectType(key: EventTypeKey) {
    selectedType.value = key
    if (import.meta.client) {
        localStorage.setItem(ONBOARDING_TYPE_KEY, key)
    }
}

// 4-segment strength bar: length >= 12, 1 number, 1 symbol, 1 uppercase.
const strengthScore = computed(() => [
    password.value.length >= 12,
    /\d/.test(password.value),
    /[^A-Za-z0-9]/.test(password.value),
    /[A-Z]/.test(password.value)
].filter(Boolean).length)

const strengthHint = computed(() => {
    if (!password.value) return t('ceremly.signup.passwordHintBase')
    const labelKeys = ['weak', 'weak', 'fair', 'good', 'strong'] as const
    return t('ceremly.signup.passwordHintLevel', { level: t(`ceremly.signup.passwordStrength.${labelKeys[strengthScore.value]}`) })
})

const schema = computed(() => z.object({
    firstName: z.string().min(1, t('ceremly.signup.errorFirstName')),
    lastName: z.string().min(1, t('ceremly.signup.errorLastName')),
    email: z.string().email(t('ceremly.signup.errorEmail')),
    password: z.string().min(8, t('ceremly.signup.errorPassword'))
}))

async function signUpWithGoogle() {
    try {
        loading.value = true
        await signIn.social({
            provider: 'google',
            callbackURL: safeRedirect(),
            errorCallbackURL: '/login?error=account_not_linked'
        })
    } catch (error) {
        toast.add({ title: t('ceremly.signup.errorTitle'), description: error instanceof Error && error.message ? error.message : t('ceremly.signup.errorGoogle') })
    } finally {
        loading.value = false
    }
}

async function onSubmit() {
    formError.value = null

    const parsed = schema.value.safeParse({
        firstName: firstName.value.trim(),
        lastName: lastName.value.trim(),
        email: email.value,
        password: password.value
    })
    if (!parsed.success) {
        formError.value = parsed.error.issues[0]?.message ?? t('ceremly.signup.errorFields')
        return
    }
    if (!acceptTerms.value) {
        formError.value = t('ceremly.signup.errorTerms')
        return
    }

    if (import.meta.client) {
        localStorage.setItem(ONBOARDING_TYPE_KEY, selectedType.value)
    }

    loading.value = true

    try {
        const { error } = await signUp.email({
            email: parsed.data.email,
            password: parsed.data.password,
            name: `${parsed.data.firstName} ${parsed.data.lastName}`.trim(),
            callbackURL: safeRedirect()
        })

        if (error) {
            let message = error.message || t('ceremly.signup.errorSignup')
            if (error.code === errorCodes?.USER_ALREADY_EXISTS) {
                message = t('ceremly.signup.errorEmailExists')
            }
            toast.add({ title: t('ceremly.signup.errorTitle'), description: message })
            return
        }

        toast.add({ title: t('ceremly.signup.successTitle'), description: t('ceremly.signup.successDescription') })
        await fetchSession()
    } catch (error) {
        toast.add({ title: t('ceremly.signup.errorTitle'), description: error instanceof Error && error.message ? error.message : t('ceremly.signup.errorSignup') })
    } finally {
        loading.value = false
    }
}
</script>

<template>
    <CeremlyAuthShell
        :label="$t('ceremly.signup.shellLabel')"
        :body="$t('ceremly.signup.shellBody')"
        :quote="{
            text: $t('ceremly.signup.quoteText')
        }"
        :foot="$t('ceremly.signup.shellFoot')"
    >
        <template #title>
            {{ $t('ceremly.signup.titleLine1') }}<br>{{ $t('ceremly.signup.titleLine2') }}<br><span style="color: #fff; text-decoration: underline; text-decoration-color: var(--orange); text-decoration-thickness: 4px; text-underline-offset: 6px;">{{ $t('ceremly.signup.titleHighlight') }}</span><br>{{ $t('ceremly.signup.titleLine3') }}
        </template>

        <div class="serif" style="font-size: 42px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.05;">{{ $t('ceremly.signup.heading') }}</div>
        <p style="font-size: 14px; color: var(--ink-500); margin-top: 8px;">
            {{ $t('ceremly.signup.hasAccount') }} <NuxtLink to="/login" style="color: var(--purple); font-weight: 600; text-decoration: none;">{{ $t('common.signIn') }} →</NuxtLink>
        </p>

        <div style="margin-top: 28px;">
            <!-- Social: Google ONLY (Apple not configured) -->
            <div style="display: grid; grid-template-columns: 1fr; gap: 10px;">
                <button
                    type="button"
                    class="cer-btn ghost"
                    style="justify-content: center; padding: 11px 12px; font-size: 13px;"
                    :disabled="loading"
                    @click="signUpWithGoogle"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="#EA4335" d="M12 11v3.2h5.3c-.2 1.4-1.6 4-5.3 4-3.2 0-5.8-2.6-5.8-5.9s2.6-5.9 5.8-5.9c1.8 0 3 .8 3.7 1.5l2.5-2.4C16.7 4 14.5 3 12 3 6.9 3 2.8 7.1 2.8 12.2S6.9 21.4 12 21.4c6.9 0 9.5-4.8 9.5-7.3 0-.5-.1-.9-.1-1.3H12z" /></svg>
                    {{ $t('ceremly.signup.continueWithGoogle') }}
                </button>
            </div>

            <div class="row" style="gap: 12px; margin: 20px 0; align-items: center;">
                <div style="flex: 1; height: 1px; background: var(--bone-200);" />
                <span class="mono" style="font-size: 10px; color: var(--ink-400); letter-spacing: 0.08em;">{{ $t('ceremly.signup.orDivider') }}</span>
                <div style="flex: 1; height: 1px; background: var(--bone-200);" />
            </div>

            <form class="col" style="gap: 14px;" novalidate @submit.prevent="onSubmit">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <label class="col" style="gap: 6px;">
                        <span class="mono" style="font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-500);">{{ $t('ceremly.signup.labelFirstName') }}</span>
                        <input v-model="firstName" class="cer-input" type="text" autocomplete="given-name" :placeholder="$t('ceremly.signup.placeholderFirstName')">
                    </label>
                    <label class="col" style="gap: 6px;">
                        <span class="mono" style="font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-500);">{{ $t('ceremly.signup.labelLastName') }}</span>
                        <input v-model="lastName" class="cer-input" type="text" autocomplete="family-name" :placeholder="$t('ceremly.signup.placeholderLastName')">
                    </label>
                </div>
                <label class="col" style="gap: 6px;">
                    <span class="mono" style="font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-500);">{{ $t('ceremly.signup.labelEmail') }}</span>
                    <input v-model="email" class="cer-input" type="email" autocomplete="email" :placeholder="$t('ceremly.signup.placeholderEmail')">
                </label>
                <label class="col" style="gap: 6px;">
                    <span class="mono" style="font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-500);">{{ $t('ceremly.signup.labelPassword') }}</span>
                    <input v-model="password" class="cer-input" type="password" autocomplete="new-password" placeholder="••••••••••••">
                    <div class="row" style="gap: 4px; margin-top: 6px;">
                        <span
                            v-for="i in 4"
                            :key="i"
                            :style="{ flex: 1, height: '3px', background: i <= strengthScore ? 'var(--confirm)' : 'var(--bone-200)', borderRadius: '2px' }"
                        />
                    </div>
                    <span class="small muted" style="margin-top: 4px;">{{ strengthHint }}</span>
                </label>

                <div class="col" style="gap: 6px;">
                    <span class="mono" style="font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-500);">{{ $t('ceremly.signup.labelEventType') }}</span>
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;">
                        <button
                            v-for="eventType in EVENT_TYPES"
                            :key="eventType.key"
                            type="button"
                            :aria-pressed="selectedType === eventType.key"
                            :style="{
                                border: '2px solid var(--ink)',
                                background: selectedType === eventType.key ? 'var(--purple)' : 'var(--bone-50)',
                                color: selectedType === eventType.key ? 'var(--ink)' : 'var(--ink-700)',
                                borderRadius: '10px',
                                padding: '10px 6px',
                                textAlign: 'center',
                                cursor: 'pointer',
                                boxShadow: selectedType === eventType.key ? '3px 3px 0 var(--ink)' : 'none'
                            }"
                            @click="selectType(eventType.key)"
                        >
                            <CeremlyCerIcon :name="eventType.icon" :s="18" />
                            <div style="font-size: 11px; margin-top: 4px;">{{ $t('ceremly.eventType.' + eventType.key + '.label') }}</div>
                        </button>
                    </div>
                </div>

                <label class="row" style="gap: 8px; font-size: 12px; color: var(--ink-700); align-items: flex-start; margin-top: 6px; cursor: pointer;">
                    <input v-model="acceptTerms" type="checkbox" style="accent-color: var(--purple); margin-top: 2px;">
                    <span>{{ $t('ceremly.signup.termsPrefix') }} <NuxtLink to="/legal/tos" style="color: var(--purple); font-weight: 600; text-decoration: none;">{{ $t('ceremly.signup.termsLinkTos') }}</NuxtLink> {{ $t('ceremly.signup.termsAnd') }}<NuxtLink to="/legal/privacy" style="color: var(--purple); font-weight: 600; text-decoration: none;">{{ $t('ceremly.signup.termsLinkPrivacy') }}</NuxtLink>{{ $t('ceremly.signup.termsSuffix') }}</span>
                </label>

                <p v-if="formError" class="small" style="color: var(--decline); margin: 0;">{{ formError }}</p>

                <button
                    type="submit"
                    class="cer-btn wine"
                    style="width: 100%; justify-content: center; padding: 13px 16px; margin-top: 8px;"
                    :disabled="loading"
                >
                    <CeremlyCerIcon name="sparkle" :s="14" /> {{ loading ? $t('ceremly.signup.submitting') : $t('ceremly.signup.submitButton') }}
                </button>
            </form>
        </div>
    </CeremlyAuthShell>
</template>

<style scoped>
.cer-btn:disabled {
    opacity: 0.6;
    cursor: default;
}
</style>
