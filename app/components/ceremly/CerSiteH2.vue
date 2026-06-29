<script setup lang="ts">
// In-page section heading — port of SiteH2 (site-shared.jsx).
// Title via slot #title (can contain <CerMark>) or prop title.
withDefaults(
    defineProps<{
        tag?: string
        tagStyle?: Record<string, string>
        title?: string
        sub?: string
        center?: boolean
    }>(),
    {
        center: false,
    },
)
</script>

<template>
    <div class="cer-site-h2" :style="{ textAlign: center ? 'center' : 'left' }">
        <span
            v-if="tag"
            class="cer-tag"
            :style="{ display: 'inline-flex', ...(tagStyle || {}) }"
        >{{ tag }}</span>
        <h2 class="serif cer-site-h2-title">
            <slot name="title">{{ title }}</slot>
        </h2>
        <p
            v-if="sub || $slots.sub"
            class="cer-site-h2-sub"
            :style="{ margin: center ? '14px auto 0' : '14px 0 0' }"
        ><slot name="sub">{{ sub }}</slot></p>
    </div>
</template>

<style scoped>
.cer-site-h2 {
    margin-bottom: 40px;
}

.cer-site-h2-title {
    font-size: clamp(30px, 4.2vw, 42px);
    font-weight: 800;
    line-height: 1.05;
    letter-spacing: -0.035em;
    margin: 14px 0 0;
}

.cer-site-h2-sub {
    font-size: 15px;
    color: var(--ink-700);
    line-height: 1.6;
    max-width: 560px;
}
</style>
