<script setup lang="ts">
import UsageNotifications from './UsageNotifications.vue';

const { t } = useI18n();
const userStore = useUserStore();

// Limiti event
const eventLimit = ref<{ allowed: boolean; current: number; limit: number } | null>(null);
const isLoadingEvent = ref(false);

// Carica limiti all'avvio
onMounted(async () => {
    if (!userStore.user?.id) return;

    isLoadingEvent.value = true;
    try {
        eventLimit.value = await userStore.checkEventCreationLimit();
    } catch (error) {
        console.error('Error loading event limits:', error);
    } finally {
        isLoadingEvent.value = false;
    }
});
</script>

<template>
    <!-- Notifiche di utilizzo -->
    <!-- <UsageNotifications /> -->

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        <!-- Event Usage -->
        <UCard>
            <div class="flex items-center gap-3">
                <UIcon name="i-lucide-building-2" class="size-8 text-primary" />
                <div>
                    <h3 class="font-semibold">{{ $t('dashboard.planUsage.event.title') }}</h3>
                    <p class="text-sm text-muted">{{ $t('dashboard.planUsage.event.description') }}</p>
                </div>
            </div>

            <div v-if="isLoadingEvent" class="mt-4">
                <USkeleton class="h-4 w-full mb-2" />
                <USkeleton class="h-2 w-3/4" />
            </div>

            <div v-else-if="eventLimit" class="mt-4">
                <div class="flex justify-between items-center text-sm mb-2">
                    <span>{{ $t('dashboard.planUsage.used') }}</span>
                    <span class="font-medium">{{ eventLimit.current }} / {{ eventLimit.limit }}</span>
                </div>
                <UProgress
                    :model-value="eventLimit.current"
                    :max="eventLimit.limit"
                    :color="eventLimit.allowed ? 'primary' : 'warning'"
                    class="mb-2"
                />

                <div v-if="!eventLimit.allowed" class="text-xs text-warning">
                    {{ $t('dashboard.planUsage.limitReached') }} <NuxtLink to="/dashboard/subscription" class="underline">{{ $t('dashboard.planUsage.upgrade') }}</NuxtLink>
                </div>
                <div v-else class="text-xs text-muted">
                    {{ $t('dashboard.planUsage.remaining', { count: eventLimit.limit - eventLimit.current }) }}
                </div>
            </div>
        </UCard>

        <!-- Plan Status -->
        <UCard>
            <div class="flex items-center gap-3">
                <UIcon name="i-lucide-crown" class="size-8 text-amber-500" />
                <div>
                    <h3 class="font-semibold">{{ $t('dashboard.planUsage.plan.title') }}</h3>
                    <p class="text-sm text-muted">{{ $t('dashboard.planUsage.plan.description') }}</p>
                </div>
            </div>

            <div class="mt-4">
                <UBadge
                    :color="userStore.isReadOnlyPlan() ? 'neutral' : 'success'"
                    variant="subtle"
                    class="capitalize"
                >
                    {{ userStore.subscription?.plan || 'free' }}
                </UBadge>

                <div class="mt-2 text-sm">
                    <div v-if="userStore.isReadOnlyPlan()" class="text-muted">
                        {{ $t('dashboard.planUsage.plan.readOnly') }} <NuxtLink to="/dashboard/subscription" class="underline">{{ $t('dashboard.planUsage.upgrade') }}</NuxtLink>
                    </div>
                    <div v-else class="text-success">
                        {{ $t('dashboard.planUsage.plan.fullAccess') }}
                    </div>
                </div>
            </div>
        </UCard>

        <!-- Quick Actions -->
        <UCard>
            <div class="flex items-center gap-3">
                <UIcon name="i-lucide-zap" class="size-8 text-green-500" />
                <div>
                    <h3 class="font-semibold">{{ $t('dashboard.planUsage.actions.title') }}</h3>
                    <p class="text-sm text-muted">{{ $t('dashboard.planUsage.actions.description') }}</p>
                </div>
            </div>

            <div class="mt-4 space-y-2">
                <NuxtLink to="/dashboard/event" v-if="userStore.hasWritePermissions()">
                    <UButton
                        size="sm"
                        variant="outline"
                        class="w-full justify-start"
                        :disabled="!eventLimit?.allowed"
                    >
                        <UIcon name="i-lucide-plus" class="size-4 mr-2" />
                        {{ $t('dashboard.planUsage.actions.newEvent') }}
                    </UButton>
                </NuxtLink>

                <NuxtLink to="/dashboard/subscription">
                    <UButton size="sm" variant="outline" class="w-full justify-start">
                        <UIcon name="i-lucide-credit-card" class="size-4 mr-2" />
                        {{ $t('dashboard.planUsage.actions.manageSubscription') }}
                    </UButton>
                </NuxtLink>
            </div>
        </UCard>
    </div>
</template>
