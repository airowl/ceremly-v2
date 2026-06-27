<script setup lang="ts">
// Sito pubblico → Risorse → API per partner. Port di APIPartnerPage (site-resources.jsx).
import CerIcon from '~/components/ceremly/CerIcon.vue'
import CerMark from '~/components/ceremly/CerMark.vue'
import CerSiteH2 from '~/components/ceremly/CerSiteH2.vue'
import CerSiteCTA from '~/components/ceremly/CerSiteCTA.vue'

definePageMeta({ layout: 'public-site', auth: false })

const { t, tm, rt, locale } = useI18n()
const localePath = useLocalePath()
const runtimeConfig = useRuntimeConfig()
const baseUrl = ((runtimeConfig.public.baseURL as string) || '').replace(/\/$/, '')

const seoTitle = t('ceremly.site.api.seoTitle')
const seoDescription = t('ceremly.site.api.seoDescription')
useSeoMeta({
    title: seoTitle,
    description: seoDescription,
    ogTitle: seoTitle,
    ogDescription: seoDescription,
    ogImage: () => `${baseUrl}/og/api-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
    twitterImage: () => `${baseUrl}/og/api-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
    ogType: 'website',
})

const bullets = computed(() => (tm('ceremly.site.api.bullets') as string[]).map(x => rt(x)))

// Metodi/path letterali; solo la descrizione viene dall'i18n (zip per indice).
const endpointMeta = [
    { m: 'GET', p: '/v1/events' },
    { m: 'GET', p: '/v1/events/:id/rsvps' },
    { m: 'POST', p: '/v1/guests' },
    { m: 'POST', p: '/v1/webhooks' },
    { m: 'GET', p: '/v1/exports/catering' },
]
const mColor: Record<string, [string, string]> = {
    GET: ['var(--bone-200)', 'var(--blue-deep)'],
    POST: ['var(--wine-soft)', 'var(--purple-ink)'],
}
interface Endpoint { d: string }
const endpoints = computed(() => (tm('ceremly.site.api.endpoints') as Endpoint[]).map((x, i) => {
    const m = endpointMeta[i]?.m || 'GET'
    const [bg, fg] = mColor[m] || mColor.GET!
    return { m, p: endpointMeta[i]?.p || '', d: rt(x.d), bg, fg }
}))

// Blocco codice letterale (sample request/response), come da spec.
const codeSample = `GET /v1/events/evt_8h2k/rsvps

{
  "data": [{
    "guest":     "Marta Rinaldi",
    "status":    "confirmed",
    "plus_ones": 1,
    "children":  0,
    "diet":      "vegetariana",
    "note":      "bus ore 16:30"
  }],
  "confirmed": 87,
  "pending":   46,
  "total":     142
}`
</script>

<template>
    <div>
        <!-- Hero custom 2 colonne -->
        <section style="border-bottom: 1px solid var(--line);">
            <div class="cer-site-wrap cer-api-hero">
                <div>
                    <span class="cer-tag" style="background: var(--wine-soft); color: var(--purple-ink); border-color: transparent;">{{ t('ceremly.site.api.heroTag') }}</span>
                    <h1 class="serif cer-api-hero-h1">
                        {{ t('ceremly.site.api.heroTitlePart1') }}<br>{{ t('ceremly.site.api.heroTitlePart2') }} <CerMark c="var(--purple)">{{ t('ceremly.site.api.heroTitleMark') }}</CerMark>.
                    </h1>
                    <p style="font-size: 16px; color: var(--ink-700); line-height: 1.6; max-width: 460px; margin: 20px 0 0;">{{ t('ceremly.site.api.heroSub') }}</p>
                    <div class="col" style="gap: 10px; margin-top: 24px;">
                        <span v-for="b in bullets" :key="b" class="row" style="gap: 9px; font-size: 14px; color: var(--ink-700);">
                            <span style="color: var(--purple);"><CerIcon name="check" :s="15" /></span> {{ b }}
                        </span>
                    </div>
                    <div class="row" style="gap: 12px; margin-top: 28px;">
                        <NuxtLink :to="localePath('/contact')" class="cer-btn">
                            <CerIcon name="mail" :s="14" /> {{ t('ceremly.site.api.heroBtnPrimary') }}
                        </NuxtLink>
                        <NuxtLink :to="localePath('/contact')" class="cer-btn ghost">{{ t('ceremly.site.api.heroBtnSecondary') }}</NuxtLink>
                    </div>
                </div>
                <div style="background: var(--ink); border-radius: 16px; border: 2px solid var(--ink); box-shadow: 8px 8px 0 var(--purple); padding: 26px; color: var(--bone-200);">
                    <div class="row" style="justify-content: space-between; margin-bottom: 16px;">
                        <span class="mono" style="font-size: 11px; letter-spacing: 0.06em; color: var(--ink-400);">REQUEST</span>
                        <span class="cer-tag" style="background: rgba(255,255,255,0.08); color: var(--bone-200); border-color: rgba(255,255,255,0.15); font-size: 10px;">sandbox</span>
                    </div>
                    <pre class="mono cer-api-pre">{{ codeSample }}</pre>
                </div>
            </div>
        </section>

        <!-- Endpoints -->
        <div class="cer-site-wrap" style="padding: 64px 0 80px;">
            <CerSiteH2 :tag="t('ceremly.site.api.endpointsTag')" :title="t('ceremly.site.api.endpointsTitle')" :sub="t('ceremly.site.api.endpointsSub')" />
            <div class="cer-card" style="overflow: hidden;">
                <div v-for="(e, i) in endpoints" :key="e.p" class="row cer-api-ep" :style="{ padding: '16px 24px', gap: '18px', borderBottom: i < endpoints.length - 1 ? '1px solid var(--line)' : 'none' }">
                    <span class="mono" :style="{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '6px', background: e.bg, color: e.fg, width: '52px', textAlign: 'center', flexShrink: 0 }">{{ e.m }}</span>
                    <span class="mono cer-api-ep-path">{{ e.p }}</span>
                    <span style="font-size: 14px; color: var(--ink-700);">{{ e.d }}</span>
                </div>
            </div>
            <div class="row" style="gap: 10px; margin-top: 16px; font-size: 13px; color: var(--ink-500);">
                <CerIcon name="settings" :s="15" /> {{ t('ceremly.site.api.endpointsNote') }}
            </div>
        </div>

        <CerSiteCTA :sub="t('ceremly.site.api.ctaSub')" :secondary="t('ceremly.site.api.ctaSecondary')" :secondary-to="localePath('/pricing')">
            <template #title>
                {{ t('ceremly.site.api.ctaTitlePart1') }} <CerMark c="var(--orange)">{{ t('ceremly.site.api.ctaTitleMark') }}</CerMark>?
            </template>
        </CerSiteCTA>
    </div>
</template>

<style scoped>
.cer-api-hero {
    padding: 72px 0 80px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 64px;
    align-items: center;
}

.cer-api-hero-h1 {
    font-size: 58px;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.04em;
    margin: 18px 0 0;
}

.cer-api-pre {
    font-size: 13px;
    line-height: 1.7;
    margin: 0;
    white-space: pre-wrap;
}

.cer-api-ep-path {
    font-size: 13px;
    font-weight: 700;
    width: 280px;
    flex-shrink: 0;
}

.cer-api-hero :deep(a.cer-btn) {
    text-decoration: none;
}

@media (max-width: 1023px) {
    .cer-api-hero {
        grid-template-columns: 1fr;
        gap: 40px;
    }

    .cer-api-hero-h1 {
        font-size: clamp(38px, 9vw, 58px);
    }

    .cer-api-ep {
        flex-wrap: wrap;
    }

    .cer-api-ep-path {
        width: auto;
    }
}
</style>
