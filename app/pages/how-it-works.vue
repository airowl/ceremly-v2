<script setup lang="ts">
// Public site → Product → How it works. Port of ComeFunzionaPage (site-product.jsx).
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

const seoTitle = t('ceremly.site.comeFunziona.seoTitle')
const seoDescription = t('ceremly.site.comeFunziona.seoDescription')
useSeoMeta({
    title: seoTitle,
    description: seoDescription,
    ogTitle: seoTitle,
    ogDescription: seoDescription,
    ogImage: () => `${baseUrl}/og/how-it-works-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
    twitterImage: () => `${baseUrl}/og/how-it-works-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
    ogType: 'website',
})
useAltHreflang()

interface Step { k: string, t: string, d: string, bullets: string[] }
const EMPTY_STEP: Step = { k: '', t: '', d: '', bullets: [] }
const stepsRaw = computed(() => (tm('ceremly.site.comeFunziona.steps') as Step[]).map(x => ({
    k: rt(x.k),
    t: rt(x.t),
    d: rt(x.d),
    bullets: (x.bullets as unknown as string[]).map(b => rt(b)),
})))
// Named steps (the 4 always exist): typed access without undefined in the template.
const steps = computed(() => ({
    s1: stepsRaw.value[0] ?? EMPTY_STEP,
    s2: stepsRaw.value[1] ?? EMPTY_STEP,
    s3: stepsRaw.value[2] ?? EMPTY_STEP,
    s4: stepsRaw.value[3] ?? EMPTY_STEP,
}))

// Structured data: HowTo (4 real steps from the page) + breadcrumb.
useSchemaOrg([
    defineHowTo({
        name: seoTitle,
        step: [
            { name: steps.value.s1.t, text: steps.value.s1.d },
            { name: steps.value.s2.t, text: steps.value.s2.d },
            { name: steps.value.s3.t, text: steps.value.s3.d },
            { name: steps.value.s4.t, text: steps.value.s4.d },
        ],
    }),
    defineBreadcrumb({
        itemListElement: [
            { name: t('blog.article.breadcrumbHome'), item: '/' },
            { name: seoTitle },
        ],
    }),
])

const distChannels = computed(() => [
    { i: 'whatsapp', t: t('ceremly.site.comeFunziona.distWhatsapp') },
    { i: 'mail', t: t('ceremly.site.comeFunziona.distEmail') },
    { i: 'qr', t: t('ceremly.site.comeFunziona.distQr') },
])
</script>

<template>
    <div>
        <CerSiteHero :tag="t('ceremly.site.comeFunziona.heroTag')" :sub="t('ceremly.site.comeFunziona.heroSub')">
            <template #title>
                {{ t('ceremly.site.comeFunziona.heroTitlePart1') }}<br>{{ t('ceremly.site.comeFunziona.heroTitlePart2') }} <CerMark>{{ t('ceremly.site.comeFunziona.heroTitleMark') }}</CerMark>.
            </template>
        </CerSiteHero>

        <div class="cer-site-wrap" style="padding-top: 8px; padding-bottom: 72px;">
            <!-- 01 · Create -->
            <div class="cer-cf-step">
                <div class="cer-cf-text">
                    <div class="mono" style="font-size: 14px; font-weight: 700; color: var(--orange);">{{ steps.s1.k }}</div>
                    <h3 class="serif cer-cf-h3">{{ steps.s1.t }}</h3>
                    <p class="cer-cf-desc">{{ steps.s1.d }}</p>
                    <div class="col cer-cf-bullets">
                        <span v-for="b in steps.s1.bullets" :key="b" class="row" style="gap: 9px; font-size: 14px; color: var(--ink-700);">
                            <span style="color: var(--purple);"><CerIcon name="check" :s="15" /></span> {{ b }}
                        </span>
                    </div>
                </div>
                <div class="cer-cf-visual">
                    <CerMiniInvite :w="280" :h="320" :rotate="-2" date="12 · settembre · 2026" italic="si sposano" sub="Villa Erba, Cernobbio">
                        <template #names>Giulia &amp;<br>Tommaso</template>
                    </CerMiniInvite>
                </div>
            </div>

            <!-- 02 · Import -->
            <div class="cer-cf-step">
                <div class="cer-cf-text cer-cf-flip-text">
                    <div class="mono" style="font-size: 14px; font-weight: 700; color: var(--orange);">{{ steps.s2.k }}</div>
                    <h3 class="serif cer-cf-h3">{{ steps.s2.t }}</h3>
                    <p class="cer-cf-desc">{{ steps.s2.d }}</p>
                    <div class="col cer-cf-bullets">
                        <span v-for="b in steps.s2.bullets" :key="b" class="row" style="gap: 9px; font-size: 14px; color: var(--ink-700);">
                            <span style="color: var(--purple);"><CerIcon name="check" :s="15" /></span> {{ b }}
                        </span>
                    </div>
                </div>
                <div class="cer-cf-visual cer-cf-flip-visual">
                    <div class="cer-card" style="width: 380px; max-width: 100%; padding: 18px;">
                        <div class="row" style="justify-content: space-between; margin-bottom: 12px;">
                            <span class="mono" style="font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--ink-500);">{{ t('ceremly.site.comeFunziona.guestList') }}</span>
                            <span class="pill neutral">{{ t('ceremly.site.comeFunziona.guestImported') }}</span>
                        </div>
                        <div class="col" style="gap: 10px;">
                            <div v-for="r in [{ ini: 'MR', n: 'Marta Rinaldi', g: 'Famiglia Rinaldi', cls: '' }, { ini: 'LB', n: 'Luca Bianchi', g: 'Lato sposo', cls: 'sage' }, { ini: 'EP', n: 'Elena Paoli', g: 'Amici università', cls: '' }, { ini: 'GV', n: 'Giorgio Valli', g: 'Famiglia Valli', cls: 'sage' }]" :key="r.n" class="row" style="gap: 10px; justify-content: space-between;">
                                <div class="row" style="gap: 10px;">
                                    <span class="av" :class="r.cls">{{ r.ini }}</span>
                                    <span style="font-size: 14px; font-weight: 500;">{{ r.n }}</span>
                                </div>
                                <span class="cer-tag" style="font-size: 10px; padding: 2px 7px;">{{ r.g }}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 03 · Distribute -->
            <div class="cer-cf-step">
                <div class="cer-cf-text">
                    <div class="mono" style="font-size: 14px; font-weight: 700; color: var(--orange);">{{ steps.s3.k }}</div>
                    <h3 class="serif cer-cf-h3">{{ steps.s3.t }}</h3>
                    <p class="cer-cf-desc">{{ steps.s3.d }}</p>
                    <div class="col cer-cf-bullets">
                        <span v-for="b in steps.s3.bullets" :key="b" class="row" style="gap: 9px; font-size: 14px; color: var(--ink-700);">
                            <span style="color: var(--purple);"><CerIcon name="check" :s="15" /></span> {{ b }}
                        </span>
                    </div>
                </div>
                <div class="cer-cf-visual">
                    <div class="col" style="gap: 14px; width: 380px; max-width: 100%;">
                        <div class="cer-card" style="padding: 16px;">
                            <div class="mono" style="font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--ink-500); margin-bottom: 10px;">{{ t('ceremly.site.comeFunziona.distLinkLabel') }}</div>
                            <div class="row" style="gap: 8px;">
                                <div class="mono" style="flex: 1; font-size: 12px; padding: 10px 12px; background: var(--bone-100); border: 1px solid var(--line); border-radius: 8px; color: var(--ink-700); white-space: nowrap; overflow: hidden;">ceremly.com/giulia-tommaso</div>
                                <button class="cer-btn small ghost" type="button"><CerIcon name="copy" :s="13" /> {{ t('ceremly.site.comeFunziona.distCopy') }}</button>
                            </div>
                        </div>
                        <div class="row" style="gap: 10px;">
                            <div v-for="c in distChannels" :key="c.t" class="cer-card row" style="flex: 1; gap: 8px; padding: 12px 14px; justify-content: center; font-size: 13px; font-weight: 600;">
                                <CerIcon :name="c.i" :s="16" /> {{ c.t }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 04 · Collect -->
            <div class="cer-cf-step cer-cf-last">
                <div class="cer-cf-text cer-cf-flip-text">
                    <div class="mono" style="font-size: 14px; font-weight: 700; color: var(--orange);">{{ steps.s4.k }}</div>
                    <h3 class="serif cer-cf-h3">{{ steps.s4.t }}</h3>
                    <p class="cer-cf-desc">{{ steps.s4.d }}</p>
                    <div class="col cer-cf-bullets">
                        <span v-for="b in steps.s4.bullets" :key="b" class="row" style="gap: 9px; font-size: 14px; color: var(--ink-700);">
                            <span style="color: var(--purple);"><CerIcon name="check" :s="15" /></span> {{ b }}
                        </span>
                    </div>
                </div>
                <div class="cer-cf-visual cer-cf-flip-visual">
                    <div class="cer-card" style="width: 380px; max-width: 100%; padding: 20px;">
                        <div class="row" style="justify-content: space-between;">
                            <span class="mono" style="font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--ink-500);">{{ t('ceremly.site.comeFunziona.dashTrend') }}</span>
                            <span class="pill confirm"><span class="cer-dot" />{{ t('ceremly.site.comeFunziona.dashToday') }}</span>
                        </div>
                        <div class="serif" style="font-size: 52px; font-weight: 800; line-height: 1; margin-top: 12px; letter-spacing: -0.03em;">
                            87<span style="color: var(--ink-300); font-size: 26px;">/142</span>
                        </div>
                        <div class="small muted" style="margin-top: 4px;">{{ t('ceremly.site.comeFunziona.dashMeta') }}</div>
                        <div style="margin-top: 14px; height: 8px; background: var(--bone-100); border-radius: 999px; overflow: hidden; border: 1px solid var(--line);">
                            <div style="height: 100%; width: 61%; background: var(--purple);" />
                        </div>
                        <div class="row" style="gap: 8px; margin-top: 14px;">
                            <span class="pill confirm">{{ t('ceremly.site.comeFunziona.dashYes') }}</span>
                            <span class="pill decline">{{ t('ceremly.site.comeFunziona.dashNo') }}</span>
                            <span class="pill pending">{{ t('ceremly.site.comeFunziona.dashPending') }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <CerSiteCTA :sub="t('ceremly.site.comeFunziona.ctaSub')" :secondary="t('ceremly.site.comeFunziona.ctaSecondary')" :secondary-to="localePath('/examples')" />
    </div>
</template>

<style scoped>
.cer-cf-step {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 64px;
    align-items: center;
    padding: 52px 0;
    border-bottom: 1px solid var(--line);
}

.cer-cf-last {
    border-bottom: none;
}

.cer-cf-flip-text {
    order: 2;
}

.cer-cf-flip-visual {
    order: 1;
}

.cer-cf-h3 {
    font-size: 36px;
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1.05;
    margin: 12px 0 0;
}

.cer-cf-desc {
    font-size: 15px;
    color: var(--ink-700);
    line-height: 1.6;
    margin: 14px 0 0;
    max-width: 480px;
}

.cer-cf-bullets {
    gap: 9px;
    margin-top: 18px;
}

.cer-cf-visual {
    background: var(--bone-100);
    border: 1px solid var(--line);
    border-radius: 18px;
    padding: 32px;
    min-height: 320px;
    display: flex;
    align-items: center;
    justify-content: center;
}

@media (max-width: 1023px) {
    .cer-cf-step {
        grid-template-columns: 1fr;
        gap: 32px;
    }

    .cer-cf-flip-text,
    .cer-cf-flip-visual {
        order: 0;
    }
}
</style>
