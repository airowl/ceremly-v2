<script setup lang="ts">
// Shared footer for the public site (landing + sub-pages). The four columns
// (Prodotto · Per chi · Risorse · Ceremly) link to the dedicated pages.
const { t, locale, setLocale } = useI18n()
const localePath = useLocalePath()

interface FooterItem { label: string, to: string }
interface FooterCol { t: string, items: FooterItem[] }

const footerCols = computed<FooterCol[]>(() => [
    {
        t: t('ceremly.home.footer.cols.product.title'),
        items: [
            { label: t('ceremly.home.nav.howItWorks'), to: localePath('/how-it-works') },
            { label: t('ceremly.home.nav.features'), to: localePath('/features') },
            { label: t('ceremly.home.footer.cols.product.inviteTemplates'), to: localePath('/templates') },
            { label: t('ceremly.home.nav.pricing'), to: localePath('/pricing') },
            { label: t('ceremly.home.footer.cols.product.realExamples'), to: localePath('/examples') },
        ],
    },
    {
        t: t('ceremly.home.footer.cols.forWho.title'),
        items: [
            { label: t('ceremly.home.footer.cols.forWho.weddings'), to: localePath('/weddings') },
            { label: t('ceremly.home.footer.cols.forWho.graduations'), to: localePath('/graduations') },
            { label: t('ceremly.home.footer.cols.forWho.baptisms'), to: localePath('/baptisms') },
            { label: t('ceremly.home.footer.cols.forWho.birthdays'), to: localePath('/birthdays') },
            { label: t('ceremly.home.footer.cols.forWho.weddingPlanners'), to: localePath('/wedding-planner') },
        ],
    },
    {
        t: t('ceremly.home.footer.cols.resources.title'),
        items: [
            { label: t('ceremly.home.footer.cols.resources.rsvpGuide'), to: localePath('/rsvp-guide') },
            { label: t('ceremly.home.footer.cols.resources.helpCenter'), to: localePath('/help-center') },
            { label: t('ceremly.home.footer.cols.resources.serviceStatus'), to: localePath('/status') },
            { label: t('ceremly.home.footer.cols.resources.changelog'), to: localePath('/changelog') },
            { label: t('ceremly.home.footer.cols.resources.apiPartners'), to: localePath('/api') },
        ],
    },
    {
        t: 'Ceremly',
        items: [
            { label: t('ceremly.home.footer.cols.company.about'), to: localePath('/about') },
            { label: t('ceremly.home.footer.cols.company.contact'), to: localePath('/contact') },
            { label: t('ceremly.home.footer.cols.company.terms'), to: localePath('/legal/tos') },
            { label: t('ceremly.home.footer.cols.company.privacy'), to: localePath('/legal/privacy') },
            { label: t('ceremly.home.footer.cols.company.cookies'), to: localePath('/legal/cookie') },
        ],
    },
])
</script>

<template>
    <footer class="cer-site-footer-wrap" style="background: var(--bone);">
        <div class="cer-site-footer">
            <div class="cer-site-footer-grid">
                <div>
                    <NuxtLink :to="localePath('/')" class="row cer-site-footer-logo" style="gap: 7px;">
                        <span class="serif" style="font-size: 32px; font-weight: 800; letter-spacing: -0.03em;">Ceremly</span>
                        <span style="width: 7px; height: 7px; border-radius: 50%; background: var(--orange); display: inline-block;" />
                    </NuxtLink>
                    <p style="font-size: 14px; color: var(--ink-500); line-height: 1.6; margin-top: 12px; max-width: 280px;">
                        {{ t('ceremly.home.footer.tagline') }}
                    </p>
                    <div class="mono" style="font-size: 12px; color: var(--ink-400); margin-top: 18px;">
                        {{ t('ceremly.home.footer.copyright') }}
                    </div>
                </div>
                <div v-for="c in footerCols" :key="c.t" class="col" style="gap: 10px;">
                    <div class="mono" style="font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-400);">{{ c.t }}</div>
                    <NuxtLink v-for="it in c.items" :key="it.label" :to="it.to" class="cer-site-footer-link">{{ it.label }}</NuxtLink>
                </div>
            </div>
            <div style="height: 1px; background: var(--line); margin: 40px 0 16px;" />
            <div class="row cer-site-footer-bottom" style="justify-content: space-between; font-size: 13px; color: var(--ink-500);">
                <span>{{ t('ceremly.home.footer.legal') }}</span>
                <span class="row" style="gap: 14px;" :aria-label="t('common.language')">
                    <span
                        role="button"
                        tabindex="0"
                        style="cursor: pointer;"
                        :style="{ fontWeight: locale.startsWith('it') ? 700 : 400, color: locale.startsWith('it') ? 'var(--ink)' : 'var(--ink-400)' }"
                        @click="setLocale('it')"
                        @keydown.enter="setLocale('it')"
                    >IT</span>
                    <span style="color: var(--ink-300);">·</span>
                    <span
                        role="button"
                        tabindex="0"
                        style="cursor: pointer;"
                        :style="{ fontWeight: locale.startsWith('en') ? 700 : 400, color: locale.startsWith('en') ? 'var(--ink)' : 'var(--ink-400)' }"
                        @click="setLocale('en')"
                        @keydown.enter="setLocale('en')"
                    >EN</span>
                </span>
            </div>
        </div>
    </footer>
</template>

<style scoped>
.cer-site-footer {
    max-width: 1400px;
    margin: 0 auto;
    padding: 64px var(--site-pad-x, clamp(20px, 5vw, 72px)) 40px;
}

.cer-site-footer-logo {
    color: inherit;
    text-decoration: none;
}

.cer-site-footer-grid {
    display: grid;
    grid-template-columns: 1.4fr repeat(4, 1fr);
    gap: 48px;
}

.cer-site-footer-link {
    font-size: 14px;
    color: var(--ink-700);
    text-decoration: none;
}

.cer-site-footer-link:hover {
    color: var(--ink);
}

@media (max-width: 1023px) {
    .cer-site-footer-grid {
        grid-template-columns: 1fr 1fr;
        gap: 32px;
    }
}

@media (max-width: 640px) {
    .cer-site-footer-grid {
        grid-template-columns: 1fr;
    }

    .cer-site-footer-bottom {
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
    }
}
</style>
