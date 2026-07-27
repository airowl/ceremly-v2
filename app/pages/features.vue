<script setup lang="ts">
// Public site → Product → Features. Port of FunzionalitaPage (site-product.jsx).
import CerIcon from '~/components/ceremly/CerIcon.vue'
import CerMark from '~/components/ceremly/CerMark.vue'
import CerSiteHero from '~/components/ceremly/CerSiteHero.vue'
import CerSiteCTA from '~/components/ceremly/CerSiteCTA.vue'

definePageMeta({ layout: 'public-site', auth: false })

const { t, tm, rt, locale } = useI18n()
const localePath = useLocalePath()
const runtimeConfig = useRuntimeConfig()
const baseUrl = ((runtimeConfig.public.baseURL as string) || '').replace(/\/$/, '')

const seoTitle = t('ceremly.site.funzionalita.seoTitle')
const seoDescription = t('ceremly.site.funzionalita.seoDescription')
useSeoMeta({
    title: seoTitle,
    description: seoDescription,
    ogTitle: seoTitle,
    ogDescription: seoDescription,
    ogImage: () => `${baseUrl}/og/features-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
    twitterImage: () => `${baseUrl}/og/features-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
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

// Icons per group (3 features each), by index — non-textual, kept in the .vue.
const groupIcons: string[][] = [
    ['sparkle', 'edit', 'qr'],
    ['guests', 'heart', 'bell'],
    ['home', 'chart', 'upload'],
]

interface Feat { t: string, d: string }
interface Group { tag: string, title: string, desc: string, feats: Feat[] }
const groups = computed(() => (tm('ceremly.site.funzionalita.groups') as Group[]).map((g, gi) => ({
    tag: rt(g.tag),
    title: rt(g.title),
    desc: rt(g.desc),
    feats: (g.feats as unknown as Feat[]).map((f, fi) => ({
        icon: groupIcons[gi]?.[fi] || 'sparkle',
        t: rt(f.t),
        d: rt(f.d),
    })),
})))
</script>

<template>
    <div>
        <CerSiteHero :tag="t('ceremly.site.funzionalita.heroTag')" :sub="t('ceremly.site.funzionalita.heroSub')">
            <template #title>
                {{ t('ceremly.site.funzionalita.heroTitlePart1') }}<br><CerMark>{{ t('ceremly.site.funzionalita.heroTitleMark') }}</CerMark>.
            </template>
        </CerSiteHero>

        <div class="cer-site-wrap" style="padding-top: 64px; padding-bottom: 24px;">
            <div
                v-for="(g, gi) in groups"
                :key="g.tag"
                class="cer-fn-group"
                :style="{ borderBottom: gi < groups.length - 1 ? '1px solid var(--line)' : 'none' }"
            >
                <div class="cer-fn-head">
                    <span class="cer-tag" style="background: var(--wine-soft); color: var(--purple-ink); border-color: transparent;">{{ g.tag }}</span>
                    <h2 class="serif cer-fn-title">{{ g.title }}</h2>
                    <p class="cer-fn-desc">{{ g.desc }}</p>
                </div>
                <div class="cer-fn-cards">
                    <div v-for="f in g.feats" :key="f.t" class="cer-card" style="padding: 22px;">
                        <div style="width: 42px; height: 42px; border-radius: 10px; background: var(--bone-200); border: 1.5px solid var(--ink); display: inline-flex; align-items: center; justify-content: center;">
                            <CerIcon :name="f.icon" :s="19" />
                        </div>
                        <div class="serif" style="font-size: 19px; font-weight: 700; margin-top: 16px; letter-spacing: -0.02em; line-height: 1.15;">{{ f.t }}</div>
                        <div style="font-size: 13px; margin-top: 8px; color: var(--ink-700); line-height: 1.55;">{{ f.d }}</div>
                    </div>
                </div>
            </div>
        </div>

        <CerSiteCTA :sub="t('ceremly.site.funzionalita.ctaSub')" :secondary="t('ceremly.site.funzionalita.ctaSecondary')" :secondary-to="localePath('/pricing')">
            <template #title>
                {{ t('ceremly.site.funzionalita.ctaTitlePart1') }} <CerMark c="var(--orange)">{{ t('ceremly.site.funzionalita.ctaTitleMark') }}</CerMark>.
            </template>
        </CerSiteCTA>
    </div>
</template>

<style scoped>
.cer-fn-group {
    display: grid;
    grid-template-columns: 0.62fr 1.38fr;
    gap: 56px;
    padding: 44px 0;
    align-items: start;
}

.cer-fn-title {
    font-size: 38px;
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1.05;
    margin: 14px 0 0;
}

.cer-fn-desc {
    font-size: 14px;
    color: var(--ink-700);
    line-height: 1.6;
    margin: 12px 0 0;
    max-width: 300px;
}

.cer-fn-cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
}

@media (max-width: 1023px) {
    .cer-fn-group {
        grid-template-columns: 1fr;
        gap: 28px;
    }

    .cer-fn-cards {
        grid-template-columns: 1fr;
    }
}
</style>
