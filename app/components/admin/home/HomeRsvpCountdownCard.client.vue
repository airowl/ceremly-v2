<script setup lang="ts">
const props = defineProps<{
    deadline: string | null
}>()

const days = ref(0)
const hours = ref(0)
const minutes = ref(0)
const seconds = ref(0)
const expired = ref(false)

const targetDate = computed(() => {
    if (!props.deadline) return null
    return new Date(`${props.deadline}T23:59:59`)
})

let intervalId: ReturnType<typeof setInterval> | null = null

function updateCountdown() {
    if (!targetDate.value) {
        expired.value = false
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

const units = computed(() => [
    { value: days.value, label: 'Giorni' },
    { value: hours.value, label: 'Ore' },
    { value: minutes.value, label: 'Minuti' },
    { value: seconds.value, label: 'Secondi' },
])
</script>

<template>
    <div class="bg-primary/10 border border-primary/20 p-6 rounded-xl h-full flex flex-col justify-between">
        <div>
            <p class="text-xs font-bold uppercase tracking-widest text-primary/70 mb-4">
                Scadenza RSVP
            </p>

            <!-- No deadline set -->
            <div v-if="!deadline" class="flex flex-col items-center justify-center gap-2 py-4">
                <UIcon name="i-lucide-clock" class="size-8 text-muted" />
                <p class="text-sm text-muted text-center">Nessuna scadenza impostata</p>
            </div>

            <!-- Expired -->
            <div v-else-if="expired" class="flex flex-col items-center justify-center gap-2 py-4">
                <UIcon name="i-lucide-alarm-clock-off" class="size-8 text-muted" />
                <p class="text-sm text-muted text-center">Scadenza RSVP superata</p>
            </div>

            <!-- Active countdown -->
            <div v-else class="flex justify-between gap-2 mt-2" role="timer">
                <div
                    v-for="unit in units"
                    :key="unit.label"
                    class="flex flex-col items-center gap-1 flex-1"
                >
                    <span class="text-2xl xl:text-3xl font-black tabular-nums text-primary">
                        {{ String(unit.value).padStart(2, '0') }}
                    </span>
                    <span class="text-[9px] uppercase font-bold tracking-wider text-primary/60">
                        {{ unit.label }}
                    </span>
                </div>
            </div>
        </div>
    </div>
</template>
