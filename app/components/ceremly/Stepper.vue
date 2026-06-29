<script setup lang="ts">
// Stepper — port of the stepper from docs/ui/project/screens/onboarding.jsx:
// numbered circles 22px, checkmark on completed steps, connecting lines.
import CerIcon from "./CerIcon.vue";

defineProps<{
    steps: string[];
    current: number;
}>();
</script>

<template>
    <div class="row" style="gap: 12px;">
        <template v-for="(step, i) in steps" :key="step">
            <div v-if="i > 0" style="flex: 1; height: 1px; background: var(--bone-200);" />
            <div class="row" style="gap: 8px;">
                <div
                    :style="{
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        border: '1px solid ' + (i <= current ? 'var(--ink)' : 'var(--bone-300)'),
                        background: i < current ? 'var(--ink)' : 'transparent',
                        color: i < current ? 'var(--bone-50)' : 'var(--ink-500)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                    }"
                >
                    <CerIcon v-if="i < current" name="check" :s="12" />
                    <template v-else>{{ i + 1 }}</template>
                </div>
                <span
                    class="mono"
                    :style="{
                        fontSize: '11px',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: i <= current ? 'var(--ink)' : 'var(--ink-400)',
                    }"
                >{{ step }}</span>
            </div>
        </template>
    </div>
</template>
