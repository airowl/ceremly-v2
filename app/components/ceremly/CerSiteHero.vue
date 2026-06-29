<script setup lang="ts">
// Hero for public site sub-pages — port of SiteHero (site-shared.jsx).
// Full-bleed band with content centered at 1400px (.cer-site-wrap). Title via
// slot #title (can contain <br> and <CerMark>), subtitle via prop or slot #sub,
// extra content (chips, search…) in the default slot.
withDefaults(
    defineProps<{
        tag?: string
        tagStyle?: Record<string, string>
        sub?: string
        center?: boolean
    }>(),
    {
        center: false,
    },
)
</script>

<template>
    <section class="cer-site-hero" :style="{ textAlign: center ? 'center' : 'left' }">
        <div class="cer-site-wrap">
            <span
                v-if="tag"
                class="cer-tag"
                :style="{ background: 'var(--wine-soft)', color: 'var(--purple-ink)', borderColor: 'transparent', display: 'inline-flex', ...(tagStyle || {}) }"
            >{{ tag }}</span>
            <h1
                class="serif cer-site-hero-h1"
                :style="{ margin: center ? '18px auto 0' : '18px 0 0' }"
            ><slot name="title" /></h1>
            <p
                v-if="sub || $slots.sub"
                class="cer-site-hero-sub"
                :style="{ margin: center ? '20px auto 0' : '20px 0 0' }"
            ><slot name="sub">{{ sub }}</slot></p>
            <slot />
        </div>
    </section>
</template>

<style scoped>
.cer-site-hero {
    padding-top: 72px;
    padding-bottom: 64px;
    border-bottom: 1px solid var(--line);
}

.cer-site-hero-h1 {
    font-size: clamp(38px, 6vw, 62px);
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.04em;
    max-width: 900px;
}

.cer-site-hero-sub {
    font-size: 17px;
    color: var(--ink-700);
    line-height: 1.6;
    max-width: 620px;
}
</style>
