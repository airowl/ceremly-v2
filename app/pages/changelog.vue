<script setup lang="ts">
// Sito pubblico → Risorse → Changelog. Port di ChangelogPage (site-resources.jsx).
import CerMark from '~/components/ceremly/CerMark.vue'
import CerSiteHero from '~/components/ceremly/CerSiteHero.vue'

definePageMeta({ layout: 'public-site', auth: false })

const { t, tm, rt } = useI18n()
const runtimeConfig = useRuntimeConfig()
const baseUrl = ((runtimeConfig.public.baseURL as string) || '').replace(/\/$/, '')

const seoTitle = t('ceremly.site.changelog.seoTitle')
const seoDescription = t('ceremly.site.changelog.seoDescription')
useSeoMeta({
    title: seoTitle,
    description: seoDescription,
    ogTitle: seoTitle,
    ogDescription: seoDescription,
    ogImage: `${baseUrl}/ogImage-it.png`,
    ogType: 'website',
})

// CRITICO: nessun '@' nelle stringhe i18n. Placeholder con '@' tenuto qui, letterale.
const newsletterPlaceholder = 'la-tua@email.it'

// Versioni/date illustrative: letterali nel .vue, frasi in i18n.
const releaseMeta = [
    { v: 'v0.4', d: '28 maggio 2026' },
    { v: 'v0.3', d: '30 aprile 2026' },
    { v: 'v0.2', d: '2 aprile 2026' },
    { v: 'v0.1', d: '5 marzo 2026' },
]

// Mappa colore badge per tipo di voce (chiave = label tradotta).
const tagColors: Record<string, [string, string]> = {
    Nuovo: ['var(--bone-200)', 'var(--blue-deep)'],
    Migliorato: ['var(--wine-soft)', 'var(--purple-ink)'],
    Risolto: ['var(--orange-soft)', 'var(--orange-deep)'],
    New: ['var(--bone-200)', 'var(--blue-deep)'],
    Improved: ['var(--wine-soft)', 'var(--purple-ink)'],
    Fixed: ['var(--orange-soft)', 'var(--orange-deep)'],
}
function tagColor(tag: string): [string, string] {
    return tagColors[tag] || ['var(--bone-200)', 'var(--blue-deep)']
}

interface RelItem { tag: string, text: string }
interface Release { t: string, items: RelItem[] }
const releases = computed(() => (tm('ceremly.site.changelog.releases') as Release[]).map((r, i) => ({
    v: releaseMeta[i]?.v || '',
    d: releaseMeta[i]?.d || '',
    t: rt(r.t),
    items: (r.items || []).map(it => ({ tag: rt(it.tag), text: rt(it.text) })),
})))
</script>

<template>
    <div>
        <CerSiteHero :tag="t('ceremly.site.changelog.heroTag')" :sub="t('ceremly.site.changelog.heroSub')">
            <template #title>
                {{ t('ceremly.site.changelog.heroTitlePart1') }} <CerMark>{{ t('ceremly.site.changelog.heroTitleMark') }}</CerMark>
            </template>
        </CerSiteHero>

        <div class="cer-site-wrap" style="padding: 64px 0 56px;">
            <div class="col" style="gap: 0;">
                <div v-for="(r, ri) in releases" :key="r.v" class="cer-cl-row" :style="{ padding: '36px 0', borderBottom: ri < releases.length - 1 ? '1px solid var(--line)' : 'none' }">
                    <div class="col" style="gap: 6px;">
                        <span class="serif" style="font-size: 26px; font-weight: 800; letter-spacing: -0.02em;">{{ r.v }}</span>
                        <span class="mono" style="font-size: 12px; color: var(--ink-500);">{{ r.d }}</span>
                    </div>
                    <div>
                        <div class="serif" style="font-size: 24px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 16px;">{{ r.t }}</div>
                        <div class="col" style="gap: 12px;">
                            <div v-for="it in r.items" :key="it.text" class="row" style="gap: 12px; align-items: flex-start;">
                                <span class="cer-tag" :style="{ background: tagColor(it.tag)[0], color: tagColor(it.tag)[1], borderColor: 'transparent', fontSize: '10px', padding: '3px 8px' }">{{ it.tag }}</span>
                                <span style="font-size: 14px; color: var(--ink-700); line-height: 1.55;">{{ it.text }}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="cer-site-wrap" style="padding: 0 0 72px;">
            <div class="cer-cl-news">
                <div class="col" style="gap: 2px;">
                    <span class="serif" style="font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">{{ t('ceremly.site.changelog.newsletterTitle') }}</span>
                    <span style="font-size: 13px; color: var(--ink-500);">{{ t('ceremly.site.changelog.newsletterSub') }}</span>
                </div>
                <div class="row" style="gap: 10px; flex-shrink: 0;">
                    <input class="cer-input" :placeholder="newsletterPlaceholder" style="width: 240px;" readonly>
                    <button class="cer-btn">{{ t('ceremly.site.changelog.newsletterBtn') }}</button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.cer-cl-row {
    display: grid;
    grid-template-columns: 180px 1fr;
    gap: 40px;
}

.cer-cl-news {
    padding: 24px 28px;
    background: var(--bone-100);
    border: 1px solid var(--line);
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
}

@media (max-width: 1023px) {
    .cer-cl-row {
        grid-template-columns: 1fr;
        gap: 16px;
    }

    .cer-cl-news {
        flex-direction: column;
        align-items: flex-start;
    }
}
</style>
