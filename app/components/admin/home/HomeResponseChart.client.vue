<script setup lang="ts">
import { eachDayOfInterval, format, sub } from 'date-fns'

const VisXYContainer = defineAsyncComponent(() => import('@unovis/vue').then(m => m.VisXYContainer))
const VisLine = defineAsyncComponent(() => import('@unovis/vue').then(m => m.VisLine))
const VisArea = defineAsyncComponent(() => import('@unovis/vue').then(m => m.VisArea))
const VisAxis = defineAsyncComponent(() => import('@unovis/vue').then(m => m.VisAxis))
const VisCrosshair = defineAsyncComponent(() => import('@unovis/vue').then(m => m.VisCrosshair))
const VisTooltip = defineAsyncComponent(() => import('@unovis/vue').then(m => m.VisTooltip))

const { t } = useI18n()
const cardRef = useTemplateRef<HTMLElement | null>('cardRef')
const { width } = useElementSize(cardRef)

type DataRecord = { date: Date; responses: number }

const periods = computed(() => [
    { label: t('dashboard.home.charts.period.30days'), value: '30d', days: 30 },
    { label: t('dashboard.home.charts.period.7days'), value: '7d', days: 7 },
    { label: t('dashboard.home.charts.period.90days'), value: '90d', days: 90 },
])

const selectedPeriod = ref('30d')

const data = computed<DataRecord[]>(() => {
    const period = periods.value.find(p => p.value === selectedPeriod.value) ?? periods.value[0]!
    const range = { start: sub(new Date(), { days: period.days }), end: new Date() }
    const dates = eachDayOfInterval(range)
    return dates.map(date => ({
        date,
        responses: Math.floor(Math.random() * 20) + 5,
    }))
})

const x = (_: DataRecord, i: number) => i
const y = (d: DataRecord) => d.responses

const xTicks = (i: number) => {
    if (i === 0 || i === data.value.length - 1 || !data.value[i]) return ''
    return format(data.value[i].date, 'd MMM')
}

const template = (d: DataRecord) => `${format(d.date, 'd MMM')}: ${d.responses} ${t('dashboard.home.charts.responses')}`
</script>

<template>
    <UCard ref="cardRef" :ui="{ root: 'overflow-visible', body: '!px-0 !pt-0 !pb-3' }">
        <template #header>
            <div class="flex items-center justify-between">
                <div>
                    <p class="text-base font-semibold text-highlighted">
                        {{ t('dashboard.home.charts.responsesOverTime') }}
                    </p>
                    <p class="text-sm text-muted">
                        {{ t('dashboard.home.charts.responsesSubtitle') }}
                    </p>
                </div>
                <USelect
                    v-model="selectedPeriod"
                    :items="periods"
                    value-key="value"
                    label-key="label"
                    variant="outline"
                    size="sm"
                />
            </div>
        </template>

        <VisXYContainer
            :data="data"
            :padding="{ top: 40 }"
            class="h-64"
            :width="width"
        >
            <VisArea
                :x="x"
                :y="y"
                color="var(--ui-primary)"
                :opacity="0.15"
            />
            <VisLine
                :x="x"
                :y="y"
                color="var(--ui-primary)"
            />
            <VisAxis
                type="x"
                :x="x"
                :tick-format="xTicks"
            />
            <VisCrosshair
                color="var(--ui-primary)"
                :template="template"
            />
            <VisTooltip />
        </VisXYContainer>
    </UCard>
</template>

<style scoped>
.unovis-xy-container {
    --vis-crosshair-line-stroke-color: var(--ui-primary);
    --vis-crosshair-circle-stroke-color: var(--ui-bg);
    --vis-axis-grid-color: var(--ui-border);
    --vis-axis-tick-color: var(--ui-border);
    --vis-axis-tick-label-color: var(--ui-text-dimmed);
    --vis-tooltip-background-color: var(--ui-bg);
    --vis-tooltip-border-color: var(--ui-border);
    --vis-tooltip-text-color: var(--ui-text-highlighted);
}
</style>
