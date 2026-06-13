<script setup lang="ts">
// Sito pubblico → Prodotto → Esempi reali. Port di EsempiPage (site-product.jsx).
import CerMark from '~/components/ceremly/CerMark.vue'
import CerSiteHero from '~/components/ceremly/CerSiteHero.vue'
import CerSiteCTA from '~/components/ceremly/CerSiteCTA.vue'

definePageMeta({ layout: 'public-site', auth: false })

const { t, tm, rt } = useI18n()
const localePath = useLocalePath()
const runtimeConfig = useRuntimeConfig()
const baseUrl = ((runtimeConfig.public.baseURL as string) || '').replace(/\/$/, '')

const seoTitle = t('ceremly.site.esempi.seoTitle')
const seoDescription = t('ceremly.site.esempi.seoDescription')
useSeoMeta({
    title: seoTitle,
    description: seoDescription,
    ogTitle: seoTitle,
    ogDescription: seoDescription,
    ogImage: `${baseUrl}/ogImage-it.png`,
    ogType: 'website',
})

// Sfondo e numeri grezzi delle statistiche per indice — restano nel .vue.
const caseVisuals = [
    { bg: 'var(--bone-300)', stats: ['168', '91%', '0'] },
    { bg: 'var(--purple)', stats: ['52', '47', '1'] },
    { bg: 'var(--bone-200)', stats: ['84', '12', '5gg'] },
]

interface Case { occ: string, t: string, meta: string, statLabels: string[], quote: string, who: string }
const cases = computed(() => (tm('ceremly.site.esempi.cases') as Case[]).map((c, i) => ({
    occ: rt(c.occ),
    t: rt(c.t),
    meta: rt(c.meta),
    quote: rt(c.quote),
    who: rt(c.who),
    bg: caseVisuals[i]!.bg,
    stats: (c.statLabels as unknown as string[]).map((l, si) => ({ n: caseVisuals[i]!.stats[si]!, l: rt(l) })),
})))
</script>

<template>
    <div>
        <CerSiteHero :tag="t('ceremly.site.esempi.heroTag')" :sub="t('ceremly.site.esempi.heroSub')">
            <template #title>
                {{ t('ceremly.site.esempi.heroTitlePart1') }}<br>{{ t('ceremly.site.esempi.heroTitlePart2') }} <CerMark>{{ t('ceremly.site.esempi.heroTitleMark') }}</CerMark>.
            </template>
        </CerSiteHero>

        <div class="cer-site-wrap" style="padding-top: 56px; padding-bottom: 72px;">
            <div class="cer-es-grid">
                <div v-for="c in cases" :key="c.t" class="cer-card" style="overflow: hidden; display: flex; flex-direction: column;">
                    <div :style="{ background: c.bg, borderBottom: '2px solid var(--ink)', padding: '26px 24px' }">
                        <span class="cer-tag" style="background: rgba(255,255,255,0.55); border-color: var(--line-strong);">{{ c.occ }}</span>
                        <div class="serif" style="font-size: 30px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.05; margin-top: 14px;">{{ c.t }}</div>
                        <div class="mono" style="font-size: 11px; margin-top: 8px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--ink-700);">{{ c.meta }}</div>
                    </div>
                    <div style="padding: 24px; display: flex; flex-direction: column; gap: 18px; flex: 1;">
                        <div class="row" style="gap: 0; justify-content: space-between;">
                            <div v-for="s in c.stats" :key="s.l" class="col" style="gap: 2px; max-width: 110px;">
                                <span class="serif" style="font-size: 30px; font-weight: 800; letter-spacing: -0.02em;">{{ s.n }}</span>
                                <span class="small muted" style="line-height: 1.3;">{{ s.l }}</span>
                            </div>
                        </div>
                        <div style="height: 1px; background: var(--line);" />
                        <div style="flex: 1;">
                            <p class="serif" style="font-size: 18px; font-weight: 600; line-height: 1.35; letter-spacing: -0.01em; margin: 0;">{{ c.quote }}</p>
                            <div class="small muted" style="margin-top: 10px;">{{ c.who }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <CerSiteCTA :secondary="t('ceremly.site.esempi.ctaSecondary')" :secondary-to="localePath('/esempi')">
            <template #title>
                {{ t('ceremly.site.esempi.ctaTitlePart1') }} <CerMark c="var(--orange)">{{ t('ceremly.site.esempi.ctaTitleMark') }}</CerMark>.
            </template>
        </CerSiteCTA>
    </div>
</template>

<style scoped>
.cer-es-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
}

@media (max-width: 1023px) {
    .cer-es-grid {
        grid-template-columns: 1fr;
    }
}
</style>
