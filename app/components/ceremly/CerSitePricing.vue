<script setup lang="ts">
// Sezione prezzi condivisa (landing #prezzi + pagina /prezzi). Estratta da
// index.vue per evitare duplicazione: il mockup PrezziPage rende <LandingPricing/>.
import CerIcon from '~/components/ceremly/CerIcon.vue'

const { t } = useI18n()
const localePath = useLocalePath()
const { isActiveMode } = useSiteMode()
const NuxtLink = resolveComponent('NuxtLink')

interface Tier {
    n: string
    p: string
    sub: string
    desc: string
    feats: string[]
    cta: string
    kind?: 'ghost'
    highlight?: boolean
    tag?: string
}

const tiers = computed<Tier[]>(() => [
    {
        n: t('ceremly.home.pricing.free.name'),
        p: '0',
        sub: t('ceremly.home.pricing.free.sub'),
        desc: t('ceremly.home.pricing.free.desc'),
        feats: [
            t('ceremly.home.pricing.free.feat1'),
            t('ceremly.home.pricing.free.feat2'),
            t('ceremly.home.pricing.free.feat3'),
            t('ceremly.home.pricing.free.feat4'),
            t('ceremly.home.pricing.free.feat5'),
        ],
        cta: t('ceremly.home.pricing.free.cta'),
        kind: 'ghost',
    },
    {
        n: t('ceremly.home.pricing.celebration.name'),
        p: '39',
        sub: t('ceremly.home.pricing.celebration.sub'),
        desc: t('ceremly.home.pricing.celebration.desc'),
        feats: [
            t('ceremly.home.pricing.celebration.feat1'),
            t('ceremly.home.pricing.celebration.feat2'),
            t('ceremly.home.pricing.celebration.feat3'),
            t('ceremly.home.pricing.celebration.feat4'),
            t('ceremly.home.pricing.celebration.feat5'),
            t('ceremly.home.pricing.celebration.feat6'),
        ],
        cta: t('ceremly.home.pricing.celebration.cta'),
        highlight: true,
        tag: t('ceremly.home.pricing.celebration.tag'),
    },
    {
        n: t('ceremly.home.pricing.atelier.name'),
        p: '24',
        sub: t('ceremly.home.pricing.atelier.sub'),
        desc: t('ceremly.home.pricing.atelier.desc'),
        feats: [
            t('ceremly.home.pricing.atelier.feat1'),
            t('ceremly.home.pricing.atelier.feat2'),
            t('ceremly.home.pricing.atelier.feat3'),
            t('ceremly.home.pricing.atelier.feat4'),
            t('ceremly.home.pricing.atelier.feat5'),
            t('ceremly.home.pricing.atelier.feat6'),
        ],
        cta: t('ceremly.home.pricing.atelier.cta'),
        kind: 'ghost',
    },
])

const atelierName = computed(() => t('ceremly.home.pricing.atelier.name'))

function tierTo(tier: Tier): string {
    if (!isActiveMode.value) return `${localePath('/')}#lista-attesa`
    if (tier.kind === 'ghost' && tier.n === atelierName.value) return localePath('/contactUs')
    return localePath('/signup')
}
</script>

<template>
    <div class="cer-pricing">
        <div style="text-align: center; margin-bottom: 52px;">
            <span class="cer-tag" style="background: var(--wine-soft); color: var(--purple-ink); border-color: transparent; display: inline-flex;">{{ t('ceremly.home.nav.pricing') }}</span>
            <h2 class="serif cer-pricing-h2" style="font-weight: 800; line-height: 1.0; margin: 16px 0 12px; letter-spacing: -0.035em;">
                <span style="color: var(--purple);">{{ t('ceremly.home.pricing.titleMark') }}</span>, {{ t('ceremly.home.pricing.titlePart1') }}<br>{{ t('ceremly.home.pricing.titlePart2') }}
            </h2>
            <p style="font-size: 16px; color: var(--ink-700); max-width: 540px; margin: 0 auto; line-height: 1.6;">
                {{ t('ceremly.home.pricing.subtitle') }}
            </p>
        </div>

        <div class="cer-price-grid">
            <div
                v-for="tier in tiers"
                :key="tier.n"
                class="cer-tier"
                :style="{
                    background: tier.highlight ? 'var(--ink)' : 'var(--bone-50)',
                    color: tier.highlight ? '#fff' : 'var(--ink)',
                    boxShadow: tier.highlight ? '8px 8px 0 var(--ink)' : 'none',
                    marginTop: tier.highlight ? '-8px' : '8px',
                }"
            >
                <div v-if="tier.tag" style="position: absolute; top: -14px; left: 28px; background: var(--orange); color: var(--ink); font-size: 12px; padding: 4px 12px; border-radius: 999px; font-family: var(--font-mono); font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; border: 2px solid var(--ink);">{{ tier.tag }}</div>
                <div class="serif" style="font-size: 28px; font-weight: 800; letter-spacing: -0.02em;">{{ tier.n }}</div>
                <div style="margin-top: 14px; display: flex; align-items: baseline; gap: 6px;">
                    <span class="serif" style="font-size: 66px; font-weight: 800; line-height: 1; letter-spacing: -0.03em;">€{{ tier.p }}</span>
                    <span :style="{ fontSize: '13px', color: tier.highlight ? 'var(--blue-soft)' : 'var(--ink-500)' }">{{ tier.sub }}</span>
                </div>
                <div :style="{ fontSize: '13px', marginTop: '12px', lineHeight: 1.55, color: tier.highlight ? 'rgba(255,255,255,0.85)' : 'var(--ink-700)', minHeight: '58px' }">
                    {{ tier.desc }}
                </div>
                <div :style="{ height: '1px', background: tier.highlight ? 'rgba(255,255,255,0.25)' : 'var(--line)', margin: '20px 0' }" />
                <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 11px;">
                    <li
                        v-for="f in tier.feats"
                        :key="f"
                        class="row"
                        :style="{ gap: '10px', fontSize: '14px', color: tier.highlight ? 'rgba(255,255,255,0.92)' : 'var(--ink-700)' }"
                    >
                        <span :style="{ color: tier.highlight ? 'var(--blue)' : 'var(--purple)' }"><CerIcon name="check" :s="15" /></span> {{ f }}
                    </li>
                </ul>
                <NuxtLink
                    :to="tierTo(tier)"
                    class="cer-btn"
                    :class="{ ghost: tier.kind === 'ghost' }"
                    :style="{
                        width: '100%',
                        justifyContent: 'center',
                        marginTop: '28px',
                        padding: '13px 16px',
                        background: tier.highlight ? 'var(--orange)' : undefined,
                        color: tier.highlight ? 'var(--ink)' : undefined,
                        borderColor: 'var(--ink)',
                    }"
                >
                    {{ isActiveMode ? tier.cta : t('ceremly.home.waitingList.submit') }} <CerIcon name="chevR" :s="13" />
                </NuxtLink>
            </div>
        </div>

        <div class="row" style="justify-content: center; gap: 20px; margin-top: 36px; font-size: 13px; color: var(--ink-500); flex-wrap: wrap;">
            <span class="row" style="gap: 6px;"><CerIcon name="check" :s="14" /> {{ t('ceremly.home.pricing.trust1') }}</span>
            <span class="row" style="gap: 6px;"><CerIcon name="check" :s="14" /> {{ t('ceremly.home.pricing.trust2') }}</span>
            <span class="row" style="gap: 6px;"><CerIcon name="check" :s="14" /> {{ t('ceremly.home.pricing.trust3') }}</span>
        </div>
    </div>
</template>

<style scoped>
.cer-pricing a.cer-btn {
    text-decoration: none;
}

.cer-pricing-h2 {
    font-size: clamp(34px, 5.5vw, 56px);
}

.cer-price-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 18px;
    align-items: start;
}

.cer-tier {
    border: 2px solid var(--ink);
    border-radius: 16px;
    padding: 32px;
    position: relative;
}

@media (max-width: 1023px) {
    .cer-price-grid {
        grid-template-columns: 1fr;
    }
}
</style>
