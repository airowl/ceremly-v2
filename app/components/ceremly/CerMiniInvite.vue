<script setup lang="ts">
// Miniature invite card — port of MiniInvite (site-shared.jsx). Used in
// template galleries and use-case heroes. Names via slot #names.
withDefaults(
    defineProps<{
        bg?: string
        color?: string
        date?: string
        italic?: string
        sub?: string
        cta?: string
        w?: number
        h?: number
        rotate?: number
        shadow?: string
    }>(),
    {
        bg: 'var(--purple)',
        color: 'var(--ink)',
        cta: 'Conferma →',
        w: 300,
        h: 400,
        rotate: 0,
        shadow: 'var(--ink)',
    },
)
</script>

<template>
    <div
        class="cer-mini-invite"
        :style="{
            width: `${w}px`,
            height: `${h}px`,
            background: bg,
            color,
            boxShadow: `8px 8px 0 ${shadow}`,
            transform: rotate ? `rotate(${rotate}deg)` : 'none',
        }"
    >
        <div>
            <div v-if="date" class="mono" style="font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.72;">{{ date }}</div>
            <div class="serif" style="font-size: 34px; font-weight: 800; line-height: 1.02; margin-top: 16px; letter-spacing: -0.03em;">
                <slot name="names" /><span v-if="italic" style="font-weight: 400; font-style: italic;"><br>{{ italic }}</span>
            </div>
            <div v-if="sub" style="margin-top: 12px; font-size: 13px; opacity: 0.88; line-height: 1.5;">{{ sub }}</div>
        </div>
        <div class="row" style="justify-content: space-between; align-items: flex-end;">
            <div class="mono" style="font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.72;">RSVP</div>
            <div style="background: var(--orange); color: var(--ink); padding: 8px 14px; border-radius: 999px; font-size: 12px; font-weight: 600; border: 2px solid var(--ink);">{{ cta }}</div>
        </div>
    </div>
</template>

<style scoped>
.cer-mini-invite {
    border-radius: 16px;
    border: 2px solid var(--ink);
    padding: 28px 26px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    flex-shrink: 0;
}
</style>
