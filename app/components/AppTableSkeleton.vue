<script setup lang="ts">
/**
 * Skeleton placeholder for loading lists/tables.
 * Reproduces the "shape" of the incoming content (bordered chrome + header +
 * rows) instead of a generic spinner → better perceived performance.
 */
withDefaults(defineProps<{
    /** Number of placeholder rows. */
    rows?: number;
    /** Number of columns. */
    columns?: number;
    /** Show a circular avatar in the first cell (people lists). */
    avatar?: boolean;
}>(), {
    rows: 5,
    columns: 4,
    avatar: false,
});
</script>

<template>
    <div class="bg-default rounded-xl border border-default overflow-hidden">
        <!-- Header -->
        <div class="flex items-center gap-4 px-4 py-3 bg-elevated/50 border-b border-default">
            <USkeleton
                v-for="c in columns"
                :key="`h-${c}`"
                class="h-3 rounded"
                :class="c === columns ? 'w-12 ml-auto' : 'w-24'"
            />
        </div>

        <!-- Rows -->
        <div
            v-for="r in rows"
            :key="`r-${r}`"
            class="flex items-center gap-4 px-4 py-4 border-b border-default last:border-b-0"
        >
            <template v-for="c in columns" :key="`c-${r}-${c}`">
                <!-- First cell: optional avatar + two text lines -->
                <div v-if="c === 1" class="flex items-center gap-3 flex-1">
                    <USkeleton v-if="avatar" class="size-9 rounded-full shrink-0" />
                    <div class="space-y-1.5 w-full max-w-48">
                        <USkeleton class="h-3.5 w-3/4 rounded" />
                        <USkeleton v-if="avatar" class="h-3 w-1/2 rounded" />
                    </div>
                </div>
                <!-- Last cell: right-aligned actions -->
                <div v-else-if="c === columns" class="ml-auto flex gap-2">
                    <USkeleton class="size-7 rounded-md" />
                </div>
                <!-- Middle cells -->
                <USkeleton v-else class="h-3.5 w-20 rounded" />
            </template>
        </div>
    </div>
</template>
