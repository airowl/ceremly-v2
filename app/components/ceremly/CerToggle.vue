<script setup lang="ts">
// Toggle — port di Toggle (docs/ui/project/screens/rsvp-builder.jsx):
// track 32x18 ink/sage, pallino bianco 14px.
const props = defineProps<{
    modelValue: boolean;
    label?: string;
}>();

const emit = defineEmits<{
    "update:modelValue": [value: boolean];
}>();

function toggle() {
    emit("update:modelValue", !props.modelValue);
}
</script>

<template>
    <div class="row" style="gap: 6px; cursor: pointer; user-select: none;" @click="toggle">
        <div
            :style="{
                width: '32px',
                height: '18px',
                borderRadius: '999px',
                background: modelValue ? 'var(--ink)' : 'var(--bone-300)',
                position: 'relative',
                flexShrink: 0,
                transition: 'background 150ms ease',
            }"
        >
            <div
                :style="{
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    background: '#fff',
                    position: 'absolute',
                    top: '2px',
                    left: modelValue ? '16px' : '2px',
                    transition: 'left 150ms ease',
                }"
            />
        </div>
        <span v-if="label" class="small">{{ label }}</span>
    </div>
</template>
