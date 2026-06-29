<script setup lang="ts">
import type { EventWithCounts } from "~~/shared/types/ceremly";

const { t, locale } = useI18n();
const { subscription, isAtelier, hasActiveSubscription, openCustomerPortal, refreshSubscription } = useSubscription();
const { listEvents } = useEvents();
const { fetchSession } = useAuth();
const localePath = useLocalePath();
const toast = useToast();

// Unlocked events (Celebrazione)
const events = ref<EventWithCounts[]>([]);
const eventsLoading = ref(true);
const unlockedEvents = computed(() => events.value.filter(e => e.tier === "celebration"));

async function loadEvents() {
    eventsLoading.value = true;
    try { events.value = await listEvents(); }
    catch { events.value = []; }
    finally { eventsLoading.value = false; }
}

// Current tier
const currentTierLabel = computed(() => isAtelier.value ? t("subscription.tier.atelier") : t("subscription.tier.free"));
const currentTierDesc = computed(() => isAtelier.value ? t("subscription.tier.atelierDesc") : t("subscription.tier.freeDesc"));

// Renewal date (Atelier only)
const renewalDate = computed(() => {
    const sub = subscription.value as { periodEnd?: string | Date | null } | null;
    if (!sub?.periodEnd) return null;
    return new Date(sub.periodEnd).toLocaleDateString(locale.value === "it" ? "it-IT" : "en-US", { day: "numeric", month: "long", year: "numeric" });
});

function formatUnlockedDate(iso: string | null): string {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString(locale.value === "it" ? "it-IT" : "en-US", { day: "numeric", month: "long", year: "numeric" });
}

// Atelier management via portal
const isPortalLoading = ref(false);
async function handleOpenPortal() {
    isPortalLoading.value = true;
    try { await openCustomerPortal(); }
    catch { toast.add({ title: t("subscription.toast.error"), description: t("subscription.toast.errorOccurred"), color: "error" }); }
    finally { isPortalLoading.value = false; }
}

// Sync
const isSyncing = ref(false);
async function handleSync() {
    isSyncing.value = true;
    try {
        await refreshSubscription();
        await fetchSession();
        await loadEvents();
        toast.add({ title: t("subscription.synced"), color: "success" });
    } catch { toast.add({ title: t("subscription.syncError"), color: "error" }); }
    finally { isSyncing.value = false; }
}

onMounted(async () => { await Promise.all([refreshSubscription(), loadEvents()]); });
</script>

<template>
    <UDashboardPanel id="subscription-page">
        <template #header>
            <UDashboardNavbar :title="$t('subscription.title')">
                <template #leading><UDashboardSidebarCollapse /></template>
                <template #right>
                    <UTooltip :text="$t('subscription.sync')">
                        <UButton :loading="isSyncing" color="neutral" variant="ghost" icon="i-lucide-refresh-cw" size="sm" square @click="handleSync" />
                    </UTooltip>
                </template>
            </UDashboardNavbar>
        </template>

        <template #body>
            <div class="max-w-3xl mx-auto py-8 px-4 sm:px-6 space-y-10">
                <!-- Card: current plan -->
                <div class="rounded-xl border border-default bg-default p-6 sm:p-8 shadow-sm">
                    <div class="flex flex-wrap items-center justify-between gap-6">
                        <div class="flex items-center gap-5">
                            <div class="h-16 w-16 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                                <UIcon name="i-lucide-badge-check" class="w-8 h-8 text-primary" />
                            </div>
                            <div class="space-y-1.5">
                                <UBadge :color="isAtelier ? 'primary' : 'neutral'" variant="subtle" size="xs" class="uppercase tracking-wider font-bold">
                                    {{ isAtelier ? $t('subscription.status.active') : $t('subscription.tier.freeBadge') }}
                                </UBadge>
                                <h2 class="text-xl font-bold">{{ $t('subscription.currentPlanLabel') }}: {{ currentTierLabel }}</h2>
                                <p class="text-sm text-muted">
                                    {{ currentTierDesc }}
                                    <span v-if="isAtelier && renewalDate"> — {{ $t('subscription.renewalDate') }}: {{ renewalDate }}</span>
                                </p>
                            </div>
                        </div>
                        <div class="flex items-center gap-3">
                            <UButton v-if="isAtelier && hasActiveSubscription" :loading="isPortalLoading" color="neutral" variant="soft" size="sm" leading-icon="i-lucide-external-link" @click="handleOpenPortal">
                                {{ $t('subscription.manageAtelier') }}
                            </UButton>
                            <UButton v-else :to="localePath('/pricing')" color="primary" size="sm" leading-icon="i-lucide-sparkles">
                                {{ $t('subscription.discoverAtelier') }}
                            </UButton>
                        </div>
                    </div>
                </div>

                <!-- Unlocked events (Celebrazione) -->
                <div class="space-y-4">
                    <h3 class="text-lg font-bold">{{ $t('subscription.unlockedEvents.title') }}</h3>
                    <p class="text-sm text-muted">{{ $t('subscription.unlockedEvents.subtitle') }}</p>
                    <div v-if="eventsLoading" class="text-sm text-muted">{{ $t('subscription.unlockedEvents.loading') }}</div>
                    <div v-else-if="unlockedEvents.length === 0" class="rounded-xl border border-dashed border-default p-8 text-center">
                        <UIcon name="i-lucide-ticket" class="w-8 h-8 text-muted mx-auto mb-3" />
                        <p class="text-sm text-muted">{{ $t('subscription.unlockedEvents.empty') }}</p>
                    </div>
                    <ul v-else class="divide-y divide-default rounded-xl border border-default bg-default overflow-hidden">
                        <li v-for="ev in unlockedEvents" :key="ev.id" class="flex items-center justify-between gap-4 p-4">
                            <div class="min-w-0">
                                <NuxtLink :to="localePath(`/dashboard/events/${ev.id}`)" class="font-semibold truncate hover:text-primary">{{ ev.title }}</NuxtLink>
                                <p class="text-xs text-muted mt-0.5">{{ $t('subscription.unlockedEvents.unlockedOn') }}: {{ formatUnlockedDate(ev.unlockedAt) }}</p>
                            </div>
                            <UBadge color="success" variant="subtle" size="xs" class="shrink-0">{{ $t('subscription.unlockedEvents.badge') }}</UBadge>
                        </li>
                    </ul>
                </div>

                <!-- Atelier billing management -->
                <div v-if="isAtelier && hasActiveSubscription" class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <UPageCard :title="$t('subscription.paymentMethods.title')" variant="subtle">
                        <UButton :loading="isPortalLoading" color="neutral" variant="outline" size="sm" leading-icon="i-lucide-external-link" @click="handleOpenPortal">{{ $t('subscription.paymentMethods.cta') }}</UButton>
                    </UPageCard>
                    <UPageCard :title="$t('subscription.billingHistory.title')" variant="subtle">
                        <UButton :loading="isPortalLoading" color="neutral" variant="outline" size="sm" leading-icon="i-lucide-external-link" @click="handleOpenPortal">{{ $t('subscription.billingHistory.cta') }}</UButton>
                    </UPageCard>
                </div>
            </div>
        </template>
    </UDashboardPanel>
</template>
