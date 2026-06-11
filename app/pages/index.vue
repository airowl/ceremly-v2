<script setup lang="ts">
// Landing page Ceremly — port fedele di docs/ui/project/screens/landing.jsx
// (design "Soft Meadow", classi .cer + inline style 1:1 dal mockup).
// Site-mode (waitinglist/maintenance) è enforced dal middleware globale
// 0.site-mode.global.ts (client) + server/middleware/0.site-mode.ts: qui
// isActiveMode gata link auth + tutti i CTA /signup (nav, hero, pricing,
// sezione CTA); in waitinglist mode i CTA puntano al form lista d'attesa
// (#lista-attesa) che chiama /api/waiting-list/subscribe.
import CerIcon from '~/components/ceremly/CerIcon.vue'

definePageMeta({
    auth: false,
    layout: false,
})

const NuxtLink = resolveComponent('NuxtLink')

const { isActiveMode } = useSiteMode()
const runtimeConfig = useRuntimeConfig()
const baseUrl = ((runtimeConfig.public.baseURL as string) || '').replace(/\/$/, '')

// SEO
const seoTitle = 'Ceremly — Inviti digitali e RSVP intelligenti'
const seoDescription = 'Smetti di rincorrere conferme su WhatsApp: un link, un invito digitale e una dashboard che ti dice chi viene davvero — per matrimoni, lauree, battesimi e compleanni.'

useSeoMeta({
    titleTemplate: '',
    title: seoTitle,
    description: seoDescription,
    ogTitle: seoTitle,
    ogDescription: seoDescription,
    ogImage: `${baseUrl}/ogImage-it.png`,
    ogType: 'website',
})

useSchemaOrg([
    {
        '@type': 'SoftwareApplication',
        'name': (runtimeConfig.public.appName as string) || 'Ceremly',
        'applicationCategory': 'BusinessApplication',
        'operatingSystem': 'Web',
        'description': seoDescription,
        'url': baseUrl,
        'offers': {
            '@type': 'AggregateOffer',
            'priceCurrency': 'EUR',
            'lowPrice': '0',
            'offerCount': '3',
        },
    },
])

useScrollReveal()

// Smooth scroll alle ancore (la nav è sticky: scroll-margin-top in CSS)
function scrollToId(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

// ── Waiting list (solo waitinglist mode) ──
// Form on-brand (.cer) che chiama /api/waiting-list/subscribe con gli stessi
// anti-spam del vecchio WaitingListCTA: honeypot + timing + UTM/referrer.
const wlEmail = ref('')
const wlWebsite = ref('') // honeypot — nascosto agli utenti, i bot lo riempiono
const wlLoading = ref(false)
const wlSubmitted = ref(false)
const wlAlreadySubscribed = ref(false)
const wlError = ref('')
const wlLoadedAt = ref(0)

onMounted(() => {
    wlLoadedAt.value = Date.now()
})

async function submitWaitingList() {
    if (wlLoading.value || wlSubmitted.value) return
    wlError.value = ''

    const email = wlEmail.value.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        wlError.value = 'Inserisci un indirizzo email valido.'
        return
    }

    wlLoading.value = true
    try {
        const params = new URLSearchParams(window.location.search)
        const data = await $fetch('/api/waiting-list/subscribe', {
            method: 'POST',
            body: {
                email,
                language: 'it',
                website: wlWebsite.value,
                _t: wlLoadedAt.value,
                source: document.referrer || undefined,
                utmSource: params.get('utm_source') || undefined,
                utmMedium: params.get('utm_medium') || undefined,
                utmCampaign: params.get('utm_campaign') || undefined,
            },
        })
        wlAlreadySubscribed.value = Boolean(data?.alreadySubscribed)
        wlSubmitted.value = true
        wlEmail.value = ''
    } catch (error) {
        const err = error as { data?: { message?: string } }
        wlError.value = err?.data?.message || 'Qualcosa è andato storto. Riprova tra poco.'
    } finally {
        wlLoading.value = false
    }
}

// In waitinglist mode i CTA "iscriviti" scrollano al form invece di /signup
function onSignupCta(e: Event) {
    if (!isActiveMode.value) {
        e.preventDefault()
        scrollToId('lista-attesa')
    }
}

const navAnchors = [
    { id: 'come-funziona', label: 'Come funziona' },
    { id: 'funzionalita', label: 'Funzionalità' },
    { id: 'prezzi', label: 'Prezzi' },
    { id: 'esempi', label: 'Esempi' },
]

// ── Dati sezioni (1:1 dal mockup) ──
interface Pain { k: string, t: string, d: string }
const pains: Pain[] = [
    { k: '01', t: 'Gruppi WhatsApp infiniti', d: 'Una conferma sì, un forse, tre messaggi vocali. La lista finale resta un mistero fino a tre giorni prima.' },
    { k: '02', t: 'Allergie a voce', d: 'Lo zio è celiaco, la cugina vegetariana — e nessuno se lo ricorda quando arriva il catering.' },
    { k: '03', t: 'Plus-one fantasma', d: '"Posso portare il mio fidanzato?" — chiesto cinque volte, dimenticato due. Il conteggio non torna mai.' },
    { k: '04', t: 'Inviti cartacei dispersi', d: 'Belli sì, ma costosi, lenti e impossibili da modificare se cambia data o location.' },
]

interface Step { k: string, t: string, d: string, icon: string, c: string }
const steps: Step[] = [
    { k: '01', t: 'Crea l\'invito', d: 'Scegli un modello — matrimonio, laurea, battesimo, compleanno — e personalizza colori, foto e testi. Pronto in 5 minuti.', icon: 'edit', c: 'var(--purple)' },
    { k: '02', t: 'Importa la lista', d: 'Incolla da Excel, da rubrica o digita. Raggruppa per famiglia, lato sposi o tavolo. Riconosciamo i duplicati.', icon: 'guests', c: 'var(--orange)' },
    { k: '03', t: 'Distribuisci', d: 'Un link per tutti, oppure WhatsApp ed email personalizzati con nome dell\'ospite. QR per inviti cartacei.', icon: 'send', c: 'var(--blue)' },
    { k: '04', t: 'Ricevi RSVP', d: 'Conferme, menu, plus-one e note arrivano in dashboard. Promemoria automatici a chi tarda.', icon: 'chart', c: 'var(--confirm)' },
]

interface Feat { icon: string, t: string, d: string }
const feats: Feat[] = [
    { icon: 'mail', t: 'Email & WhatsApp personalizzati', d: 'Ogni ospite riceve il suo invito con nome e link unico — niente moduli generici.' },
    { icon: 'bell', t: 'Promemoria automatici', d: 'Solleciti gentili a chi non ha ancora risposto, con la cadenza che decidi tu.' },
    { icon: 'qr', t: 'QR per inviti cartacei', d: 'Mantieni la carta se ti piace — il QR porta lo stesso al form di conferma digitale.' },
    { icon: 'heart', t: 'Menu, allergie, intolleranze', d: 'Raccogli preferenze alimentari nel form RSVP, esporta tutto per il catering.' },
    { icon: 'guests', t: 'Plus-one e nuclei familiari', d: 'Gestisci accompagnatori, bambini e gruppi famiglia in un colpo solo.' },
    { icon: 'chart', t: 'Andamento in tempo reale', d: 'Dashboard con tasso apertura, conferme per fascia, previsione costi catering.' },
]

interface Tier {
    n: string
    p: string
    sub: string
    desc: string
    feats: string[]
    cta: string
    kind?: 'ghost'
    highlight?: boolean
    tag?: string
}
const tiers: Tier[] = [
    {
        n: 'Free',
        p: '0',
        sub: 'per sempre',
        desc: 'Per piccoli eventi e prove. Tutto il necessario per iniziare.',
        feats: ['Fino a 30 ospiti', '1 evento attivo', '3 modelli di invito', 'RSVP via link', 'Dashboard base'],
        cta: 'Inizia gratis',
        kind: 'ghost',
    },
    {
        n: 'Celebrazione',
        p: '39',
        sub: 'una tantum · per evento',
        desc: 'Per matrimoni, lauree e battesimi. L\'opzione consigliata per la maggior parte degli eventi.',
        feats: ['Fino a 250 ospiti', 'Tutti i modelli + brand colors', 'WhatsApp & email personalizzati', 'Menu, allergie, plus-one', 'Promemoria automatici', 'Esporta lista per catering'],
        cta: 'Scegli Celebrazione',
        highlight: true,
        tag: 'Più scelto',
    },
    {
        n: 'Atelier',
        p: '24',
        sub: '/mese · per planner',
        desc: 'Per chi organizza eventi di lavoro. Eventi illimitati e brand su misura.',
        feats: ['Eventi e ospiti illimitati', 'Workspace con il tuo logo', 'Domini personalizzati', 'API & integrazioni catering', 'Account team', 'Supporto prioritario'],
        cta: 'Parla con noi',
        kind: 'ghost',
    },
]

interface FooterItem { label: string, to?: string, anchor?: string }
interface FooterCol { t: string, items: FooterItem[] }
const footerCols: FooterCol[] = [
    {
        t: 'Prodotto',
        items: [
            { label: 'Come funziona', anchor: 'come-funziona' },
            { label: 'Funzionalità', anchor: 'funzionalita' },
            { label: 'Modelli di invito' },
            { label: 'Prezzi', anchor: 'prezzi' },
            { label: 'Esempi reali', anchor: 'esempi' },
        ],
    },
    {
        t: 'Per chi',
        items: [
            { label: 'Matrimoni' },
            { label: 'Lauree' },
            { label: 'Battesimi' },
            { label: 'Compleanni' },
            { label: 'Wedding planner' },
        ],
    },
    {
        t: 'Risorse',
        items: [
            { label: 'Guida RSVP', to: '/blogs' },
            { label: 'Centro aiuto' },
            { label: 'Stato servizio' },
            { label: 'Changelog' },
            { label: 'API per partner' },
        ],
    },
    {
        t: 'Ceremly',
        items: [
            { label: 'Chi siamo' },
            { label: 'Contatti', to: '/contactUs' },
            { label: 'Termini', to: '/legal/tos' },
            { label: 'Privacy & GDPR', to: '/legal/privacy' },
            { label: 'Cookie' },
        ],
    },
]
</script>

<template>
    <div class="cer cer-landing">
        <!-- ───────────────────────────────  NAV  -->
        <header class="l-nav">
            <div class="l-nav-inner">
                <div class="row" style="gap: 7px;">
                    <span class="serif" style="font-size: 28px; font-weight: 800; letter-spacing: -0.03em;">Ceremly</span>
                    <span style="width: 7px; height: 7px; border-radius: 50%; background: var(--orange); display: inline-block;" />
                </div>
                <nav class="row l-nav-links" style="gap: 32px; font-size: 14px; color: var(--ink-700); font-weight: 500;" aria-label="Navigazione principale">
                    <a
                        v-for="a in navAnchors"
                        :key="a.id"
                        :href="`#${a.id}`"
                        class="l-anchor"
                        @click.prevent="scrollToId(a.id)"
                    >{{ a.label }}</a>
                </nav>
                <div class="row" style="gap: 10px;">
                    <template v-if="isActiveMode">
                        <NuxtLink to="/login" class="cer-btn ghost small">Accedi</NuxtLink>
                        <NuxtLink to="/signup" class="cer-btn small">Registrati</NuxtLink>
                    </template>
                </div>
            </div>
        </header>

        <!-- ───────────────────────────────  HERO  -->
        <section class="l-wrap l-hero l-hero-grid">
            <div>
                <span class="cer-tag" style="background: var(--wine-soft); color: var(--purple-ink); border-color: transparent; margin-bottom: 22px;">
                    <CerIcon name="sparkle" :s="12" /> v0.1 · aperto agli organizzatori italiani
                </span>
                <h1 class="serif l-h1" style="font-weight: 800; line-height: 0.95; letter-spacing: -0.045em; margin: 14px 0 0;">
                    Gli inviti<br>che contano<br><span class="l-mark" style="background: var(--purple);">davvero</span>.
                </h1>
                <p style="max-width: 510px; margin-top: 28px; font-size: 18px; line-height: 1.55; color: var(--ink-700);">
                    Smetti di rincorrere conferme su WhatsApp. Un link, un invito digitale,
                    una dashboard che ti dice chi viene davvero — per matrimoni, lauree,
                    battesimi e compleanni.
                </p>
                <div v-if="isActiveMode" class="row" style="margin-top: 32px; gap: 12px; flex-wrap: wrap;">
                    <NuxtLink to="/signup" class="cer-btn" style="padding: 15px 24px; font-size: 14px;">
                        <CerIcon name="sparkle" :s="14" /> Crea il tuo primo invito — gratis
                    </NuxtLink>
                    <a href="#esempi" class="cer-btn ghost" style="padding: 15px 24px; font-size: 14px;" @click.prevent="scrollToId('esempi')">
                        <CerIcon name="eye" :s="14" /> Invito d'esempio
                    </a>
                </div>
                <!-- Waiting list mode: form di iscrizione al posto del CTA /signup -->
                <div v-else id="lista-attesa" class="l-target" style="margin-top: 32px;">
                    <form v-if="!wlSubmitted" class="row" style="gap: 12px; flex-wrap: wrap;" @submit.prevent="submitWaitingList">
                        <div class="l-wl-hp" aria-hidden="true">
                            <label for="wl-website">Website</label>
                            <input
                                id="wl-website"
                                v-model="wlWebsite"
                                type="text"
                                name="website"
                                autocomplete="off"
                                tabindex="-1"
                            >
                        </div>
                        <input
                            v-model="wlEmail"
                            type="email"
                            name="email"
                            class="cer-input"
                            placeholder="La tua email"
                            aria-label="Email per la lista d'attesa"
                            required
                            :disabled="wlLoading"
                            style="width: min(300px, 100%); padding: 13px 16px;"
                        >
                        <button type="submit" class="cer-btn" style="padding: 13px 22px; font-size: 14px;" :disabled="wlLoading">
                            <CerIcon name="sparkle" :s="14" /> {{ wlLoading ? 'Un attimo…' : 'Entra in lista d\'attesa' }}
                        </button>
                    </form>
                    <div v-else class="row" style="gap: 10px; flex-wrap: wrap;">
                        <span class="pill confirm"><span class="cer-dot" />{{ wlAlreadySubscribed ? 'Sei già in lista' : 'Sei in lista!' }}</span>
                        <span style="font-size: 14px; color: var(--ink-700);">Ti scriviamo appena apriamo.</span>
                    </div>
                    <div v-if="wlError" role="alert" style="margin-top: 8px; font-size: 13px; color: var(--decline);">{{ wlError }}</div>
                    <div class="row" style="margin-top: 14px;">
                        <a href="#esempi" class="cer-btn ghost" style="padding: 15px 24px; font-size: 14px;" @click.prevent="scrollToId('esempi')">
                            <CerIcon name="eye" :s="14" /> Invito d'esempio
                        </a>
                    </div>
                </div>
                <div class="row" style="margin-top: 26px; gap: 18px; font-size: 13px; color: var(--ink-500); flex-wrap: wrap;">
                    <span class="row" style="gap: 6px;"><CerIcon name="check" :s="14" /> Nessuna carta richiesta</span>
                    <span class="row" style="gap: 6px;"><CerIcon name="check" :s="14" /> 30 ospiti gratis</span>
                    <span class="row" style="gap: 6px;"><CerIcon name="check" :s="14" /> Ospiti senza account</span>
                </div>
            </div>

            <!-- Hero visual -->
            <div class="l-hero-visual" aria-hidden="true">
                <!-- invito card — blocco viola -->
                <div style="position: absolute; left: 30px; top: 0; width: 360px; height: 510px; background: var(--purple); border-radius: 18px; border: 2px solid var(--ink); box-shadow: 10px 10px 0 var(--ink); color: var(--ink); padding: 40px 32px; transform: rotate(-3deg); display: flex; flex-direction: column; justify-content: space-between;">
                    <div>
                        <div class="mono" style="font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--wine-deep);">
                            12 · settembre · 2026
                        </div>
                        <div class="serif" style="font-size: 46px; font-weight: 800; line-height: 1.0; margin-top: 22px; letter-spacing: -0.03em;">
                            Giulia &amp;<br>Tommaso<br><span style="font-weight: 400; font-style: italic;">si sposano</span>
                        </div>
                        <div style="margin-top: 20px; font-size: 14px; opacity: 0.9; line-height: 1.5;">
                            Villa Erba, Cernobbio<br>ore 16 — cerimonia all'aperto
                        </div>
                    </div>
                    <div>
                        <div style="height: 2px; background: rgba(63,54,34,0.28); margin-bottom: 16px;" />
                        <div class="row" style="justify-content: space-between; align-items: flex-end;">
                            <div>
                                <div class="mono" style="font-size: 10px; letter-spacing: 0.12em; color: var(--wine-deep); text-transform: uppercase;">
                                    Rispondi entro il
                                </div>
                                <div style="font-size: 15px; margin-top: 4px; font-weight: 500;">1 luglio</div>
                            </div>
                            <div style="background: var(--orange); color: var(--ink); padding: 11px 18px; border-radius: 999px; font-size: 13px; font-weight: 600; border: 2px solid var(--ink);">
                                Conferma →
                            </div>
                        </div>
                    </div>
                </div>

                <!-- stat card -->
                <div style="position: absolute; right: 0; top: 56px; width: 282px; padding: 20px; background: var(--bone-50); border-radius: 16px; border: 2px solid var(--ink); box-shadow: 6px 6px 0 var(--ink); transform: rotate(2deg);">
                    <div class="row" style="justify-content: space-between;">
                        <span class="mono" style="font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-500);">RSVP live</span>
                        <span class="pill confirm"><span class="cer-dot" />+12 oggi</span>
                    </div>
                    <div class="serif" style="font-size: 60px; font-weight: 800; line-height: 1; margin-top: 12px; letter-spacing: -0.03em;">87<span style="color: var(--ink-300); font-size: 30px;">/142</span></div>
                    <div class="small muted" style="margin-top: 4px;">conferme · 89% inviti aperti</div>
                    <div style="margin-top: 14px; height: 8px; background: var(--bone-100); border-radius: 999px; overflow: hidden; border: 1px solid var(--line);">
                        <div style="height: 100%; width: 61%; background: var(--purple);" />
                    </div>
                </div>

                <!-- mini card mobile -->
                <div style="position: absolute; right: 24px; bottom: 24px; width: 236px; padding: 16px; background: var(--bone-50); border-radius: 16px; border: 2px solid var(--ink); box-shadow: 6px 6px 0 var(--blue); transform: rotate(-2deg);">
                    <div class="row" style="gap: 10px;">
                        <div class="av sage lg">MR</div>
                        <div class="col" style="gap: 2px;">
                            <span style="font-size: 14px; font-weight: 600;">Marta R.</span>
                            <span class="small muted">ha confermato +1</span>
                        </div>
                    </div>
                    <div class="row" style="margin-top: 10px; gap: 6px;">
                        <span class="cer-tag" style="font-size: 10px; padding: 2px 7px;">vegetariana</span>
                        <span class="cer-tag" style="font-size: 10px; padding: 2px 7px;">bus 16:30</span>
                    </div>
                </div>
            </div>
        </section>

        <!-- ───────────────────────────────  PROBLEM  -->
        <section style="background: var(--bone-100); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line);">
            <div class="l-wrap l-problem reveal reveal-up">
                <span class="cer-tag" style="background: var(--orange-soft); color: var(--orange-deep); border-color: transparent; margin-bottom: 24px;">Il problema</span>
                <div class="l-problem-grid">
                    <h2 class="serif l-h2" style="font-weight: 800; line-height: 1.0; margin: 0; letter-spacing: -0.035em;">
                        Organizzare<br>un evento è bello.<br><span style="color: var(--purple);">Contare gli ospiti</span><br>molto meno.
                    </h2>
                    <div class="l-pain-grid">
                        <div v-for="p in pains" :key="p.k" class="cer-card" style="padding: 22px;">
                            <div class="mono" style="font-size: 13px; font-weight: 700; color: var(--orange);">{{ p.k }}</div>
                            <div class="serif" style="font-size: 23px; font-weight: 700; margin-top: 10px; letter-spacing: -0.02em;">{{ p.t }}</div>
                            <div style="font-size: 14px; margin-top: 8px; color: var(--ink-700); line-height: 1.55;">{{ p.d }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- ───────────────────────────────  HOW IT WORKS  -->
        <section id="come-funziona" class="l-target">
            <div class="l-wrap l-how reveal reveal-up">
                <span class="cer-tag" style="background: var(--wine-soft); color: var(--purple-ink); border-color: transparent;">Come funziona</span>
                <h2 class="serif l-h2" style="font-weight: 800; line-height: 1.0; margin: 16px 0 0; letter-spacing: -0.035em; max-width: 820px;">
                    Quattro passaggi, dalla bozza<br>alla <span style="color: var(--purple);">lista finale</span>.
                </h2>

                <div class="l-how-grid">
                    <div v-for="s in steps" :key="s.k" class="cer-card" style="padding: 24px;">
                        <div class="row" style="justify-content: space-between; align-items: flex-start;">
                            <div class="mono" style="font-size: 13px; font-weight: 700; color: var(--ink-300);">{{ s.k }}</div>
                            <div :style="{ width: '44px', height: '44px', borderRadius: '10px', background: s.c, color: 'var(--ink)', border: '2px solid var(--ink)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }">
                                <CerIcon :name="s.icon" :s="20" />
                            </div>
                        </div>
                        <div class="serif" style="font-size: 25px; font-weight: 800; margin-top: 24px; letter-spacing: -0.02em; line-height: 1.1;">{{ s.t }}</div>
                        <div style="font-size: 14px; margin-top: 10px; color: var(--ink-700); line-height: 1.55;">{{ s.d }}</div>
                    </div>
                </div>
            </div>
        </section>

        <!-- ───────────────────────────────  FEATURES  -->
        <section id="funzionalita" class="l-target" style="background: var(--ink); color: var(--bone-50);">
            <div class="l-wrap l-features reveal reveal-up">
                <div class="l-feat-grid">
                    <div>
                        <span class="cer-tag" style="background: rgba(255,255,255,0.08); color: var(--bone-200); border-color: rgba(255,255,255,0.18);">Funzionalità</span>
                        <h2 class="serif l-h2" style="font-weight: 800; line-height: 1.0; margin: 16px 0 0; letter-spacing: -0.035em;">
                            Tutto quello<br>che serve.<br><span style="color: var(--blue);">Niente di più.</span>
                        </h2>
                        <p style="font-size: 16px; color: var(--bone-200); line-height: 1.6; margin-top: 20px; max-width: 360px;">
                            Ceremly non vuole sostituire il wedding planner né il fotografo. Risolve un solo problema — sapere chi viene — e lo risolve bene.
                        </p>
                    </div>
                    <div class="l-feat-cards">
                        <div v-for="f in feats" :key="f.t" style="padding: 24px; border-radius: 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12);">
                            <div style="color: var(--orange);"><CerIcon :name="f.icon" :s="24" /></div>
                            <div class="serif" style="font-size: 21px; font-weight: 700; margin-top: 14px; letter-spacing: -0.02em;">{{ f.t }}</div>
                            <div style="font-size: 14px; margin-top: 8px; color: var(--bone-200); line-height: 1.55;">{{ f.d }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- ───────────────────────────────  PRICING  -->
        <section id="prezzi" class="l-target">
            <div class="l-wrap l-pricing reveal reveal-up">
                <div style="text-align: center; margin-bottom: 52px;">
                    <span class="cer-tag" style="background: var(--wine-soft); color: var(--purple-ink); border-color: transparent; display: inline-flex;">Prezzi</span>
                    <h2 class="serif l-h2" style="font-weight: 800; line-height: 1.0; margin: 16px 0 12px; letter-spacing: -0.035em;">
                        <span style="color: var(--purple);">Trasparenti</span>, senza<br>percentuali sugli ospiti.
                    </h2>
                    <p style="font-size: 16px; color: var(--ink-700); max-width: 540px; margin: 0 auto; line-height: 1.6;">
                        Paghi una volta per evento, oppure un abbonamento se organizzi per lavoro. Mai per RSVP, mai per ospite.
                    </p>
                </div>

                <div class="l-price-grid">
                    <div
                        v-for="tier in tiers"
                        :key="tier.n"
                        class="l-tier"
                        :style="{
                            background: tier.highlight ? 'var(--ink)' : 'var(--bone-50)',
                            color: tier.highlight ? '#fff' : 'var(--ink)',
                            boxShadow: tier.highlight ? '8px 8px 0 var(--ink)' : 'none',
                            marginTop: tier.highlight ? '-8px' : '8px',
                        }"
                    >
                        <div v-if="tier.tag" style="position: absolute; top: -14px; left: 28px; background: var(--orange); color: var(--ink); font-size: 12px; padding: 4px 12px; border-radius: 999px; font-family: var(--font-mono); font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; border: 2px solid var(--ink);">{{ tier.tag }}</div>
                        <div class="serif" style="font-size: 28px; font-weight: 800; letter-spacing: -0.02em;">{{ tier.n }}</div>
                        <div style="margin-top: 14px; display: flex; align-items: baseline; gap: 6px;">
                            <span class="serif" style="font-size: 66px; font-weight: 800; line-height: 1; letter-spacing: -0.03em;">€{{ tier.p }}</span>
                            <span :style="{ fontSize: '13px', color: tier.highlight ? 'var(--blue-soft)' : 'var(--ink-500)' }">{{ tier.sub }}</span>
                        </div>
                        <div :style="{ fontSize: '13px', marginTop: '12px', lineHeight: 1.55, color: tier.highlight ? 'rgba(255,255,255,0.85)' : 'var(--ink-700)', minHeight: '58px' }">
                            {{ tier.desc }}
                        </div>
                        <div :style="{ height: '1px', background: tier.highlight ? 'rgba(255,255,255,0.25)' : 'var(--line)', margin: '20px 0' }" />
                        <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 11px;">
                            <li
                                v-for="f in tier.feats"
                                :key="f"
                                class="row"
                                :style="{ gap: '10px', fontSize: '14px', color: tier.highlight ? 'rgba(255,255,255,0.92)' : 'var(--ink-700)' }"
                            >
                                <span :style="{ color: tier.highlight ? 'var(--blue)' : 'var(--purple)' }"><CerIcon name="check" :s="15" /></span> {{ f }}
                            </li>
                        </ul>
                        <component
                            :is="isActiveMode ? NuxtLink : 'a'"
                            v-bind="isActiveMode ? { to: tier.kind === 'ghost' && tier.n === 'Atelier' ? '/contactUs' : '/signup' } : { href: '#lista-attesa' }"
                            class="cer-btn"
                            :class="{ ghost: tier.kind === 'ghost' }"
                            :style="{
                                width: '100%',
                                justifyContent: 'center',
                                marginTop: '28px',
                                padding: '13px 16px',
                                background: tier.highlight ? 'var(--orange)' : undefined,
                                color: tier.highlight ? 'var(--ink)' : undefined,
                                borderColor: 'var(--ink)',
                            }"
                            @click="onSignupCta"
                        >
                            {{ isActiveMode ? tier.cta : 'Entra in lista d\'attesa' }} <CerIcon name="chevR" :s="13" />
                        </component>
                    </div>
                </div>

                <div class="row" style="justify-content: center; gap: 20px; margin-top: 36px; font-size: 13px; color: var(--ink-500); flex-wrap: wrap;">
                    <span class="row" style="gap: 6px;"><CerIcon name="check" :s="14" /> Fatturazione elettronica</span>
                    <span class="row" style="gap: 6px;"><CerIcon name="check" :s="14" /> Server in UE · GDPR</span>
                    <span class="row" style="gap: 6px;"><CerIcon name="check" :s="14" /> Cancella quando vuoi</span>
                </div>
            </div>
        </section>

        <!-- ───────────────────────────────  TESTIMONIAL  -->
        <section id="esempi" class="l-target" style="background: var(--bone-100); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line);">
            <div class="l-wrap l-quote reveal reveal-up">
                <div style="max-width: 980px; margin: 0 auto; text-align: center;">
                    <span class="cer-tag" style="background: var(--blue-soft); color: var(--blue-deep); border-color: transparent; display: inline-flex;">Beta · 142 eventi gestiti</span>
                    <blockquote class="serif l-blockquote" style="font-weight: 700; line-height: 1.2; margin: 24px 0 28px; letter-spacing: -0.03em; color: var(--ink);">
                        “Ho organizzato il matrimonio di mia sorella senza <span style="color: var(--purple);">un solo gruppo WhatsApp</span>.
                        La lista è arrivata al catering tre giorni prima — completa, con le allergie.”
                    </blockquote>
                    <div class="row" style="justify-content: center; gap: 12px;">
                        <div class="av lg" aria-hidden="true">FB</div>
                        <div class="col" style="align-items: flex-start;">
                            <span style="font-size: 14px; font-weight: 600;">Francesca B.</span>
                            <span class="small muted">Matrimonio · 168 ospiti · Verona</span>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- ───────────────────────────────  CTA  -->
        <section style="background: var(--ink); color: #fff; text-align: center; position: relative; overflow: hidden;">
            <div class="l-wrap l-cta reveal reveal-up">
                <h2 class="serif l-h2-cta" style="font-weight: 800; line-height: 0.98; letter-spacing: -0.04em; margin: 0 auto; max-width: 900px;">
                    Il tuo prossimo evento<br><span class="l-mark" style="background: var(--orange);">merita una lista vera</span>.
                </h2>
                <p style="font-size: 18px; color: rgba(255,255,255,0.88); max-width: 520px; margin: 26px auto 0; line-height: 1.55;">
                    Crea il tuo primo invito in cinque minuti. Trenta ospiti gratis, per sempre.
                </p>
                <div class="row" style="justify-content: center; gap: 12px; margin-top: 36px; flex-wrap: wrap;">
                    <NuxtLink v-if="isActiveMode" to="/signup" class="cer-btn" style="background: var(--bone-50); color: var(--ink); border-color: var(--ink); padding: 15px 26px; font-size: 14px;">
                        <CerIcon name="sparkle" :s="14" /> Inizia gratis
                    </NuxtLink>
                    <a v-else href="#lista-attesa" class="cer-btn" style="background: var(--bone-50); color: var(--ink); border-color: var(--ink); padding: 15px 26px; font-size: 14px;" @click="onSignupCta">
                        <CerIcon name="sparkle" :s="14" /> Entra in lista d'attesa
                    </a>
                    <NuxtLink to="/contactUs" class="cer-btn" style="background: var(--purple); color: var(--ink); border-color: var(--ink); padding: 15px 26px; font-size: 14px;">
                        <CerIcon name="mail" :s="14" /> Parla con il team
                    </NuxtLink>
                </div>
            </div>
        </section>

        <!-- ───────────────────────────────  FOOTER  -->
        <footer style="background: var(--bone);">
            <div class="l-wrap l-footer">
                <div class="l-footer-grid">
                    <div>
                        <div class="row" style="gap: 7px;">
                            <span class="serif" style="font-size: 32px; font-weight: 800; letter-spacing: -0.03em;">Ceremly</span>
                            <span style="width: 7px; height: 7px; border-radius: 50%; background: var(--orange); display: inline-block;" />
                        </div>
                        <p style="font-size: 14px; color: var(--ink-500); line-height: 1.6; margin-top: 12px; max-width: 280px;">
                            Inviti digitali e RSVP intelligenti, per eventi che contano davvero. Fatto in Italia.
                        </p>
                        <div class="mono" style="font-size: 12px; color: var(--ink-400); margin-top: 18px;">
                            © 2026 Ceremly Srl · P.IVA 12345670156
                        </div>
                    </div>
                    <div v-for="c in footerCols" :key="c.t" class="col" style="gap: 10px;">
                        <div class="mono" style="font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-400);">{{ c.t }}</div>
                        <template v-for="it in c.items" :key="it.label">
                            <NuxtLink v-if="it.to" :to="it.to" class="l-footer-link">{{ it.label }}</NuxtLink>
                            <a v-else-if="it.anchor" :href="`#${it.anchor}`" class="l-footer-link" @click.prevent="scrollToId(it.anchor)">{{ it.label }}</a>
                            <span v-else style="font-size: 14px; color: var(--ink-700);">{{ it.label }}</span>
                        </template>
                    </div>
                </div>
                <div style="height: 1px; background: var(--line); margin: 40px 0 16px;" />
                <div class="row l-footer-bottom" style="justify-content: space-between; font-size: 13px; color: var(--ink-500);">
                    <span>Server in UE · GDPR compliant · pagamenti sicuri via Creem</span>
                    <span class="row" style="gap: 16px;">
                        <span style="font-weight: 600;">IT</span>
                        <span style="color: var(--ink-300);">EN — soon</span>
                    </span>
                </div>
            </div>
        </footer>
    </div>
</template>

<style scoped>
/* Il mockup è un artboard 1400px fisso: qui il canvas è full-width con
   contenuto max-width 1400 centrato e padding orizzontale fluido. */
.cer-landing {
    --pad-x: clamp(20px, 5vw, 72px);
    min-height: 100vh;
    background: var(--bone);
}

.l-wrap {
    max-width: 1400px;
    margin: 0 auto;
}

/* Link senza sottolineatura, colori ereditati dal design system */
.l-anchor,
.cer-landing a.cer-btn,
.l-footer-link {
    text-decoration: none;
}

.l-anchor {
    color: inherit;
    cursor: pointer;
}

.l-footer-link {
    font-size: 14px;
    color: var(--ink-700);
}

.l-footer-link:hover {
    color: var(--ink);
}

/* Ancore: compensa la nav sticky */
.l-target {
    scroll-margin-top: 84px;
}

/* Honeypot waiting list: invisibile agli utenti, visibile ai bot */
.l-wl-hp {
    position: absolute;
    left: -9999px;
    top: -9999px;
    width: 0;
    height: 0;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
}

/* Mark — evidenziatore dietro al testo (helper Mark del mockup) */
.l-mark {
    color: var(--ink);
    padding: 0 8px;
    border-radius: 6px;
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
}

/* ── NAV ── */
.l-nav {
    border-bottom: 1px solid var(--line);
    background: var(--bone);
    position: sticky;
    top: 0;
    z-index: 5;
}

.l-nav-inner {
    max-width: 1400px;
    margin: 0 auto;
    padding: 20px var(--pad-x);
    display: flex;
    align-items: center;
    justify-content: space-between;
}

/* ── Sezioni: padding verticali dal mockup, orizzontali fluidi ── */
.l-hero { padding: 88px var(--pad-x) 100px; }
.l-problem { padding: 96px var(--pad-x); }
.l-how { padding: 96px var(--pad-x); }
.l-features { padding: 96px var(--pad-x); }
.l-pricing { padding: 96px var(--pad-x); }
.l-quote { padding: 88px var(--pad-x); }
.l-cta { padding: 116px var(--pad-x); }
.l-footer { padding: 64px var(--pad-x) 40px; }

/* ── Griglie (valori desktop 1:1 dal mockup) ── */
.l-hero-grid {
    display: grid;
    grid-template-columns: 1.05fr 0.95fr;
    gap: 56px;
    align-items: center;
}

.l-hero-visual {
    position: relative;
    height: 560px;
}

.l-problem-grid {
    display: grid;
    grid-template-columns: 0.9fr 1.1fr;
    gap: 72px;
    align-items: start;
    margin-top: 12px;
}

.l-pain-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
}

.l-how-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 18px;
    margin-top: 56px;
}

.l-feat-grid {
    display: grid;
    grid-template-columns: 0.8fr 1.2fr;
    gap: 72px;
    align-items: start;
}

.l-feat-cards {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
}

.l-price-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 18px;
    align-items: start;
}

.l-tier {
    border: 2px solid var(--ink);
    border-radius: 16px;
    padding: 32px;
    position: relative;
}

.l-footer-grid {
    display: grid;
    grid-template-columns: 1.4fr repeat(4, 1fr);
    gap: 48px;
}

/* ── Typography (desktop = px del mockup) ── */
.l-h1 { font-size: 92px; }
.l-h2 { font-size: 56px; }
.l-h2-cta { font-size: 76px; }
.l-blockquote { font-size: 42px; }

/* ── Responsive ── */
@media (max-width: 1023px) {
    .l-hero-grid,
    .l-problem-grid,
    .l-feat-grid,
    .l-price-grid {
        grid-template-columns: 1fr;
    }

    .l-hero-grid { gap: 32px; }
    .l-problem-grid,
    .l-feat-grid { gap: 40px; }

    .l-hero-visual { display: none; }

    .l-how-grid { grid-template-columns: repeat(2, 1fr); }

    .l-h1 { font-size: clamp(44px, 8vw, 92px); }
    .l-h2 { font-size: clamp(34px, 5.5vw, 56px); }
    .l-h2-cta { font-size: clamp(38px, 7vw, 76px); }
    .l-blockquote { font-size: clamp(26px, 4.5vw, 42px); }

    .l-nav-links { display: none; }

    .l-hero { padding-top: 56px; padding-bottom: 64px; }

    .l-footer-grid {
        grid-template-columns: 1fr 1fr;
        gap: 32px;
    }
}

@media (max-width: 640px) {
    .l-pain-grid,
    .l-how-grid,
    .l-feat-cards,
    .l-footer-grid {
        grid-template-columns: 1fr;
    }

    .l-footer-bottom {
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
    }
}
</style>
