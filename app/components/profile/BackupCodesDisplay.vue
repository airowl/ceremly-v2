<script setup lang="ts">
defineProps<{
    codes: string[]
}>()
</script>

<template>
    <div class="grid grid-cols-2 gap-2 p-4 bg-muted/30 rounded-lg">
        <div
            v-for="(code, index) in codes"
            :key="index"
            class="p-2 bg-background rounded font-mono text-sm text-center select-all"
        >
            {{ code }}
        </div>
    </div>
</template>
