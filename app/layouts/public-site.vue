<script setup lang="ts">
// Layout delle sotto-pagine del sito pubblico (Prodotto · Per chi · Risorse ·
// Ceremly). Nav + contenuto + footer condivisi. Il contenuto va dentro .l-wrap
// (max-width 1400 centrato) nelle singole pagine.
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

/* Le sezioni delle pagine usano .l-wrap per centrare il contenuto a 1400px */
.cer-site :deep(.l-wrap) {
    max-width: 1400px;
    margin: 0 auto;
}

/* Ancora compensata dalla nav sticky */
.cer-site :deep(.l-target) {
    scroll-margin-top: 84px;
}
</style>
