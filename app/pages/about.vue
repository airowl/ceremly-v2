<script setup lang="ts">
// Sito pubblico → Ceremly → Chi siamo. Port di ChiSiamoPage (site-company.jsx).
import CerIcon from '~/components/ceremly/CerIcon.vue'
import CerMark from '~/components/ceremly/CerMark.vue'
import CerSiteHero from '~/components/ceremly/CerSiteHero.vue'
import CerSiteH2 from '~/components/ceremly/CerSiteH2.vue'
import CerSiteCTA from '~/components/ceremly/CerSiteCTA.vue'

definePageMeta({ layout: 'public-site', auth: false })

const { t, tm, rt, locale } = useI18n()
const runtimeConfig = useRuntimeConfig()
const baseUrl = ((runtimeConfig.public.baseURL as string) || '').replace(/\/$/, '')

const seoTitle = t('ceremly.site.chiSiamo.seoTitle')
const seoDescription = t('ceremly.site.chiSiamo.seoDescription')
useSeoMeta({
    title: seoTitle,
    titleTemplate: '',
    description: seoDescription,
    ogTitle: seoTitle,
    ogDescription: seoDescription,
    ogImage: () => `${baseUrl}/og/about-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
    twitterImage: () => `${baseUrl}/og/about-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
    ogType: 'website',
})
useAltHreflang()

interface Pair { n: string, l: string }
const nums = computed(() => (tm('ceremly.site.chiSiamo.nums') as Pair[]).map(x => ({ n: rt(x.n), l: rt(x.l) })))

const principiIcons = ['check', 'settings', 'heart']
interface Principio { t: string, d: string }
const principi = computed(() => (tm('ceremly.site.chiSiamo.principi') as Principio[]).map((x, i) => ({ icon: principiIcons[i] || 'check', t: rt(x.t), d: rt(x.d) })))

interface Member { ini: string, n: string, r: string, d: string }
const team = computed(() => (tm('ceremly.site.chiSiamo.team') as Member[]).map(x => ({ ini: rt(x.ini), n: rt(x.n), r: rt(x.r), d: rt(x.d) })))
</script>

<template>
    <div>
        <CerSiteHero :tag="t('ceremly.site.chiSiamo.heroTag')" :sub="t('ceremly.site.chiSiamo.heroSub')">
            <template #title>
                {{ t('ceremly.site.chiSiamo.heroTitlePart1') }}<br>{{ t('ceremly.site.chiSiamo.heroTitlePart2') }} <CerMark>{{ t('ceremly.site.chiSiamo.heroTitleMark') }}</CerMark>.
            </template>
        </CerSiteHero>

        <div class="cer-site-wrap cer-cs-body">
            <!-- intro -->
            <div class="cer-cs-intro">
                <p style="font-size: 17px; line-height: 1.7; color: var(--ink-700); margin: 0;">{{ t('ceremly.site.chiSiamo.intro1') }}</p>
                <p style="font-size: 17px; line-height: 1.7; color: var(--ink-700); margin: 0;">{{ t('ceremly.site.chiSiamo.intro2') }}</p>
            </div>

            <!-- numeri -->
            <div class="cer-cs-nums">
                <div v-for="x in nums" :key="x.l" class="col" style="gap: 2px;">
                    <span class="serif" style="font-size: 40px; font-weight: 800; letter-spacing: -0.03em;">{{ x.n }}</span>
                    <span class="small muted">{{ x.l }}</span>
                </div>
            </div>

            <!-- principi -->
            <div style="padding-top: 64px;">
                <CerSiteH2 :tag="t('ceremly.site.chiSiamo.principiTag')" :title="t('ceremly.site.chiSiamo.principiTitle')" />
                <div class="cer-cs-grid3">
                    <div v-for="v in principi" :key="v.t" class="cer-card" style="padding: 26px;">
                        <div style="width: 42px; height: 42px; border-radius: 10px; background: var(--bone-200); border: 1.5px solid var(--ink); display: inline-flex; align-items: center; justify-content: center;">
                            <CerIcon :name="v.icon" :s="19" />
                        </div>
                        <div class="serif" style="font-size: 22px; font-weight: 700; margin-top: 16px; letter-spacing: -0.02em;">{{ v.t }}</div>
                        <div style="font-size: 14px; margin-top: 10px; color: var(--ink-700); line-height: 1.6;">{{ v.d }}</div>
                    </div>
                </div>
            </div>

            <!-- team -->
            <div style="padding: 64px 0 80px;">
                <CerSiteH2 :tag="t('ceremly.site.chiSiamo.teamTag')" :title="t('ceremly.site.chiSiamo.teamTitle')" />
                <div class="cer-cs-grid3">
                    <div v-for="m in team" :key="m.n" class="cer-card row" style="padding: 22px; gap: 16px; align-items: flex-start;">
                        <span class="av lg" style="width: 48px; height: 48px; font-size: 14px;">{{ m.ini }}</span>
                        <div class="col" style="gap: 3px;">
                            <span class="serif" style="font-size: 19px; font-weight: 700; letter-spacing: -0.02em;">{{ m.n }}</span>
                            <span class="mono" style="font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--purple-bright);">{{ m.r }}</span>
                            <span style="font-size: 13px; color: var(--ink-700); line-height: 1.5; margin-top: 4px;">{{ m.d }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <CerSiteCTA :sub="t('ceremly.site.chiSiamo.ctaSub')" :secondary="t('ceremly.site.chiSiamo.ctaSecondary')" :secondary-to="useLocalePath()('/contact')">
            <template #title>
                {{ t('ceremly.site.chiSiamo.ctaTitlePart1') }} <CerMark c="var(--orange)">{{ t('ceremly.site.chiSiamo.ctaTitleMark') }}</CerMark>.
            </template>
        </CerSiteCTA>
    </div>
</template>

<style scoped>
.cer-cs-intro {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 56px;
    padding-top: 64px;
}

.cer-cs-nums {
    margin-top: 56px;
    padding: 28px 36px;
    background: var(--bone-100);
    border: 1px solid var(--line);
    border-radius: 18px;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 24px;
}

.cer-cs-grid3 {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 18px;
}

@media (max-width: 1023px) {
    .cer-cs-intro {
        grid-template-columns: 1fr;
        gap: 24px;
    }

    .cer-cs-grid3 {
        grid-template-columns: 1fr;
    }

    .cer-cs-nums {
        grid-template-columns: 1fr 1fr;
    }
}
</style>
