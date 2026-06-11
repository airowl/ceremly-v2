<script setup lang="ts">
/**
 * Skeleton placeholder per liste/tabelle in caricamento.
 * Riproduce la "forma" del contenuto in arrivo (chrome bordata + header +
 * righe) invece di uno spinner generico → migliore percezione di velocità.
 */
withDefaults(defineProps<{
    /** Numero di righe placeholder. */
    rows?: number;
    /** Numero di colonne. */
    columns?: number;
    /** Mostra un avatar circolare nella prima cella (liste di persone). */
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

        <!-- Righe -->
        <div
            v-for="r in rows"
            :key="`r-${r}`"
            class="flex items-center gap-4 px-4 py-4 border-b border-default last:border-b-0"
        >
            <template v-for="c in columns" :key="`c-${r}-${c}`">
                <!-- Prima cella: avatar opzionale + due righe di testo -->
                <div v-if="c === 1" class="flex items-center gap-3 flex-1">
                    <USkeleton v-if="avatar" class="size-9 rounded-full shrink-0" />
                    <div class="space-y-1.5 w-full max-w-48">
                        <USkeleton class="h-3.5 w-3/4 rounded" />
                        <USkeleton v-if="avatar" class="h-3 w-1/2 rounded" />
                    </div>
                </div>
                <!-- Ultima cella: azioni allineate a destra -->
                <div v-else-if="c === columns" class="ml-auto flex gap-2">
                    <USkeleton class="size-7 rounded-md" />
                </div>
                <!-- Celle intermedie -->
                <USkeleton v-else class="h-3.5 w-20 rounded" />
            </template>
        </div>
    </div>
</template>
