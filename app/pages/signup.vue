<script setup lang="ts">
// Signup Ceremly — port di RegisterScreen (docs/ui/project/screens/auth.jsx).
// La logica Better Auth (signUp email/password + Google, error handling,
// fetchSession post-registrazione) è identica alla pagina precedente:
// cambia solo la pelle. Il tipo di evento scelto è salvato in localStorage
// ('ceremly:onboarding-type') per la pre-selezione del wizard, NON nel backend.
import * as z from 'zod'
import { EVENT_TYPES } from '~~/shared/constants/eventTypes'
import type { EventTypeKey } from '~~/shared/types/ceremly'

definePageMeta({
    layout: false,
    auth: { only: 'guest' }
})

useSeoMeta({
    title: 'Crea il tuo account — Ceremly',
    description: 'Crea il tuo account Ceremly: inviti digitali e RSVP per matrimoni, lauree, battesimi e compleanni. Fino a 30 ospiti gratis.'
})

const ONBOARDING_TYPE_KEY = 'ceremly:onboarding-type'

const { signUp, signIn, fetchSession, errorCodes } = useAuth()
const toast = useToast()
const route = useRoute()
const loading = ref(false)

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

// Strength bar 4 segmenti: lunghezza >= 12, 1 numero, 1 simbolo, 1 maiuscola.
const strengthScore = computed(() => [
    password.value.length >= 12,
    /\d/.test(password.value),
    /[^A-Za-z0-9]/.test(password.value),
    /[A-Z]/.test(password.value)
].filter(Boolean).length)

const strengthHint = computed(() => {
    if (!password.value) return 'Almeno 12 caratteri, 1 numero, 1 simbolo, 1 maiuscola.'
    const labels = ['Debole', 'Debole', 'Discreta', 'Buona', 'Robusta'] as const
    return `${labels[strengthScore.value]} — 12 caratteri, 1 numero, 1 simbolo, 1 maiuscola.`
})

const schema = z.object({
    firstName: z.string().min(1, 'Inserisci il tuo nome'),
    lastName: z.string().min(1, 'Inserisci il tuo cognome'),
    email: z.string().email('Inserisci un indirizzo email valido'),
    password: z.string().min(8, 'La password deve contenere almeno 8 caratteri')
})

async function signUpWithGoogle() {
    try {
        loading.value = true
        await signIn.social({
            provider: 'google',
            callbackURL: (route.query.redirect as string) || '/dashboard'
        })
    } catch (error) {
        toast.add({ title: 'Errore di registrazione', description: error instanceof Error && error.message ? error.message : 'Registrazione con Google non riuscita.' })
    } finally {
        loading.value = false
    }
}

async function onSubmit() {
    formError.value = null

    const parsed = schema.safeParse({
        firstName: firstName.value.trim(),
        lastName: lastName.value.trim(),
        email: email.value,
        password: password.value
    })
    if (!parsed.success) {
        formError.value = parsed.error.issues[0]?.message ?? 'Controlla i campi inseriti.'
        return
    }
    if (!acceptTerms.value) {
        formError.value = 'Devi accettare i Termini e l\'informativa privacy per continuare.'
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
            callbackURL: (route.query.redirect as string) || '/dashboard'
        })

        if (error) {
            let message = error.message || 'Registrazione non riuscita. Riprova.'
            if (error.code === errorCodes?.USER_ALREADY_EXISTS) {
                message = 'Esiste già un account con questa email.'
            }
            toast.add({ title: 'Errore di registrazione', description: message })
            return
        }

        toast.add({ title: 'Account creato!', description: 'Controlla la tua email per verificare l\'account.' })
        await fetchSession()
    } catch (error) {
        toast.add({ title: 'Errore di registrazione', description: error instanceof Error && error.message ? error.message : 'Registrazione non riuscita. Riprova.' })
    } finally {
        loading.value = false
    }
}
</script>

<template>
    <CeremlyAuthShell
        label="Registrati"
        body="Crea il tuo primo evento in cinque minuti. Niente carta richiesta — paghi solo se decidi di crescere."
        :quote="{
            text: '“Cinque minuti per creare l\'invito. Cinque giorni per ricevere tutte le risposte.”',
            av: 'AM', who: 'Andrea M.', where: 'Laurea magistrale · Bologna'
        }"
        foot="Fino a 30 ospiti gratis"
    >
        <template #title>
            Inizia<br>a invitare.<br><span style="color: #fff; text-decoration: underline; text-decoration-color: var(--orange); text-decoration-thickness: 4px; text-underline-offset: 6px;">Trenta ospiti</span><br>gratis, sempre.
        </template>

        <div class="serif" style="font-size: 42px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.05;">Crea il tuo account</div>
        <p style="font-size: 14px; color: var(--ink-500); margin-top: 8px;">
            Hai già un account? <NuxtLink to="/login" style="color: var(--purple); font-weight: 600; text-decoration: none;">Accedi →</NuxtLink>
        </p>

        <div style="margin-top: 28px;">
            <!-- Social: SOLO Google (Apple non configurato) -->
            <div style="display: grid; grid-template-columns: 1fr; gap: 10px;">
                <button
                    type="button"
                    class="cer-btn ghost"
                    style="justify-content: center; padding: 11px 12px; font-size: 13px;"
                    :disabled="loading"
                    @click="signUpWithGoogle"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="#EA4335" d="M12 11v3.2h5.3c-.2 1.4-1.6 4-5.3 4-3.2 0-5.8-2.6-5.8-5.9s2.6-5.9 5.8-5.9c1.8 0 3 .8 3.7 1.5l2.5-2.4C16.7 4 14.5 3 12 3 6.9 3 2.8 7.1 2.8 12.2S6.9 21.4 12 21.4c6.9 0 9.5-4.8 9.5-7.3 0-.5-.1-.9-.1-1.3H12z" /></svg>
                    Continua con Google
                </button>
            </div>

            <div class="row" style="gap: 12px; margin: 20px 0; align-items: center;">
                <div style="flex: 1; height: 1px; background: var(--bone-200);" />
                <span class="mono" style="font-size: 10px; color: var(--ink-400); letter-spacing: 0.08em;">OPPURE</span>
                <div style="flex: 1; height: 1px; background: var(--bone-200);" />
            </div>

            <form class="col" style="gap: 14px;" novalidate @submit.prevent="onSubmit">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <label class="col" style="gap: 6px;">
                        <span class="mono" style="font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-500);">Nome</span>
                        <input v-model="firstName" class="cer-input" type="text" autocomplete="given-name" placeholder="Giulia">
                    </label>
                    <label class="col" style="gap: 6px;">
                        <span class="mono" style="font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-500);">Cognome</span>
                        <input v-model="lastName" class="cer-input" type="text" autocomplete="family-name" placeholder="Tommasi">
                    </label>
                </div>
                <label class="col" style="gap: 6px;">
                    <span class="mono" style="font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-500);">Email</span>
                    <input v-model="email" class="cer-input" type="email" autocomplete="email" placeholder="nome@esempio.com">
                </label>
                <label class="col" style="gap: 6px;">
                    <span class="mono" style="font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-500);">Password</span>
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
                    <span class="mono" style="font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-500);">Tipo di evento principale</span>
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
                            <div style="font-size: 11px; margin-top: 4px;">{{ eventType.label }}</div>
                        </button>
                    </div>
                </div>

                <label class="row" style="gap: 8px; font-size: 12px; color: var(--ink-700); align-items: flex-start; margin-top: 6px; cursor: pointer;">
                    <input v-model="acceptTerms" type="checkbox" style="accent-color: var(--purple); margin-top: 2px;">
                    <span>Accetto i <NuxtLink to="/legal/tos" style="color: var(--purple); font-weight: 600; text-decoration: none;">Termini</NuxtLink> e l'<NuxtLink to="/legal/privacy" style="color: var(--purple); font-weight: 600; text-decoration: none;">informativa privacy</NuxtLink>. Riceverò consigli sull'organizzazione (non più di uno al mese).</span>
                </label>

                <p v-if="formError" class="small" style="color: var(--decline); margin: 0;">{{ formError }}</p>

                <button
                    type="submit"
                    class="cer-btn wine"
                    style="width: 100%; justify-content: center; padding: 13px 16px; margin-top: 8px;"
                    :disabled="loading"
                >
                    <CeremlyCerIcon name="sparkle" :s="14" /> {{ loading ? 'Creazione in corso…' : 'Crea account · gratis' }}
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
