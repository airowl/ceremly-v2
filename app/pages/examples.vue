<script setup lang="ts">
// Public site → Product → Examples. Gallery of sample invites, one per
// event type. No real clients: these are product showcases.
import CerMark from '~/components/ceremly/CerMark.vue'
import CerMiniInvite from '~/components/ceremly/CerMiniInvite.vue'
import CerSiteHero from '~/components/ceremly/CerSiteHero.vue'
import CerSiteCTA from '~/components/ceremly/CerSiteCTA.vue'

definePageMeta({ layout: 'public-site', auth: false })

const { t, tm, rt, locale } = useI18n()
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
    ogImage: () => `${baseUrl}/og/examples-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
    twitterImage: () => `${baseUrl}/og/examples-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
    ogType: 'website',
})

// Invite background per event type — consistent with the "For whom" pages.
const sampleBg = ['var(--bone-300)', 'var(--purple)', 'var(--bone-200)', 'var(--orange-soft)']

interface Sample { occ: string, names1: string, names2: string, italic: string, date: string, sub: string, caption: string }
const samples = computed(() => (tm('ceremly.site.esempi.samples') as Sample[]).map((s, i) => ({
    occ: rt(s.occ),
    names1: rt(s.names1),
    names2: rt(s.names2),
    italic: rt(s.italic),
    date: rt(s.date),
    sub: rt(s.sub),
    caption: rt(s.caption),
    bg: sampleBg[i % sampleBg.length]!,
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
                <div v-for="s in samples" :key="s.occ" class="cer-card cer-es-card">
                    <div class="cer-es-invite">
                        <CerMiniInvite
                            :w="240"
                            :h="320"
                            :bg="s.bg"
                            :date="s.date"
                            :italic="s.italic || undefined"
                            :sub="s.sub"
                        >
                            <template #names>
                                {{ s.names1 }}<br>{{ s.names2 }}
                            </template>
                        </CerMiniInvite>
                    </div>
                    <div class="cer-es-body">
                        <span class="cer-tag" style="background: var(--bone-200); border-color: var(--line-strong);">{{ s.occ }}</span>
                        <p class="cer-es-caption">{{ s.caption }}</p>
                    </div>
                </div>
            </div>
        </div>

        <CerSiteCTA :secondary="t('ceremly.site.esempi.ctaSecondary')" :secondary-to="localePath('/pricing')">
            <template #title>
                {{ t('ceremly.site.esempi.ctaTitlePart1') }} <CerMark c="var(--orange)">{{ t('ceremly.site.esempi.ctaTitleMark') }}</CerMark>.
            </template>
        </CerSiteCTA>
    </div>
</template>

<style scoped>
.cer-es-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 24px;
}

.cer-es-card {
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.cer-es-invite {
    display: flex;
    justify-content: center;
    padding: 32px 16px 8px;
    background: var(--bone-100);
    border-bottom: 2px solid var(--ink);
}

.cer-es-body {
    padding: 20px 22px 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
}

.cer-es-caption {
    font-size: 14px;
    line-height: 1.55;
    color: var(--ink-700);
    margin: 0;
}

@media (max-width: 1023px) {
    .cer-es-grid {
        grid-template-columns: repeat(2, 1fr);
    }
}

@media (max-width: 600px) {
    .cer-es-grid {
        grid-template-columns: 1fr;
    }
}
</style>
