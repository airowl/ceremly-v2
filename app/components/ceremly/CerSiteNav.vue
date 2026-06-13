<script setup lang="ts">
// Nav delle sotto-pagine del sito pubblico. A differenza della nav della landing
// (ancore in-pagina + form lista d'attesa), qui i link puntano alle pagine
// dedicate. Login/Registrati gated dal site-mode come sulla landing.
const { t } = useI18n()
const localePath = useLocalePath()
const { isActiveMode } = useSiteMode()

const links = computed(() => [
    { to: localePath('/come-funziona'), label: t('ceremly.home.nav.howItWorks') },
    { to: localePath('/funzionalita'), label: t('ceremly.home.nav.features') },
    { to: localePath('/prezzi'), label: t('ceremly.home.nav.pricing') },
    { to: localePath('/esempi'), label: t('ceremly.home.nav.examples') },
])
</script>

<template>
    <header class="cer-site-nav">
        <div class="cer-site-nav-inner">
            <NuxtLink :to="localePath('/')" class="row cer-site-logo" style="gap: 7px;">
                <span class="serif" style="font-size: 28px; font-weight: 800; letter-spacing: -0.03em;">Ceremly</span>
                <span style="width: 7px; height: 7px; border-radius: 50%; background: var(--orange); display: inline-block;" />
            </NuxtLink>
            <nav class="row cer-site-nav-links" style="gap: 32px; font-size: 14px; color: var(--ink-700); font-weight: 500;" :aria-label="t('ceremly.home.nav.ariaLabel')">
                <NuxtLink v-for="l in links" :key="l.to" :to="l.to" class="cer-site-anchor">{{ l.label }}</NuxtLink>
            </nav>
            <div v-if="isActiveMode" class="row" style="gap: 10px;">
                <NuxtLink :to="localePath('/login')" class="cer-btn ghost small">{{ t('common.signIn') }}</NuxtLink>
                <NuxtLink :to="localePath('/signup')" class="cer-btn small">{{ t('common.signUp') }}</NuxtLink>
            </div>
        </div>
    </header>
</template>

<style scoped>
.cer-site-nav {
    border-bottom: 1px solid var(--line);
    background: var(--bone);
    position: sticky;
    top: 0;
    z-index: 5;
}

.cer-site-nav-inner {
    max-width: 1400px;
    margin: 0 auto;
    padding: 20px var(--site-pad-x, clamp(20px, 5vw, 72px));
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.cer-site-nav a {
    text-decoration: none;
}

.cer-site-logo {
    color: inherit;
}

.cer-site-anchor {
    color: inherit;
    cursor: pointer;
}

.cer-site-anchor:hover {
    color: var(--ink);
}

@media (max-width: 1023px) {
    .cer-site-nav-links {
        display: none;
    }
}
</style>
