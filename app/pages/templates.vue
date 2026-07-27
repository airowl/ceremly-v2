<script setup lang="ts">
// Public site → Product → Invite templates. Port of ModelliPage (site-product.jsx).
import CerIcon from '~/components/ceremly/CerIcon.vue'
import CerMark from '~/components/ceremly/CerMark.vue'
import CerSiteHero from '~/components/ceremly/CerSiteHero.vue'
import CerSiteCTA from '~/components/ceremly/CerSiteCTA.vue'
import CerMiniInvite from '~/components/ceremly/CerMiniInvite.vue'

definePageMeta({ layout: 'public-site', auth: false })

const { t, tm, rt, locale } = useI18n()
const localePath = useLocalePath()
const runtimeConfig = useRuntimeConfig()
const baseUrl = ((runtimeConfig.public.baseURL as string) || '').replace(/\/$/, '')

const seoTitle = t('ceremly.site.modelli.seoTitle')
const seoDescription = t('ceremly.site.modelli.seoDescription')
useSeoMeta({
    title: seoTitle,
    description: seoDescription,
    ogTitle: seoTitle,
    ogDescription: seoDescription,
    ogImage: () => `${baseUrl}/og/templates-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
    twitterImage: () => `${baseUrl}/og/templates-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
    ogType: 'website',
})
useAltHreflang()

// Breadcrumb structured data (Home › this page). Relative item paths are
// resolved against site.url by nuxt-schema-org.
useSchemaOrg([
    defineBreadcrumb({
        itemListElement: [
            { name: t('blog.article.breadcrumbHome'), item: '/' },
            { name: seoTitle },
        ],
    }),
])

const chips = computed(() => (tm('ceremly.site.modelli.chips') as string[]).map(c => rt(c)))

// Visual data and showcase content (names/dates/venues) for the index — kept in the .vue.
const tplVisuals = [
    { bg: 'var(--bone-300)', color: 'var(--ink)', date: '12 · settembre · 2026', nameLine1: 'Giulia &', nameLine2: 'Tommaso', italic: 'si sposano', sub: 'Villa Erba, Cernobbio' },
    { bg: 'var(--ink)', color: 'var(--bone-50)', date: '20 · giugno · 2026', nameLine1: 'Anna &', nameLine2: 'Filippo', italic: 'si sposano', sub: 'Masseria Lamacoppa, Ostuni' },
    { bg: 'var(--purple)', color: 'var(--ink)', date: '17 · luglio · 2026', nameLine1: 'Sara', nameLine2: 'si laurea', italic: '', sub: 'Aula magna + brindisi in cortile' },
    { bg: 'var(--bone-200)', color: 'var(--ink)', date: '8 · marzo · 2026', nameLine1: 'Il battesimo', nameLine2: 'di Leo', italic: '', sub: 'San Martino + pranzo in famiglia' },
    { bg: 'var(--orange-soft)', color: 'var(--ink)', date: '21 · novembre · 2026', nameLine1: 'I 40', nameLine2: 'di Marco', italic: '', sub: 'Cascina Boscaccio, ore 20' },
    { bg: 'var(--bone-50)', color: 'var(--ink)', date: '3 · ottobre · 2026', nameLine1: 'Chiara &', nameLine2: 'Matteo', italic: 'si sposano', sub: 'Abbazia di San Galgano' },
]

interface Tpl { n: string, occ: string }
const tpls = computed(() => (tm('ceremly.site.modelli.tpls') as Tpl[]).map((x, i) => ({
    n: rt(x.n),
    occ: rt(x.occ),
    ...tplVisuals[i]!,
})))
</script>

<template>
    <div>
        <CerSiteHero :tag="t('ceremly.site.modelli.heroTag')" :sub="t('ceremly.site.modelli.heroSub')">
            <template #title>
                {{ t('ceremly.site.modelli.heroTitlePart1') }} <CerMark>{{ t('ceremly.site.modelli.heroTitleMark') }}</CerMark>.
            </template>
            <div class="row" style="gap: 8px; margin-top: 28px; flex-wrap: wrap;">
                <span
                    v-for="(c, i) in chips"
                    :key="c"
                    class="cer-tag"
                    :style="i === 0 ? { background: 'var(--ink)', color: 'var(--bone-50)', borderColor: 'var(--ink)' } : { cursor: 'pointer' }"
                >{{ c }}</span>
            </div>
        </CerSiteHero>

        <div class="cer-site-wrap" style="padding-top: 56px; padding-bottom: 56px;">
            <div class="cer-md-grid">
                <div v-for="tpl in tpls" :key="tpl.n" class="col" style="gap: 0;">
                    <div style="background: var(--bone-100); border: 1px solid var(--line); border-radius: 18px; padding: 30px 30px 34px; display: flex; justify-content: center;">
                        <CerMiniInvite :w="250" :h="330" :bg="tpl.bg" :color="tpl.color" :date="tpl.date" :italic="tpl.italic" :sub="tpl.sub" shadow="var(--ink)">
                            <template #names>{{ tpl.nameLine1 }}<br>{{ tpl.nameLine2 }}</template>
                        </CerMiniInvite>
                    </div>
                    <div class="row" style="justify-content: space-between; margin-top: 14px; padding: 0 4px;">
                        <span class="serif" style="font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">{{ tpl.n }}</span>
                        <span class="cer-tag" style="font-size: 10px; padding: 3px 8px;">{{ tpl.occ }}</span>
                    </div>
                </div>
            </div>

            <div class="cer-md-note">
                <div class="row" style="gap: 12px;">
                    <span style="color: var(--purple-bright);"><CerIcon name="sparkle" :s="20" /></span>
                    <span style="font-size: 14px; color: var(--ink-700);">{{ t('ceremly.site.modelli.noteText') }}</span>
                </div>
                <NuxtLink :to="localePath('/pricing')" class="cer-btn small ghost" style="white-space: nowrap;">{{ t('ceremly.site.modelli.notePrices') }} <CerIcon name="chevR" :s="12" /></NuxtLink>
            </div>
        </div>

        <CerSiteCTA :secondary="t('ceremly.site.modelli.ctaSecondary')" :secondary-to="localePath('/examples')">
            <template #title>
                {{ t('ceremly.site.modelli.ctaTitlePart1') }} <CerMark c="var(--orange)">{{ t('ceremly.site.modelli.ctaTitleMark') }}</CerMark>.
            </template>
        </CerSiteCTA>
    </div>
</template>

<style scoped>
.cer-md-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 28px;
}

.cer-md-note {
    margin: 8px 0 0;
    padding: 22px 28px;
    background: var(--bone-100);
    border: 1px solid var(--line);
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
}

.cer-md-note :deep(a.cer-btn) {
    text-decoration: none;
}

@media (max-width: 1023px) {
    .cer-md-grid {
        grid-template-columns: 1fr 1fr;
    }
}

@media (max-width: 640px) {
    .cer-md-grid {
        grid-template-columns: 1fr;
    }

    .cer-md-note {
        flex-direction: column;
        align-items: flex-start;
    }
}
</style>
