<script setup lang="ts">
// Evidenziatore dietro al testo — port del helper Mark di site-shared.jsx / landing.jsx.
withDefaults(defineProps<{ c?: string }>(), { c: 'var(--purple)' })
</script>

<template>
    <span class="cer-mark" :style="{ background: c }"><slot /></span>
</template>

<style scoped>
.cer-mark {
    color: var(--ink);
    padding: 0 8px;
    border-radius: 6px;
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
}
</style>
