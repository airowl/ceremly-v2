<script setup lang="ts">
// Checkbox — port di CB (docs/ui/project/screens/guests.jsx): 16x16, check bianco su ink.
import CerIcon from "./CerIcon.vue";

const props = defineProps<{
    modelValue: boolean;
}>();

const emit = defineEmits<{
    "update:modelValue": [value: boolean];
}>();

function toggle() {
    emit("update:modelValue", !props.modelValue);
}
</script>

<template>
    <div
        :style="{
            width: '16px',
            height: '16px',
            borderRadius: '4px',
            border: '1px solid ' + (modelValue ? 'var(--ink)' : 'var(--bone-300)'),
            background: modelValue ? 'var(--ink)' : 'transparent',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--bone-50)',
            flexShrink: 0,
        }"
        @click="toggle"
    >
        <CerIcon v-if="modelValue" name="check" :s="10" :sw="2.5" />
    </div>
</template>
