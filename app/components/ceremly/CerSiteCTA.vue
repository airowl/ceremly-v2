<script setup lang="ts">
// Banda CTA scura — port di SiteCTA (site-shared.jsx). Versione compatta della
// CTA della landing. Titolo via slot #title (con default), CTA primaria gated
// dal site-mode come la landing (active → /signup, waitinglist → form lista).
import CerIcon from '~/components/ceremly/CerIcon.vue'
import CerMark from '~/components/ceremly/CerMark.vue'

const props = withDefaults(
    defineProps<{
        sub?: string
        primary?: string
        secondary?: string
        secondaryTo?: string
    }>(),
    {},
)

const { t } = useI18n()
const localePath = useLocalePath()
const { isActiveMode } = useSiteMode()

const primaryLabel = computed(() => props.primary || t('ceremly.site.shared.ctaPrimary'))
// In waitinglist mode la primaria porta al form lista d'attesa sulla landing.
const primaryTo = computed(() => isActiveMode.value ? localePath('/signup') : `${localePath('/')}#lista-attesa`)
</script>

<template>
    <section class="cer-site-cta">
        <div class="cer-site-wrap">
            <h2 class="serif cer-site-cta-title">
                <slot name="title">
                    {{ t('ceremly.site.shared.ctaDefaultTitlePart1') }} <CerMark c="var(--orange)">{{ t('ceremly.site.shared.ctaDefaultTitleMark') }}</CerMark>.
                </slot>
            </h2>
            <p v-if="sub" class="cer-site-cta-sub">{{ sub }}</p>
            <div class="row cer-site-cta-actions">
                <NuxtLink :to="primaryTo" class="cer-btn" style="background: var(--bone-50); color: var(--ink); padding: 14px 24px; font-size: 14px;">
                    <CerIcon name="sparkle" :s="14" /> {{ primaryLabel }}
                </NuxtLink>
                <NuxtLink
                    v-if="secondary"
                    :to="secondaryTo || localePath('/examples')"
                    class="cer-btn"
                    style="background: var(--purple); color: var(--ink); padding: 14px 24px; font-size: 14px;"
                >{{ secondary }}</NuxtLink>
            </div>
        </div>
    </section>
</template>

<style scoped>
.cer-site-cta {
    padding-top: 80px;
    padding-bottom: 80px;
    background: var(--ink);
    color: #fff;
    text-align: center;
}

.cer-site-cta-title {
    font-size: clamp(34px, 5vw, 52px);
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.04em;
    margin: 0 auto;
    max-width: 820px;
}

.cer-site-cta-sub {
    font-size: 16px;
    color: rgba(255, 255, 255, 0.85);
    max-width: 480px;
    margin: 20px auto 0;
    line-height: 1.55;
}

.cer-site-cta-actions {
    justify-content: center;
    gap: 12px;
    margin-top: 32px;
    flex-wrap: wrap;
}

.cer-site-cta a.cer-btn {
    text-decoration: none;
}
</style>
