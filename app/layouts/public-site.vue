<script setup lang="ts">
// Layout for public site sub-pages (Product · For whom · Resources ·
// Ceremly). Shared nav + content + footer. Content goes inside .l-wrap
// (max-width 1400 centred) in each individual page.
import CerSiteNav from '~/components/ceremly/CerSiteNav.vue'
import CerSiteFooter from '~/components/ceremly/CerSiteFooter.vue'
</script>

<template>
    <div class="cer cer-site">
        <CerSiteNav />
        <main>
            <slot />
        </main>
        <CerSiteFooter />
    </div>
</template>

<style scoped>
.cer-site {
    --site-pad-x: clamp(20px, 5vw, 72px);
    min-height: 100vh;
    background: var(--bone);
}

/* Page sections use .l-wrap to centre content at 1400px */
.cer-site :deep(.l-wrap) {
    max-width: 1400px;
    margin: 0 auto;
}

/* Anchor offset compensated for the sticky nav */
.cer-site :deep(.l-target) {
    scroll-margin-top: 84px;
}
</style>
