<script setup lang="ts">
// Card KPI — markup .kpi del mockup (docs/ui/project/screens/events-home.jsx).
const props = withDefaults(
    defineProps<{
        label: string;
        value: string | number;
        sub?: string;
        accent?: boolean;
        clickable?: boolean;
    }>(),
    {
        sub: "",
        accent: false,
        clickable: false,
    },
);

const emit = defineEmits<{
    click: [];
}>();

function onClick() {
    if (props.clickable) {
        emit("click");
    }
}
</script>

<template>
    <div class="kpi" :class="{ accent, static: !clickable }" @click="onClick">
        <div class="k-label">{{ label }}</div>
        <div class="k-num">{{ value }}</div>
        <div v-if="sub" class="k-sub">{{ sub }}</div>
    </div>
</template>
