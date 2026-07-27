<script setup lang="ts">
// Sito pubblico → Risorse → Guida RSVP. Port di GuidaRSVPPage (site-resources.jsx).
import CerMark from '~/components/ceremly/CerMark.vue'
import CerSiteHero from '~/components/ceremly/CerSiteHero.vue'
import CerSiteCTA from '~/components/ceremly/CerSiteCTA.vue'

definePageMeta({ layout: 'public-site', auth: false })

const { t, tm, rt, locale } = useI18n()
const runtimeConfig = useRuntimeConfig()
const baseUrl = ((runtimeConfig.public.baseURL as string) || '').replace(/\/$/, '')

const seoTitle = t('ceremly.site.guidaRsvp.seoTitle')
const seoDescription = t('ceremly.site.guidaRsvp.seoDescription')
useSeoMeta({
    title: seoTitle,
    description: seoDescription,
    ogTitle: seoTitle,
    ogDescription: seoDescription,
    ogImage: () => `${baseUrl}/og/rsvp-guide-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
    twitterImage: () => `${baseUrl}/og/rsvp-guide-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
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

const toc = computed(() => (tm('ceremly.site.guidaRsvp.toc') as string[]).map(x => rt(x)))

interface TimelineItem { phase: string, title: string, desc: string }
const timeline = computed(() => (tm('ceremly.site.guidaRsvp.timeline') as TimelineItem[]).map(x => ({ phase: rt(x.phase), title: rt(x.title), desc: rt(x.desc) })))
</script>

<template>
    <div>
        <CerSiteHero :tag="t('ceremly.site.guidaRsvp.heroTag')" :sub="t('ceremly.site.guidaRsvp.heroSub')">
            <template #title>
                {{ t('ceremly.site.guidaRsvp.heroTitlePart1') }} <CerMark>{{ t('ceremly.site.guidaRsvp.heroTitleMark') }}</CerMark>.
            </template>
        </CerSiteHero>

        <div class="cer-site-wrap cer-rsvp-body">
            <!-- TOC -->
            <div class="cer-card cer-rsvp-toc" style="padding: 22px;">
                <div class="mono" style="font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-400); margin-bottom: 14px;">{{ t('ceremly.site.guidaRsvp.tocLabel') }}</div>
                <div class="col" style="gap: 12px;">
                    <span v-for="(item, i) in toc" :key="item" class="row" :style="{ gap: '10px', fontSize: '14px', color: i === 0 ? 'var(--ink)' : 'var(--ink-700)', fontWeight: i === 0 ? 600 : 400 }">
                        <span class="mono" style="font-size: 12px; color: var(--orange); font-weight: 700;">0{{ i + 1 }}</span> {{ item }}
                    </span>
                </div>
            </div>

            <!-- contenuto -->
            <div class="cer-rsvp-content">
                <h2 id="s1" class="serif cer-rsvp-h3">
                    <span class="mono cer-rsvp-h3-n">01</span>{{ t('ceremly.site.guidaRsvp.s1Title') }}
                </h2>
                <p class="cer-rsvp-p">{{ t('ceremly.site.guidaRsvp.s1p1') }}</p>
                <p class="cer-rsvp-p">{{ t('ceremly.site.guidaRsvp.s1p2') }}</p>

                <div class="cer-rsvp-hr" />
                <h2 id="s2" class="serif cer-rsvp-h3">
                    <span class="mono cer-rsvp-h3-n">02</span>{{ t('ceremly.site.guidaRsvp.s2Title') }}
                </h2>
                <p class="cer-rsvp-p">{{ t('ceremly.site.guidaRsvp.s2p1') }}</p>
                <div class="cer-card" style="padding: 24px; margin: 20px 0 14px;">
                    <div class="col" style="gap: 0;">
                        <div v-for="(item, i) in timeline" :key="item.phase" class="row" :style="{ gap: '18px', alignItems: 'flex-start', padding: '12px 0', borderBottom: i < timeline.length - 1 ? '1px solid var(--line)' : 'none' }">
                            <span class="mono" style="font-size: 13px; font-weight: 700; color: var(--purple-bright); width: 48px; flex-shrink: 0;">{{ item.phase }}</span>
                            <div class="col" style="gap: 2px;">
                                <span style="font-size: 15px; font-weight: 600;">{{ item.title }}</span>
                                <span style="font-size: 13px; color: var(--ink-500); line-height: 1.5;">{{ item.desc }}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <p class="cer-rsvp-p">{{ t('ceremly.site.guidaRsvp.s2p2') }}</p>

                <div class="cer-rsvp-hr" />
                <h2 id="s3" class="serif cer-rsvp-h3">
                    <span class="mono cer-rsvp-h3-n">03</span>{{ t('ceremly.site.guidaRsvp.s3Title') }}
                </h2>
                <p class="cer-rsvp-p">{{ t('ceremly.site.guidaRsvp.s3p1') }}</p>
                <div style="background: var(--bone-200); border: 1px solid var(--line); border-radius: 14px; padding: 20px 24px; margin: 18px 0;">
                    <div class="mono" style="font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--blue-deep); margin-bottom: 10px;">{{ t('ceremly.site.guidaRsvp.exampleLabel') }}</div>
                    <p style="font-size: 15px; line-height: 1.65; margin: 0; font-style: italic;">{{ t('ceremly.site.guidaRsvp.exampleText') }}</p>
                </div>
                <p class="cer-rsvp-p">{{ t('ceremly.site.guidaRsvp.s3p2') }}</p>

                <div class="cer-rsvp-hr" />
                <h2 id="s4" class="serif cer-rsvp-h3">
                    <span class="mono cer-rsvp-h3-n">04</span>{{ t('ceremly.site.guidaRsvp.s4Title') }}
                </h2>
                <p class="cer-rsvp-p">{{ t('ceremly.site.guidaRsvp.s4p1') }}</p>
                <p class="cer-rsvp-p">{{ t('ceremly.site.guidaRsvp.s4p2') }}</p>
            </div>
        </div>

        <CerSiteCTA :sub="t('ceremly.site.guidaRsvp.ctaSub')">
            <template #title>
                {{ t('ceremly.site.guidaRsvp.ctaTitlePart1') }} <CerMark c="var(--orange)">{{ t('ceremly.site.guidaRsvp.ctaTitleMark') }}</CerMark>.
            </template>
        </CerSiteCTA>
    </div>
</template>

<style scoped>
.cer-rsvp-body {
    padding: 64px 0 80px;
    display: grid;
    grid-template-columns: 290px 1fr;
    gap: 56px;
    align-items: start;
}

.cer-rsvp-toc {
    position: sticky;
    top: 24px;
}

.cer-rsvp-content {
    max-width: 720px;
}

.cer-rsvp-h3 {
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -0.025em;
    margin: 0 0 14px;
    display: flex;
    gap: 12px;
    align-items: baseline;
}

.cer-rsvp-h3-n {
    font-size: 14px;
    color: var(--orange);
    font-weight: 700;
}

.cer-rsvp-p {
    font-size: 15px;
    line-height: 1.7;
    color: var(--ink-700);
    margin: 0 0 14px;
}

.cer-rsvp-hr {
    height: 1px;
    background: var(--line);
    margin: 32px 0;
}

@media (max-width: 1023px) {
    .cer-rsvp-body {
        grid-template-columns: 1fr;
        gap: 32px;
    }

    .cer-rsvp-toc {
        position: static;
    }

    .cer-rsvp-content {
        max-width: 100%;
    }
}
</style>
