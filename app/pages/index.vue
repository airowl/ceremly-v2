<script setup lang="ts">
// Ceremly landing page — faithful port of docs/ui/project/screens/landing.jsx
// (design "Soft Meadow", .cer classes + inline styles 1:1 from the mockup).
// Site-mode (waitinglist/maintenance) is enforced by the global middleware
// 0.site-mode.global.ts (client) + server/middleware/0.site-mode.ts: here
// isActiveMode gates auth links + all /signup CTAs (nav, hero, pricing,
// CTA section); in waitinglist mode CTAs point to the waiting-list form
// (#waiting-list) which calls /api/waiting-list/subscribe.
import CerIcon from '~/components/ceremly/CerIcon.vue'
import CerSitePricing from '~/components/ceremly/CerSitePricing.vue'
import CerSiteFooter from '~/components/ceremly/CerSiteFooter.vue'

definePageMeta({
    auth: false,
    layout: false,
})

const { t } = useI18n()

const { isActiveMode } = useSiteMode()
const { loggedIn, signOut } = useAuth()
const runtimeConfig = useRuntimeConfig()
const baseUrl = ((runtimeConfig.public.baseURL as string) || '').replace(/\/$/, '')

// SEO
const seoTitle = t('ceremly.home.seo.title')
const seoDescription = t('ceremly.home.seo.description')

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

// Smooth scroll to anchors (nav is sticky: scroll-margin-top in CSS)
function scrollToId(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

// Nav logout: logged-in user stays on home (as guest)
async function logout() {
    await signOut({ redirectTo: '/' })
}

// ── Waiting list (waitinglist mode only) ──
// On-brand form (.cer) that calls /api/waiting-list/subscribe with the same
// anti-spam as the old WaitingListCTA: honeypot + timing + UTM/referrer.
const wlEmail = ref('')
const wlWebsite = ref('') // honeypot — hidden from users, bots fill it in
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
        wlError.value = t('ceremly.home.waitingList.errorInvalidEmail')
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
        wlError.value = err?.data?.message || t('ceremly.home.waitingList.errorGeneric')
    } finally {
        wlLoading.value = false
    }
}

// In waitinglist mode the "sign up" CTAs scroll to the form instead of /signup
function onSignupCta(e: Event) {
    if (!isActiveMode.value) {
        e.preventDefault()
        scrollToId('waiting-list')
    }
}

const navAnchors = [
    { id: 'how-it-works', label: t('ceremly.home.nav.howItWorks') },
    { id: 'features', label: t('ceremly.home.nav.features') },
    { id: 'pricing', label: t('ceremly.home.nav.pricing') },
    { id: 'examples', label: t('ceremly.home.nav.examples') },
]

// ── Section data (1:1 from the mockup) ──
interface Pain { k: string, t: string, d: string }
const pains: Pain[] = [
    { k: '01', t: t('ceremly.home.pains.whatsapp.title'), d: t('ceremly.home.pains.whatsapp.desc') },
    { k: '02', t: t('ceremly.home.pains.allergies.title'), d: t('ceremly.home.pains.allergies.desc') },
    { k: '03', t: t('ceremly.home.pains.plusOne.title'), d: t('ceremly.home.pains.plusOne.desc') },
    { k: '04', t: t('ceremly.home.pains.paperInvites.title'), d: t('ceremly.home.pains.paperInvites.desc') },
]

interface Step { k: string, t: string, d: string, icon: string, c: string }
const steps: Step[] = [
    { k: '01', t: t('ceremly.home.steps.create.title'), d: t('ceremly.home.steps.create.desc'), icon: 'edit', c: 'var(--purple)' },
    { k: '02', t: t('ceremly.home.steps.import.title'), d: t('ceremly.home.steps.import.desc'), icon: 'guests', c: 'var(--orange)' },
    { k: '03', t: t('ceremly.home.steps.distribute.title'), d: t('ceremly.home.steps.distribute.desc'), icon: 'send', c: 'var(--blue)' },
    { k: '04', t: t('ceremly.home.steps.rsvp.title'), d: t('ceremly.home.steps.rsvp.desc'), icon: 'chart', c: 'var(--confirm)' },
]

interface Feat { icon: string, t: string, d: string }
const feats: Feat[] = [
    { icon: 'mail', t: t('ceremly.home.feats.emailWhatsapp.title'), d: t('ceremly.home.feats.emailWhatsapp.desc') },
    { icon: 'bell', t: t('ceremly.home.feats.reminders.title'), d: t('ceremly.home.feats.reminders.desc') },
    { icon: 'qr', t: t('ceremly.home.feats.qr.title'), d: t('ceremly.home.feats.qr.desc') },
    { icon: 'heart', t: t('ceremly.home.feats.menu.title'), d: t('ceremly.home.feats.menu.desc') },
    { icon: 'guests', t: t('ceremly.home.feats.plusOne.title'), d: t('ceremly.home.feats.plusOne.desc') },
    { icon: 'chart', t: t('ceremly.home.feats.realtime.title'), d: t('ceremly.home.feats.realtime.desc') },
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
                <nav class="row l-nav-links" style="gap: 32px; font-size: 14px; color: var(--ink-700); font-weight: 500;" :aria-label="$t('ceremly.home.nav.ariaLabel')">
                    <a
                        v-for="a in navAnchors"
                        :key="a.id"
                        :href="`#${a.id}`"
                        class="l-anchor"
                        @click.prevent="scrollToId(a.id)"
                    >{{ a.label }}</a>
                </nav>
                <div class="row" style="gap: 10px;">
                    <template v-if="loggedIn">
                        <button type="button" class="cer-btn ghost small" @click="logout">{{ $t('common.logout') }}</button>
                        <NuxtLink to="/dashboard" class="cer-btn small">{{ $t('common.dashboard') }}</NuxtLink>
                    </template>
                    <template v-else-if="isActiveMode">
                        <NuxtLink to="/login" class="cer-btn ghost small">{{ $t('common.signIn') }}</NuxtLink>
                        <NuxtLink to="/signup" class="cer-btn small">{{ $t('common.signUp') }}</NuxtLink>
                    </template>
                </div>
            </div>
        </header>

        <!-- ───────────────────────────────  HERO  -->
        <section class="l-wrap l-hero l-hero-grid">
            <div>
                <span class="cer-tag" style="background: var(--wine-soft); color: var(--purple-ink); border-color: transparent; margin-bottom: 22px;">
                    <CerIcon name="sparkle" :s="12" /> {{ $t('ceremly.home.hero.badge') }}
                </span>
                <h1 class="serif l-h1" style="font-weight: 800; line-height: 0.95; letter-spacing: -0.045em; margin: 14px 0 0;">
                    {{ $t('ceremly.home.hero.titlePart1') }}<br>{{ $t('ceremly.home.hero.titlePart2') }}<br><span class="l-mark" style="background: var(--purple);">{{ $t('ceremly.home.hero.titleMark') }}</span>.
                </h1>
                <p style="max-width: 510px; margin-top: 28px; font-size: 18px; line-height: 1.55; color: var(--ink-700);">
                    {{ $t('ceremly.home.hero.subtitle') }}
                </p>
                <div v-if="isActiveMode" class="row" style="margin-top: 32px; gap: 12px; flex-wrap: wrap;">
                    <NuxtLink to="/signup" class="cer-btn" style="padding: 15px 24px; font-size: 14px;">
                        <CerIcon name="sparkle" :s="14" /> {{ $t('ceremly.home.hero.ctaPrimary') }}
                    </NuxtLink>
                </div>
                <!-- Waiting list mode: subscription form instead of the /signup CTA -->
                <div v-else id="waiting-list" class="l-target" style="margin-top: 32px;">
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
                            :placeholder="$t('ceremly.home.waitingList.emailPlaceholder')"
                            :aria-label="$t('ceremly.home.waitingList.emailAriaLabel')"
                            required
                            :disabled="wlLoading"
                            style="width: min(300px, 100%); padding: 13px 16px;"
                        >
                        <button type="submit" class="cer-btn" style="padding: 13px 22px; font-size: 14px;" :disabled="wlLoading">
                            <CerIcon name="sparkle" :s="14" /> {{ wlLoading ? $t('ceremly.home.waitingList.loading') : $t('ceremly.home.waitingList.submit') }}
                        </button>
                    </form>
                    <div v-else class="row" style="gap: 10px; flex-wrap: wrap;">
                        <span class="pill confirm"><span class="cer-dot" />{{ wlAlreadySubscribed ? $t('ceremly.home.waitingList.alreadySubscribed') : $t('ceremly.home.waitingList.subscribed') }}</span>
                        <span style="font-size: 14px; color: var(--ink-700);">{{ $t('ceremly.home.waitingList.successMessage') }}</span>
                    </div>
                    <div v-if="wlError" role="alert" style="margin-top: 8px; font-size: 13px; color: var(--decline);">{{ wlError }}</div>
                </div>
                <div class="row" style="margin-top: 26px; gap: 18px; font-size: 13px; color: var(--ink-500); flex-wrap: wrap;">
                    <span class="row" style="gap: 6px;"><CerIcon name="check" :s="14" /> {{ $t('ceremly.home.hero.trust1') }}</span>
                    <span class="row" style="gap: 6px;"><CerIcon name="check" :s="14" /> {{ $t('ceremly.home.hero.trust2') }}</span>
                    <span class="row" style="gap: 6px;"><CerIcon name="check" :s="14" /> {{ $t('ceremly.home.hero.trust3') }}</span>
                </div>
            </div>

            <!-- Hero visual -->
            <div class="l-hero-visual" aria-hidden="true">
                <!-- invite card — purple block -->
                <div style="position: absolute; left: 30px; top: 0; width: 360px; height: 510px; background: var(--purple); border-radius: 18px; border: 2px solid var(--ink); box-shadow: 10px 10px 0 var(--ink); color: var(--ink); padding: 40px 32px; transform: rotate(-3deg); display: flex; flex-direction: column; justify-content: space-between;">
                    <span class="mono" style="position: absolute; top: 14px; left: 20px; background: var(--bone-50); color: var(--ink); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; padding: 3px 9px; border-radius: 999px; border: 1.5px solid var(--ink);">{{ $t('ceremly.home.heroVisual.previewBadge') }}</span>
                    <div>
                        <div class="mono" style="font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--wine-deep);">
                            {{ $t('ceremly.home.heroVisual.inviteDate') }}
                        </div>
                        <div class="serif" style="font-size: 46px; font-weight: 800; line-height: 1.0; margin-top: 22px; letter-spacing: -0.03em;">
                            Giulia &amp;<br>Tommaso<br><span style="font-weight: 400; font-style: italic;">{{ $t('ceremly.home.heroVisual.inviteMarried') }}</span>
                        </div>
                        <div style="margin-top: 20px; font-size: 14px; opacity: 0.9; line-height: 1.5;">
                            Villa Erba, Cernobbio<br>{{ $t('ceremly.home.heroVisual.inviteDetails') }}
                        </div>
                    </div>
                    <div>
                        <div style="height: 2px; background: rgba(63,54,34,0.28); margin-bottom: 16px;" />
                        <div class="row" style="justify-content: space-between; align-items: flex-end;">
                            <div>
                                <div class="mono" style="font-size: 10px; letter-spacing: 0.12em; color: var(--wine-deep); text-transform: uppercase;">
                                    {{ $t('ceremly.home.heroVisual.replyBy') }}
                                </div>
                                <div style="font-size: 15px; margin-top: 4px; font-weight: 500;">{{ $t('ceremly.home.heroVisual.replyDate') }}</div>
                            </div>
                            <div style="background: var(--orange); color: var(--ink); padding: 11px 18px; border-radius: 999px; font-size: 13px; font-weight: 600; border: 2px solid var(--ink);">
                                {{ $t('ceremly.home.heroVisual.confirmBtn') }} →
                            </div>
                        </div>
                    </div>
                </div>

                <!-- stat card -->
                <div style="position: absolute; right: 0; top: 56px; width: 282px; padding: 20px; background: var(--bone-50); border-radius: 16px; border: 2px solid var(--ink); box-shadow: 6px 6px 0 var(--ink); transform: rotate(2deg);">
                    <div class="row" style="justify-content: space-between;">
                        <span class="mono" style="font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-500);">RSVP live</span>
                        <span class="pill confirm"><span class="cer-dot" />{{ $t('ceremly.home.heroVisual.statToday') }}</span>
                    </div>
                    <div class="serif" style="font-size: 60px; font-weight: 800; line-height: 1; margin-top: 12px; letter-spacing: -0.03em;">87<span style="color: var(--ink-300); font-size: 30px;">/142</span></div>
                    <div class="small muted" style="margin-top: 4px;">{{ $t('ceremly.home.heroVisual.statDesc') }}</div>
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
                            <span class="small muted">{{ $t('ceremly.home.heroVisual.guestConfirmedPlusOne') }}</span>
                        </div>
                    </div>
                    <div class="row" style="margin-top: 10px; gap: 6px;">
                        <span class="cer-tag" style="font-size: 10px; padding: 2px 7px;">{{ $t('ceremly.home.heroVisual.tagVegetarian') }}</span>
                        <span class="cer-tag" style="font-size: 10px; padding: 2px 7px;">{{ $t('ceremly.home.heroVisual.tagBus') }}</span>
                    </div>
                </div>
            </div>
        </section>

        <!-- ───────────────────────────────  PROBLEM  -->
        <section style="background: var(--bone-100); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line);">
            <div class="l-wrap l-problem reveal reveal-up">
                <span class="cer-tag" style="background: var(--orange-soft); color: var(--orange-deep); border-color: transparent; margin-bottom: 24px;">{{ $t('ceremly.home.problem.tag') }}</span>
                <div class="l-problem-grid">
                    <h2 class="serif l-h2" style="font-weight: 800; line-height: 1.0; margin: 0; letter-spacing: -0.035em;">
                        {{ $t('ceremly.home.problem.titlePart1') }}<br>{{ $t('ceremly.home.problem.titlePart2') }}<br><span style="color: var(--purple);">{{ $t('ceremly.home.problem.titleMark') }}</span><br>{{ $t('ceremly.home.problem.titlePart3') }}
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
        <section id="how-it-works" class="l-target">
            <div class="l-wrap l-how reveal reveal-up">
                <span class="cer-tag" style="background: var(--wine-soft); color: var(--purple-ink); border-color: transparent;">{{ $t('ceremly.home.nav.howItWorks') }}</span>
                <h2 class="serif l-h2" style="font-weight: 800; line-height: 1.0; margin: 16px 0 0; letter-spacing: -0.035em; max-width: 820px;">
                    {{ $t('ceremly.home.howItWorks.titlePart1') }}<br>{{ $t('ceremly.home.howItWorks.titlePart2') }} <span style="color: var(--purple);">{{ $t('ceremly.home.howItWorks.titleMark') }}</span>.
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
        <section id="features" class="l-target" style="background: var(--ink); color: var(--bone-50);">
            <div class="l-wrap l-features reveal reveal-up">
                <div class="l-feat-grid">
                    <div>
                        <span class="cer-tag" style="background: rgba(255,255,255,0.08); color: var(--bone-200); border-color: rgba(255,255,255,0.18);">{{ $t('ceremly.home.nav.features') }}</span>
                        <h2 class="serif l-h2" style="font-weight: 800; line-height: 1.0; margin: 16px 0 0; letter-spacing: -0.035em;">
                            {{ $t('ceremly.home.features.titlePart1') }}<br>{{ $t('ceremly.home.features.titlePart2') }}<br><span style="color: var(--blue);">{{ $t('ceremly.home.features.titleMark') }}</span>
                        </h2>
                        <p style="font-size: 16px; color: var(--bone-200); line-height: 1.6; margin-top: 20px; max-width: 360px;">
                            {{ $t('ceremly.home.features.subtitle') }}
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
        <section id="pricing" class="l-target">
            <div class="l-wrap l-pricing reveal reveal-up">
                <CerSitePricing />
            </div>
        </section>

        <!-- ───────────────────────────────  TESTIMONIAL  -->
        <section id="examples" class="l-target" style="background: var(--bone-100); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line);">
            <div class="l-wrap l-quote reveal reveal-up">
                <div style="max-width: 980px; margin: 0 auto; text-align: center;">
                    <span class="cer-tag" style="background: var(--blue-soft); color: var(--blue-deep); border-color: transparent; display: inline-flex;">{{ $t('ceremly.home.testimonial.tag') }}</span>
                    <blockquote class="serif l-blockquote" style="font-weight: 700; line-height: 1.2; margin: 24px 0 0; letter-spacing: -0.03em; color: var(--ink);">
                        {{ $t('ceremly.home.testimonial.quotePart1') }} <span style="color: var(--purple);">{{ $t('ceremly.home.testimonial.quoteMark') }}</span>.
                        {{ $t('ceremly.home.testimonial.quotePart2') }}
                    </blockquote>
                </div>
            </div>
        </section>

        <!-- ───────────────────────────────  CTA  -->
        <section style="background: var(--ink); color: #fff; text-align: center; position: relative; overflow: hidden;">
            <div class="l-wrap l-cta reveal reveal-up">
                <h2 class="serif l-h2-cta" style="font-weight: 800; line-height: 0.98; letter-spacing: -0.04em; margin: 0 auto; max-width: 900px;">
                    {{ $t('ceremly.home.cta.titlePart1') }}<br><span class="l-mark" style="background: var(--orange);">{{ $t('ceremly.home.cta.titleMark') }}</span>.
                </h2>
                <p style="font-size: 18px; color: rgba(255,255,255,0.88); max-width: 520px; margin: 26px auto 0; line-height: 1.55;">
                    {{ $t('ceremly.home.cta.subtitle') }}
                </p>
                <div class="row" style="justify-content: center; gap: 12px; margin-top: 36px; flex-wrap: wrap;">
                    <NuxtLink v-if="isActiveMode" to="/signup" class="cer-btn" style="background: var(--bone-50); color: var(--ink); border-color: var(--ink); padding: 15px 26px; font-size: 14px;">
                        <CerIcon name="sparkle" :s="14" /> {{ $t('ceremly.home.cta.ctaPrimary') }}
                    </NuxtLink>
                    <a v-else href="#waiting-list" class="cer-btn" style="background: var(--bone-50); color: var(--ink); border-color: var(--ink); padding: 15px 26px; font-size: 14px;" @click="onSignupCta">
                        <CerIcon name="sparkle" :s="14" /> {{ $t('ceremly.home.waitingList.submit') }}
                    </a>
                    <NuxtLink to="/contact" class="cer-btn" style="background: var(--purple); color: var(--ink); border-color: var(--ink); padding: 15px 26px; font-size: 14px;">
                        <CerIcon name="mail" :s="14" /> {{ $t('ceremly.home.cta.ctaTeam') }}
                    </NuxtLink>
                </div>
            </div>
        </section>

        <!-- ───────────────────────────────  FOOTER  -->
        <CerSiteFooter />
    </div>
</template>

<style scoped>
/* The mockup is a fixed 1400px artboard: here the canvas is full-width with
   max-width 1400 centered content and fluid horizontal padding. */
.cer-landing {
    --pad-x: clamp(20px, 5vw, 72px);
    min-height: 100vh;
    background: var(--bone);
}

.l-wrap {
    max-width: 1400px;
    margin: 0 auto;
}

/* Links without underline, colors inherited from the design system */
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

/* Anchors: compensate for the sticky nav */
.l-target {
    scroll-margin-top: 84px;
}

/* Waiting list honeypot: invisible to users, visible to bots */
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

/* Mark — highlighter behind text (Mark helper from the mockup) */
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

/* ── Sections: vertical padding from the mockup, horizontal fluid ── */
.l-hero { padding: 88px var(--pad-x) 100px; }
.l-problem { padding: 96px var(--pad-x); }
.l-how { padding: 96px var(--pad-x); }
.l-features { padding: 96px var(--pad-x); }
.l-pricing { padding: 96px var(--pad-x); }
.l-quote { padding: 88px var(--pad-x); }
.l-cta { padding: 116px var(--pad-x); }
.l-footer { padding: 64px var(--pad-x) 40px; }

/* ── Grids (desktop values 1:1 from the mockup) ── */
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

/* ── Typography (desktop = px from the mockup) ── */
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
