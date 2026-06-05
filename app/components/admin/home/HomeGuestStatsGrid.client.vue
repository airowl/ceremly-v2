<script setup lang="ts">
defineProps<{
    total: number
    confirmed: number
    declined: number
    pending: number
    isLoading: boolean
}>()

const stats = computed(() => [
    {
        label: 'Totale Invitati',
        key: 'total',
        icon: 'i-lucide-users',
        iconBg: 'bg-primary/10',
        iconColor: 'text-primary',
        borderClass: '',
    },
    {
        label: 'Confermati (Sì)',
        key: 'confirmed',
        icon: 'i-lucide-circle-check',
        iconBg: 'bg-emerald-500/10',
        iconColor: 'text-emerald-500',
        borderClass: 'border-l-4 border-l-emerald-500',
    },
    {
        label: 'Rifiutati (No)',
        key: 'declined',
        icon: 'i-lucide-circle-x',
        iconBg: 'bg-red-500/10',
        iconColor: 'text-red-500',
        borderClass: 'border-l-4 border-l-red-500',
    },
    {
        label: 'In attesa',
        key: 'pending',
        icon: 'i-lucide-clock',
        iconBg: 'bg-amber-500/10',
        iconColor: 'text-amber-500',
        borderClass: 'border-l-4 border-l-amber-500',
    },
])
</script>

<template>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <template v-if="isLoading">
            <USkeleton v-for="i in 4" :key="i" class="h-[104px] w-full rounded-xl" />
        </template>

        <template v-else>
            <div
                v-for="stat in stats"
                :key="stat.key"
                class="bg-default p-5 rounded-xl border border-default"
                :class="stat.borderClass"
            >
                <div class="flex justify-between items-start mb-3">
                    <div class="p-2 rounded-lg" :class="stat.iconBg">
                        <UIcon :name="stat.icon" class="size-5" :class="stat.iconColor" />
                    </div>
                </div>
                <p class="text-muted text-xs font-bold uppercase tracking-widest">{{ stat.label }}</p>
                <p class="text-3xl font-black text-highlighted mt-1">
                    {{ stat.key === 'total' ? total : stat.key === 'confirmed' ? confirmed : stat.key === 'declined' ? declined : pending }}
                </p>
            </div>
        </template>
    </div>
</template>
