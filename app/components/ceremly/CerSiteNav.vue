<script setup lang="ts">
// Nav for public site sub-pages. Unlike the landing nav
// (in-page anchors + waiting list form), links here point to dedicated pages.
// Login/Sign up gated by site-mode as on the landing.
// Below 1023px the links collapse into a hamburger menu.
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { isActiveMode } = useSiteMode()

const links = computed(() => [
    { to: localePath('/how-it-works'), label: t('ceremly.home.nav.howItWorks') },
    { to: localePath('/features'), label: t('ceremly.home.nav.features') },
    { to: localePath('/pricing'), label: t('ceremly.home.nav.pricing') },
    { to: localePath('/examples'), label: t('ceremly.home.nav.examples') },
])

const mobileOpen = ref(false)

// Close the menu on every navigation
watch(() => route.fullPath, () => { mobileOpen.value = false })
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

            <div v-if="isActiveMode" class="row cer-site-nav-cta" style="gap: 10px;">
                <NuxtLink :to="localePath('/login')" class="cer-btn ghost small">{{ t('common.signIn') }}</NuxtLink>
                <NuxtLink :to="localePath('/signup')" class="cer-btn small">{{ t('common.signUp') }}</NuxtLink>
            </div>

            <!-- Hamburger toggle (mobile only) -->
            <button
                type="button"
                class="cer-site-burger"
                :aria-label="mobileOpen ? t('ceremly.home.nav.menuClose') : t('ceremly.home.nav.menuOpen')"
                :aria-expanded="mobileOpen"
                aria-controls="cer-site-mobile-menu"
                @click="mobileOpen = !mobileOpen"
            >
                <svg v-if="!mobileOpen" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                    <path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h18" />
                </svg>
                <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                    <path d="M6 6l12 12" /><path d="M18 6L6 18" />
                </svg>
            </button>
        </div>

        <!-- Mobile panel -->
        <nav
            v-show="mobileOpen"
            id="cer-site-mobile-menu"
            class="cer-site-mobile"
            :aria-label="t('ceremly.home.nav.ariaLabel')"
        >
            <NuxtLink v-for="l in links" :key="l.to" :to="l.to" class="cer-site-mobile-link">{{ l.label }}</NuxtLink>
            <div v-if="isActiveMode" class="cer-site-mobile-cta">
                <NuxtLink :to="localePath('/login')" class="cer-btn ghost" style="justify-content: center;">{{ t('common.signIn') }}</NuxtLink>
                <NuxtLink :to="localePath('/signup')" class="cer-btn" style="justify-content: center;">{{ t('common.signUp') }}</NuxtLink>
            </div>
        </nav>
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

/* Hamburger: nascosto su desktop */
.cer-site-burger {
    display: none;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    border: 1.5px solid var(--ink);
    border-radius: 10px;
    background: var(--bone-50);
    color: var(--ink);
    cursor: pointer;
}

/* Pannello mobile */
.cer-site-mobile {
    display: none;
    flex-direction: column;
    gap: 4px;
    padding: 8px var(--site-pad-x, clamp(20px, 5vw, 72px)) 20px;
    border-top: 1px solid var(--line);
}

.cer-site-mobile-link {
    color: var(--ink-700);
    font-size: 16px;
    font-weight: 500;
    padding: 12px 4px;
    border-bottom: 1px solid var(--line);
}

.cer-site-mobile-link:hover {
    color: var(--ink);
}

.cer-site-mobile-cta {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 14px;
}

@media (max-width: 1023px) {
    .cer-site-nav-links,
    .cer-site-nav-cta {
        display: none;
    }

    .cer-site-burger {
        display: inline-flex;
    }

    .cer-site-mobile {
        display: flex;
    }
}
</style>
