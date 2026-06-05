<script setup lang="ts">
import type { LandingSettings } from '~~/shared/schemas/landing'

const props = defineProps<{
    values: Record<string, unknown>
    settings: LandingSettings
    event?: Record<string, unknown>
}>()

const title = computed(() => (props.values.title as string) || 'Mancano')
const showDays = computed(() => props.values.showDays !== false)
const showHours = computed(() => props.values.showHours !== false)
const showMinutes = computed(() => props.values.showMinutes !== false)
const showSeconds = computed(() => props.values.showSeconds !== false)
const expiredMessage = computed(() => (props.values.expiredMessage as string) || "L'evento \u00e8 iniziato!")

const targetDate = computed(() => {
    const dateStr = (props.values.target_date as string) || (props.event?.date as string)
    if (!dateStr) return null
    const timeStr = (props.event?.time as string) || '00:00'
    return new Date(`${dateStr}T${timeStr}:00`)
})

const days = ref(0)
const hours = ref(0)
const minutes = ref(0)
const seconds = ref(0)
const expired = ref(false)

let intervalId: ReturnType<typeof setInterval> | null = null

function updateCountdown() {
    if (!targetDate.value) {
        expired.value = true
        return
    }
    const now = new Date().getTime()
    const target = targetDate.value.getTime()
    const diff = target - now

    if (diff <= 0) {
        expired.value = true
        days.value = 0
        hours.value = 0
        minutes.value = 0
        seconds.value = 0
        if (intervalId) {
            clearInterval(intervalId)
            intervalId = null
        }
        return
    }

    expired.value = false
    days.value = Math.floor(diff / (1000 * 60 * 60 * 24))
    hours.value = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    minutes.value = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    seconds.value = Math.floor((diff % (1000 * 60)) / 1000)
}

onMounted(() => {
    updateCountdown()
    intervalId = setInterval(updateCountdown, 1000)
})

onUnmounted(() => {
    if (intervalId) {
        clearInterval(intervalId)
    }
})

interface CountdownUnit {
    value: number
    label: string
    show: boolean
}

const units = computed<CountdownUnit[]>(() => [
    { value: days.value, label: 'Giorni', show: showDays.value },
    { value: hours.value, label: 'Ore', show: showHours.value },
    { value: minutes.value, label: 'Minuti', show: showMinutes.value },
    { value: seconds.value, label: 'Secondi', show: showSeconds.value },
])

const visibleUnits = computed(() => units.value.filter(u => u.show))
</script>

<template>
    <section class="py-16 px-6" aria-label="Conto alla rovescia">
        <div class="mx-auto max-w-3xl text-center">
            <h2
                v-if="title && !expired"
                class="mb-8 text-2xl font-bold"
                :style="{ color: 'var(--landing-text)' }"
            >
                {{ title }}
            </h2>

            <!-- Expired message -->
            <p
                v-if="expired"
                class="text-2xl font-bold"
                :style="{ color: 'var(--landing-primary)' }"
            >
                {{ expiredMessage }}
            </p>

            <!-- Countdown units -->
            <div
                v-else
                class="flex flex-wrap items-center justify-center gap-4 sm:gap-6"
                role="timer"
                :aria-label="`${days} giorni, ${hours} ore, ${minutes} minuti, ${seconds} secondi`"
            >
                <div
                    v-for="unit in visibleUnits"
                    :key="unit.label"
                    class="flex flex-col items-center gap-2 rounded-xl border p-4 sm:p-6 min-w-[80px] sm:min-w-[100px]"
                    :style="{
                        borderColor: 'color-mix(in srgb, var(--landing-primary) 30%, transparent)',
                        borderRadius: 'var(--landing-radius)',
                        backgroundColor: 'color-mix(in srgb, var(--landing-primary) 5%, var(--landing-bg))',
                    }"
                >
                    <span
                        class="text-3xl font-extrabold tabular-nums sm:text-4xl"
                        :style="{ color: 'var(--landing-primary)' }"
                        aria-hidden="true"
                    >
                        {{ String(unit.value).padStart(2, '0') }}
                    </span>
                    <span
                        class="text-xs font-medium uppercase tracking-wider"
                        :style="{ color: 'var(--landing-text)', opacity: '0.6' }"
                    >
                        {{ unit.label }}
                    </span>
                </div>
            </div>
        </div>
    </section>
</template>
