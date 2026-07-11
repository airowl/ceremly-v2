<script setup lang="ts">
// Public site → Product → Pricing. Port of PrezziPage (site-product.jsx).
// No hero: starts with pricing (CerSitePricing) → comparison table → FAQ → CTA.
import CerIcon from '~/components/ceremly/CerIcon.vue'
import CerMark from '~/components/ceremly/CerMark.vue'
import CerSiteH2 from '~/components/ceremly/CerSiteH2.vue'
import CerSiteCTA from '~/components/ceremly/CerSiteCTA.vue'
import CerSitePricing from '~/components/ceremly/CerSitePricing.vue'
import CerFaqGrid from '~/components/ceremly/CerFaqGrid.vue'

definePageMeta({ layout: 'public-site', auth: false })

const { t, tm, rt, locale } = useI18n()
const localePath = useLocalePath()
const runtimeConfig = useRuntimeConfig()
const baseUrl = ((runtimeConfig.public.baseURL as string) || '').replace(/\/$/, '')

const seoTitle = t('ceremly.site.prezzi.seoTitle')
const seoDescription = t('ceremly.site.prezzi.seoDescription')
useSeoMeta({
    titleTemplate: '',
    title: seoTitle,
    description: seoDescription,
    ogTitle: seoTitle,
    ogDescription: seoDescription,
    ogImage: () => `${baseUrl}/og/pricing-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
    twitterImage: () => `${baseUrl}/og/pricing-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
    ogType: 'website',
})

// Comparison table rows: each cell is "yes" / "no" / free text.
interface Row { l: string, free: string, celeb: string, atelier: string }
const rows = computed(() => (tm('ceremly.site.prezzi.rows') as Row[]).map(x => ({
    l: rt(x.l),
    free: rt(x.free),
    celeb: rt(x.celeb),
    atelier: rt(x.atelier),
})))

const cols = computed(() => [
    t('ceremly.site.prezzi.colFeature'),
    t('ceremly.site.prezzi.colFree'),
    t('ceremly.site.prezzi.colCeleb'),
    t('ceremly.site.prezzi.colAtelier'),
])

interface Faq { q: string, a: string }
const faq = computed(() => (tm('ceremly.site.prezzi.faq') as Faq[]).map(x => ({ q: rt(x.q), a: rt(x.a) })))
</script>

<template>
    <div>
        <div class="cer-site-wrap" style="padding: 72px 0;">
            <CerSitePricing title-tag="h1" />
        </div>

        <!-- comparison table -->
        <div class="cer-site-wrap" style="padding-top: 24px; padding-bottom: 72px;">
            <CerSiteH2 :tag="t('ceremly.site.prezzi.tableTag')" :title="t('ceremly.site.prezzi.tableTitle')" />
            <div class="cer-card cer-pz-table-wrap">
                <table class="cer-table">
                    <thead>
                        <tr>
                            <th style="width: 40%;">{{ cols[0] }}</th>
                            <th>{{ cols[1] }}</th>
                            <th>{{ cols[2] }}</th>
                            <th>{{ cols[3] }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="r in rows" :key="r.l">
                            <td style="font-weight: 500;">{{ r.l }}</td>
                            <td>
                                <span v-if="r.free === 'yes'" style="color: var(--confirm);"><CerIcon name="check" :s="16" /></span>
                                <span v-else-if="r.free === 'no'" style="color: var(--ink-300);">—</span>
                                <span v-else style="font-weight: 600;">{{ r.free }}</span>
                            </td>
                            <td>
                                <span v-if="r.celeb === 'yes'" style="color: var(--confirm);"><CerIcon name="check" :s="16" /></span>
                                <span v-else-if="r.celeb === 'no'" style="color: var(--ink-300);">—</span>
                                <span v-else style="font-weight: 600;">{{ r.celeb }}</span>
                            </td>
                            <td>
                                <span v-if="r.atelier === 'yes'" style="color: var(--confirm);"><CerIcon name="check" :s="16" /></span>
                                <span v-else-if="r.atelier === 'no'" style="color: var(--ink-300);">—</span>
                                <span v-else style="font-weight: 600;">{{ r.atelier }}</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- FAQ -->
        <div class="cer-site-wrap" style="padding-bottom: 80px;">
            <CerSiteH2 :tag="t('ceremly.site.prezzi.faqTag')" :title="t('ceremly.site.prezzi.faqTitle')" />
            <CerFaqGrid :items="faq" />
        </div>

        <CerSiteCTA :secondary="t('ceremly.site.prezzi.ctaSecondary')" :secondary-to="localePath('/contact')">
            <template #title>
                {{ t('ceremly.site.prezzi.ctaTitlePart1') }}<br><CerMark c="var(--orange)">{{ t('ceremly.site.prezzi.ctaTitleMark') }}</CerMark>.
            </template>
        </CerSiteCTA>
    </div>
</template>

<style scoped>
.cer-pz-table-wrap {
    overflow: hidden;
}

@media (max-width: 720px) {
    .cer-pz-table-wrap {
        overflow-x: auto;
    }

    .cer-pz-table-wrap .cer-table {
        min-width: 640px;
    }
}
</style>
