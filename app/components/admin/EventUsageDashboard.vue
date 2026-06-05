<script setup lang="ts">
// Props
const props = defineProps<{
    eventId: string;
    eventName: string;
}>();

const userStore = useUserStore();

// State
const isLoading = ref(false);

// Computed from userStore limitsData
const teamLimit = computed(() => userStore.limitsData?.usage.team ?? null);

// Computed plan name
const planName = computed(() => userStore.limitsData?.plan || 'free');

// Load data via userStore consolidated endpoint
const loadUsageData = async () => {
    isLoading.value = true;
    try {
        await userStore.fetchLimits(props.eventId);
    } catch (error) {
        console.error('Error loading usage data:', error);
    } finally {
        isLoading.value = false;
    }
};

// Load data on mount
onMounted(loadUsageData);

// Reload when event changes
watch(() => props.eventId, loadUsageData);

</script>

<template>
    <UCard>
        <div class="flex items-center justify-between mb-6">
            <div>
                <h3 class="text-lg font-semibold">{{ eventName }}</h3>
                <p class="text-sm text-muted">Event resource usage</p>
            </div>
            <UBadge :color="planName === 'free' ? 'neutral' : 'success'" variant="subtle">
                {{ planName }}
            </UBadge>
        </div>

        <div v-if="isLoading" class="space-y-4">
            <USkeleton v-for="i in 4" :key="i" class="h-14 w-full" />
        </div>

        <div v-else class="space-y-6">
            <!-- Team Members -->
            <div v-if="teamLimit" class="space-y-2">
                <div class="flex justify-between items-center text-sm">
                    <span class="flex items-center gap-2">
                        <UIcon name="i-lucide-users" class="size-4" />
                        Team Members
                    </span>
                    <span class="font-medium">
                        {{ teamLimit.current }}
                        <template v-if="teamLimit.limit !== -1">/ {{ teamLimit.limit }}</template>
                        <template v-else>(Unlimited)</template>
                    </span>
                </div>
                <UProgress
                    v-if="teamLimit.limit !== -1"
                    :model-value="teamLimit.current"
                    :max="teamLimit.limit"
                    :color="teamLimit.allowed ? 'primary' : 'warning'"
                />
                <div v-if="!teamLimit.allowed" class="text-xs text-warning">
                    Limit reached
                </div>
            </div>

            <!-- Actions -->
            <div class="pt-4 border-t">
                <div class="flex gap-2">
                    <NuxtLink :to="`/dashboard/event/${eventId}/team`">
                        <UButton size="sm" variant="outline">
                            <UIcon name="i-lucide-user-plus" class="size-4 mr-2" />
                            Invite Members
                        </UButton>
                    </NuxtLink>

                    <NuxtLink to="/dashboard/subscription">
                        <UButton size="sm" variant="outline" color="primary">
                            <UIcon name="i-lucide-credit-card" class="size-4 mr-2" />
                            Upgrade Plan
                        </UButton>
                    </NuxtLink>
                </div>
            </div>
        </div>
    </UCard>
</template>
