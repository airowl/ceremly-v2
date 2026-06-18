<script setup lang="ts">
// Sito pubblico → Risorse → Centro aiuto. Port di CentroAiutoPage (site-resources.jsx).
import CerIcon from '~/components/ceremly/CerIcon.vue'
import CerMark from '~/components/ceremly/CerMark.vue'
import CerSiteHero from '~/components/ceremly/CerSiteHero.vue'
import CerSiteH2 from '~/components/ceremly/CerSiteH2.vue'

definePageMeta({ layout: 'public-site', auth: false })

const { t, tm, rt } = useI18n()
const localePath = useLocalePath()
const runtimeConfig = useRuntimeConfig()
const baseUrl = ((runtimeConfig.public.baseURL as string) || '').replace(/\/$/, '')

const seoTitle = t('ceremly.site.centroAiuto.seoTitle')
const seoDescription = t('ceremly.site.centroAiuto.seoDescription')
useSeoMeta({
    title: seoTitle,
    description: seoDescription,
    ogTitle: seoTitle,
    ogDescription: seoDescription,
    ogImage: `${baseUrl}/ogImage-it.png`,
    ogType: 'website',
})

const catIcons = ['sparkle', 'edit', 'guests', 'check', 'copy', 'settings']
const catCounts = [8, 12, 9, 11, 6, 5]
interface Cat { t: string }
const cats = computed(() => (tm('ceremly.site.centroAiuto.cats') as Cat[]).map((x, i) => ({ icon: catIcons[i] || 'sparkle', count: catCounts[i] ?? 0, t: rt(x.t) })))

const popular = computed(() => (tm('ceremly.site.centroAiuto.popular') as string[]).map(x => rt(x)))
</script>

<template>
    <div>
        <CerSiteHero center :tag="t('ceremly.site.centroAiuto.heroTag')">
            <template #title>
                {{ t('ceremly.site.centroAiuto.heroTitlePart1') }} <CerMark>{{ t('ceremly.site.centroAiuto.heroTitleMark') }}</CerMark>?
            </template>
            <div style="max-width: 560px; margin: 32px auto 0; position: relative;">
                <span style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: var(--ink-400);"><CerIcon name="search" :s="18" /></span>
                <input class="cer-input" :placeholder="t('ceremly.site.centroAiuto.searchPlaceholder')" style="padding: 15px 16px 15px 46px; font-size: 15px;" readonly>
            </div>
        </CerSiteHero>

        <div class="cer-site-wrap" style="padding: 56px 0 0;">
            <div class="cer-ca-grid">
                <div v-for="c in cats" :key="c.t" class="cer-card row" style="padding: 20px 22px; gap: 14px; cursor: pointer;">
                    <div style="width: 42px; height: 42px; border-radius: 10px; background: var(--bone-200); border: 1.5px solid var(--ink); display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <CerIcon :name="c.icon" :s="19" />
                    </div>
                    <div class="col" style="gap: 2px;">
                        <span class="serif" style="font-size: 18px; font-weight: 700; letter-spacing: -0.02em;">{{ c.t }}</span>
                        <span class="small muted">{{ c.count }} {{ t('ceremly.site.centroAiuto.articlesLabel') }}</span>
                    </div>
                    <span class="spacer" />
                    <span style="color: var(--ink-300);"><CerIcon name="chevR" :s="16" /></span>
                </div>
            </div>
        </div>

        <div class="cer-site-wrap" style="padding: 56px 0 72px;">
            <CerSiteH2 :tag="t('ceremly.site.centroAiuto.faqTag')" :title="t('ceremly.site.centroAiuto.faqTitle')" />
            <div class="cer-card" style="overflow: hidden;">
                <div v-for="(q, i) in popular" :key="q" class="row" :style="{ padding: '18px 24px', justifyContent: 'space-between', borderBottom: i < popular.length - 1 ? '1px solid var(--line)' : 'none', cursor: 'pointer' }">
                    <span style="font-size: 15px; font-weight: 500;">{{ q }}</span>
                    <span style="color: var(--ink-300);"><CerIcon name="chevR" :s="16" /></span>
                </div>
            </div>

            <div class="cer-ca-contact">
                <div class="col" style="gap: 4px;">
                    <span class="serif" style="font-size: 22px; font-weight: 700; letter-spacing: -0.02em;">{{ t('ceremly.site.centroAiuto.contactTitle') }}</span>
                    <span style="font-size: 14px; color: var(--bone-200);">{{ t('ceremly.site.centroAiuto.contactSub') }}</span>
                </div>
                <NuxtLink :to="localePath('/contactUs')" class="cer-btn" style="background: var(--orange); flex-shrink: 0;">
                    <CerIcon name="mail" :s="14" /> {{ t('ceremly.site.centroAiuto.contactBtn') }}
                </NuxtLink>
            </div>
        </div>
    </div>
</template>

<style scoped>
.cer-ca-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
}

.cer-ca-contact {
    margin-top: 28px;
    padding: 24px 28px;
    background: var(--ink);
    color: var(--bone-50);
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
}

.cer-ca-contact :deep(a.cer-btn) {
    text-decoration: none;
}

@media (max-width: 1023px) {
    .cer-ca-grid {
        grid-template-columns: 1fr;
    }

    .cer-ca-contact {
        flex-direction: column;
        align-items: flex-start;
    }
}
</style>
