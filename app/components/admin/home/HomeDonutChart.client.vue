<script setup lang="ts">
const VisSingleContainer = defineAsyncComponent(() => import('@unovis/vue').then(m => m.VisSingleContainer))
const VisDonut = defineAsyncComponent(() => import('@unovis/vue').then(m => m.VisDonut))

const { t } = useI18n()

type DonutDatum = { label: string; value: number; color: string }

const data = computed<DonutDatum[]>(() => [
    { label: t('dashboard.home.charts.accepted'), value: 840, color: 'var(--ui-primary)' },
    { label: t('dashboard.home.charts.declined'), value: 120, color: '#64748b' },
    { label: t('dashboard.home.charts.pending'), value: 240, color: '#bae6fd' },
])

const total = computed(() => data.value.reduce((sum, d) => sum + d.value, 0))

const value = (d: DonutDatum) => d.value
const color = (d: DonutDatum) => d.color

function percentage(val: number) {
    return Math.round((val / total.value) * 100)
}
</script>

<template>
    <UCard class="h-full">
        <template #header>
            <p class="text-base font-semibold text-highlighted">
                {{ t('dashboard.home.charts.inviteeStatus') }}
            </p>
        </template>

        <div class="flex flex-col items-center">
            <div class="relative">
                <VisSingleContainer :data="data" :height="192" :width="192">
                    <VisDonut
                        :value="value"
                        :color="color"
                        :arc-width="20"
                        :pad-angle="0.02"
                        :corner-radius="4"
                    />
                </VisSingleContainer>
                <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span class="text-2xl font-black text-highlighted">{{ total.toLocaleString() }}</span>
                    <span class="text-xs font-bold text-muted uppercase tracking-widest">{{ t('dashboard.home.charts.total') }}</span>
                </div>
            </div>

            <div class="mt-6 w-full space-y-3">
                <div
                    v-for="item in data"
                    :key="item.label"
                    class="flex items-center justify-between"
                >
                    <div class="flex items-center gap-2">
                        <span
                            class="w-3 h-3 rounded-full shrink-0"
                            :style="{ backgroundColor: item.color }"
                        />
                        <span class="text-sm font-medium text-muted">{{ item.label }}</span>
                    </div>
                    <span class="text-sm font-bold text-highlighted">{{ item.value.toLocaleString() }} ({{ percentage(item.value) }}%)</span>
                </div>
            </div>
        </div>
    </UCard>
</template>

<style scoped>
.unovis-single-container {
    --vis-donut-central-label-text-color: var(--ui-text-highlighted);
    --vis-donut-central-sub-label-text-color: var(--ui-text-muted);
}
</style>
