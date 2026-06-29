<script setup lang="ts">
// Two-column FAQ grid — port of FaqGrid (site-shared.jsx).
defineProps<{
    items: { q: string, a: string }[]
}>()
</script>

<template>
    <div class="cer-faq-grid">
        <div v-for="f in items" :key="f.q" class="cer-card" style="padding: 22px;">
            <div class="serif" style="font-size: 19px; font-weight: 700; letter-spacing: -0.02em;">{{ f.q }}</div>
            <div style="font-size: 14px; margin-top: 8px; color: var(--ink-700); line-height: 1.55;">{{ f.a }}</div>
        </div>
    </div>
</template>

<style scoped>
.cer-faq-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
}

@media (max-width: 720px) {
    .cer-faq-grid {
        grid-template-columns: 1fr;
    }
}
</style>
