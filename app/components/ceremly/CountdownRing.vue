<script setup lang="ts">
// Countdown circolare — port di CountdownRing (docs/ui/project/screens/invite-mobile.jsx):
// due cerchi SVG, progress = 1 - days/365 clampato 0..1, numero display + label mono.
// Lo stroke usa --tpl-accent (se impostata da InviteRenderer) con fallback --wine.

const { t } = useI18n();

const props = withDefaults(
    defineProps<{
        days: number;
        size?: number;
        label?: string;
    }>(),
    {
        size: 132,
        label: undefined,
    },
);

const resolvedLabel = computed(() => props.label ?? t("ceremly.countdown.daysLabel"));

// Geometria del mockup (size 132 → r 56), scalata proporzionalmente.
const scale = computed(() => props.size / 132);
const r = computed(() => 56 * scale.value);
const c = computed(() => 2 * Math.PI * r.value);
const progress = computed(() => Math.min(1, Math.max(0, 1 - props.days / 365)));
</script>

<template>
    <div :style="{ position: 'relative', width: size + 'px', height: size + 'px' }">
        <svg :width="size" :height="size" aria-hidden="true">
            <circle
                :cx="size / 2"
                :cy="size / 2"
                :r="r"
                fill="none"
                stroke="var(--bone-200)"
                stroke-width="1.5"
            />
            <circle
                :cx="size / 2"
                :cy="size / 2"
                :r="r"
                fill="none"
                stroke="var(--tpl-accent, var(--wine))"
                stroke-width="1.5"
                :stroke-dasharray="c"
                :stroke-dashoffset="c * (1 - progress)"
                :transform="`rotate(-90 ${size / 2} ${size / 2})`"
                stroke-linecap="round"
            />
        </svg>
        <div
            :style="{
                position: 'absolute',
                inset: '0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
            }"
        >
            <div
                :style="{
                    fontFamily: 'var(--font-display)',
                    fontSize: Math.round(36 * scale) + 'px',
                    color: 'var(--wine-deep)',
                    lineHeight: 1,
                }"
            >
                {{ days }}
            </div>
            <div
                class="mono"
                :style="{
                    fontFamily: 'var(--font-mono)',
                    fontSize: Math.max(8, Math.round(9 * scale)) + 'px',
                    letterSpacing: '0.14em',
                    color: 'var(--ink-500)',
                    textTransform: 'uppercase',
                    marginTop: '4px',
                }"
            >
                {{ resolvedLabel }}
            </div>
        </div>
    </div>
</template>
