<script setup lang="ts">
const { t } = useI18n()

const stats = computed(() => [
    {
        label: t('dashboard.home.stats.totalEvents'),
        value: '24',
        change: '+2%',
        changeLabel: t('dashboard.home.stats.vsYesterday'),
        changePositive: true,
        icon: 'i-lucide-calendar',
        iconBg: 'bg-blue-50',
        iconColor: 'text-blue-500',
    },
    {
        label: t('dashboard.home.stats.activeInvitations'),
        value: '1,200',
        change: '+15%',
        changeLabel: t('dashboard.home.stats.vsYesterday'),
        changePositive: true,
        icon: 'i-lucide-mail',
        iconBg: 'bg-primary-50',
        iconColor: 'text-primary',
    },
    {
        label: t('dashboard.home.stats.avgResponseRate'),
        value: '85%',
        change: '+5%',
        changeLabel: t('dashboard.home.stats.vsYesterday'),
        changePositive: true,
        icon: 'i-lucide-bar-chart-3',
        iconBg: 'bg-purple-50',
        iconColor: 'text-purple-500',
    },
])
</script>

<template>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <UCard
            v-for="(stat, index) in stats"
            :key="index"
            class="transition-transform duration-200 hover:scale-[1.02]"
        >
            <div class="flex items-center justify-between mb-4">
                <div
                    class="w-10 h-10 rounded-lg flex items-center justify-center"
                    :class="stat.iconBg"
                >
                    <UIcon :name="stat.icon" class="size-5" :class="stat.iconColor" />
                </div>
                <UBadge
                    :color="stat.changePositive ? 'success' : 'error'"
                    variant="subtle"
                    size="xs"
                    class="font-bold"
                >
                    {{ stat.change }} {{ stat.changeLabel }}
                </UBadge>
            </div>
            <p class="text-sm text-muted font-medium">{{ stat.label }}</p>
            <p class="text-3xl font-black text-highlighted mt-1">{{ stat.value }}</p>
        </UCard>
    </div>
</template>
