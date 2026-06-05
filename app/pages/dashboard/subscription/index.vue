<script setup lang="ts">
const { t, locale } = useI18n();
const {
    subscription: activeSubscription,
    currentPlan: currentPlanFromSubscription,
    hasActiveSubscription,
    createCheckoutSession,
    openCustomerPortal,
    refreshSubscription,
} = useSubscription();
const userStore = useUserStore();
const { fetchSession } = useAuth();
const isLoading = ref(false);

// Recommended plan (product decision, not data-driven)
const RECOMMENDED_PLAN_ID = 'premium' as const;

// Dynamic pricing
const { plans: pricingPlans } = usePricing();

// Computed plans array for template
const plans = computed(() => pricingPlans.value.map(plan => ({
    id: plan.id,
    name: plan.name,
    description: plan.description,
    price: {
        monthly: plan.pricing.monthly / 100,
        yearly: plan.pricing.yearly / 100,
        monthlyFormatted: plan.pricing.monthlyFormatted,
        yearlyFormatted: plan.pricing.yearlyFormatted,
        savings: plan.pricing.yearlySavingsPercent
    },
    features: plan.features.map(f => ({ key: f.key, text: f.text })),
})));

// Billing period
const billingPeriod = ref<'monthly' | 'yearly'>('monthly');

// Get base plan name
const getBasePlan = (plan: string): string => plan?.split('-')[0] || 'starter';

// Current plan
const currentPlanId = computed(() => {
    return getBasePlan(currentPlanFromSubscription.value);
});

// Current plan details - always returns a valid plan (defaults to starter)
const currentPlan = computed(() => plans.value.find(p => p.id === currentPlanId.value) ?? plans.value[0]!);

// Subscription status
const subscriptionStatus = computed(() => {
    if (!hasActiveSubscription.value) {
        return { label: t('subscription.status.active'), color: 'success' as const };
    }
    const status = (activeSubscription.value as { status?: string })?.status;
    if (!status || status === 'active') return { label: t('subscription.status.active'), color: 'success' as const };
    if (status === 'trialing') return { label: t('subscription.status.trialing'), color: 'info' as const };
    if (status === 'canceled') return { label: t('subscription.status.canceled'), color: 'error' as const };
    if (status === 'past_due') return { label: t('subscription.status.pastDue'), color: 'warning' as const };
    return { label: status, color: 'neutral' as const };
});

// Current billing period from subscription
const currentBillingPeriod = computed(() => {
    const plan = currentPlanFromSubscription.value;
    if (!plan) return null;
    if (plan.includes('-yearly') || plan.includes('yearly')) return 'yearly';
    if (plan.includes('-monthly') || plan.includes('monthly')) return 'monthly';
    return 'monthly';
});

// Renewal date from subscription
const renewalDate = computed(() => {
    const sub = activeSubscription.value as { periodEnd?: string | Date | null } | null;
    if (!sub?.periodEnd) return null;
    return new Date(sub.periodEnd).toLocaleDateString(locale.value === 'it' ? 'it-IT' : 'en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
});

// Check if plan is current
const isCurrentPlan = (planId: string): boolean => currentPlanId.value === planId;

// Status
const isPaid = computed(() => hasActiveSubscription.value);

// Plan hierarchy for upgrade/downgrade detection
const planHierarchy: Record<string, number> = { 'starter': 0, 'premium': 1, 'agency': 2 };

// Check if selecting a plan is an upgrade or downgrade
const getPlanAction = (planId: string): 'current' | 'upgrade' | 'downgrade' => {
    if (isCurrentPlan(planId)) return 'current';
    const currentLevel = planHierarchy[currentPlanId.value] ?? 0;
    const targetLevel = planHierarchy[planId] ?? 0;
    return targetLevel > currentLevel ? 'upgrade' : 'downgrade';
};

// Get button label for plan
const getPlanButtonLabel = (planId: string): string => {
    if (isCurrentPlan(planId)) return t('subscription.actions.currentPlan');
    const planName = plans.value.find(p => p.id === planId)?.name ?? planId;
    return t('subscription.actions.choosePlanFor', { plan: planName });
};

// Get button color for plan
const getPlanButtonColor = (planId: string): 'neutral' | 'primary' => {
    if (isCurrentPlan(planId)) return 'neutral';
    return 'primary';
};

// Handle subscription
const handleSelectPlan = async (planId: string) => {
    if (isCurrentPlan(planId)) return;

    // If user already has an active subscription, redirect to Creem portal for upgrade/downgrade
    if (hasActiveSubscription.value) {
        isLoading.value = true;
        try {
            await openCustomerPortal();
        } catch (error) {
            console.error('Error opening portal:', error);
            useToast().add({
                title: t('subscription.toast.error'),
                description: t('subscription.toast.errorOccurred'),
                color: 'error'
            });
        } finally {
            isLoading.value = false;
        }
        return;
    }

    // New subscription: create checkout session
    isLoading.value = true;
    try {
        const fullPlanId = `${planId}-${billingPeriod.value}`;
        await createCheckoutSession(fullPlanId);
    } catch (error) {
        console.error('Error:', error);
        useToast().add({
            title: t('subscription.toast.error'),
            description: t('subscription.toast.errorOccurred'),
            color: 'error'
        });
    } finally {
        isLoading.value = false;
    }
};

// Sync
const isSyncing = ref(false);
const handleSync = async () => {
    isSyncing.value = true;
    try {
        await refreshSubscription();
        await fetchSession();
        useToast().add({ title: t('subscription.synced'), color: 'success' });
    } catch {
        useToast().add({ title: t('subscription.syncError'), color: 'error' });
    } finally {
        isSyncing.value = false;
    }
};

// Cancel subscription
const isCanceling = ref(false);
const showCancelModal = ref(false);

const handleCancelSubscription = async () => {
    isCanceling.value = true;
    showCancelModal.value = false;
    try {
        await openCustomerPortal();
    } catch {
        useToast().add({
            title: t('subscription.toast.error'),
            description: t('subscription.toast.cancelProcessError'),
            color: 'error'
        });
    } finally {
        isCanceling.value = false;
    }
};

// Portal links (payment methods + billing history)
const isPortalLoadingPayment = ref(false);
const isPortalLoadingBilling = ref(false);

const handleOpenPortalPayment = async () => {
    isPortalLoadingPayment.value = true;
    try {
        await openCustomerPortal();
    } catch {
        useToast().add({ title: t('subscription.toast.error'), description: t('subscription.toast.errorOccurred'), color: 'error' });
    } finally {
        isPortalLoadingPayment.value = false;
    }
};

const handleOpenPortalBilling = async () => {
    isPortalLoadingBilling.value = true;
    try {
        await openCustomerPortal();
    } catch {
        useToast().add({ title: t('subscription.toast.error'), description: t('subscription.toast.errorOccurred'), color: 'error' });
    } finally {
        isPortalLoadingBilling.value = false;
    }
};

// Scroll to pricing
const pricingSection = ref<HTMLElement | null>(null);
const scrollToPricing = () => {
    pricingSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// URL params handling + initial subscription load
const route = useRoute();
onMounted(async () => {
    await refreshSubscription();

    if (route.query.success || route.query.canceled) {
        await fetchSession();
        if (route.query.success) {
            useToast().add({ title: t('subscription.toast.subscriptionUpdated'), color: 'success' });
        }
    }
});
</script>

<template>
    <UDashboardPanel id="subscription-page">
        <template #header>
            <UDashboardNavbar :title="$t('subscription.title')">
                <template #leading>
                    <UDashboardSidebarCollapse />
                </template>
                <template #right>
                    <UTooltip :text="$t('subscription.sync')">
                        <UButton
                            @click="handleSync"
                            :loading="isSyncing"
                            color="neutral"
                            variant="ghost"
                            icon="i-lucide-refresh-cw"
                            size="sm"
                            square
                        />
                    </UTooltip>
                </template>
            </UDashboardNavbar>
        </template>

        <template #body>
            <div class="max-w-5xl mx-auto py-8 px-4 sm:px-6 space-y-10">

                <!-- Section 1: Current Plan Card -->
                <div class="rounded-xl border border-default bg-default p-6 sm:p-8 shadow-sm">
                    <div class="flex flex-wrap items-center justify-between gap-6">
                        <!-- Left: Icon + Info -->
                        <div class="flex items-center gap-5">
                            <div class="h-16 w-16 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                                <UIcon name="i-lucide-badge-check" class="w-8 h-8 text-primary" />
                            </div>
                            <div class="space-y-1.5">
                                <div class="flex items-center gap-2">
                                    <UBadge :color="subscriptionStatus.color" variant="subtle" size="xs" class="uppercase tracking-wider font-bold">
                                        {{ subscriptionStatus.label }}
                                    </UBadge>
                                </div>
                                <h2 class="text-xl font-bold">
                                    {{ $t('subscription.currentPlanLabel') }}: {{ currentPlan.name }}
                                </h2>
                                <p class="text-sm text-muted">
                                    {{ currentBillingPeriod === 'yearly' ? currentPlan.price.yearlyFormatted : currentPlan.price.monthlyFormatted }}/{{ currentBillingPeriod === 'yearly' ? $t('subscription.perYear') : $t('subscription.perMonth') }}
                                    <span v-if="renewalDate"> — {{ $t('subscription.renewalDate') }}: {{ renewalDate }}</span>
                                </p>
                            </div>
                        </div>

                        <!-- Right: Actions -->
                        <div class="flex items-center gap-3">
                            <UButton
                                v-if="isPaid"
                                @click="showCancelModal = true"
                                color="neutral"
                                variant="soft"
                                size="sm"
                            >
                                {{ $t('subscription.actions.cancelSubscription') }}
                            </UButton>
                            <UButton
                                @click="scrollToPricing"
                                color="primary"
                                size="sm"
                                leading-icon="i-lucide-arrow-up"
                            >
                                {{ $t('subscription.actions.upgradePlan') }}
                            </UButton>
                        </div>
                    </div>
                </div>

                <!-- Section 2: Billing Toggle -->
                <div class="flex justify-center">
                    <div class="inline-flex items-center rounded-xl bg-muted/30 p-1">
                        <button
                            @click="billingPeriod = 'monthly'"
                            :class="[
                                'px-5 py-2 text-sm font-medium rounded-lg transition-colors',
                                billingPeriod === 'monthly'
                                    ? 'bg-default text-default shadow-sm'
                                    : 'text-muted hover:text-default'
                            ]"
                        >
                            {{ $t('subscription.changePlan.monthly') }}
                        </button>
                        <button
                            @click="billingPeriod = 'yearly'"
                            :class="[
                                'px-5 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5',
                                billingPeriod === 'yearly'
                                    ? 'bg-default text-default shadow-sm'
                                    : 'text-muted hover:text-default'
                            ]"
                        >
                            {{ $t('subscription.changePlan.yearly') }}
                            <span v-if="plans[1]?.price.savings" class="text-xs text-success-600 font-semibold">-{{ plans[1]?.price.savings }}%</span>
                        </button>
                    </div>
                </div>

                <!-- Section 3: Pricing Cards Grid -->
                <div ref="pricingSection" class="grid sm:grid-cols-3 gap-6 py-4">
                    <div
                        v-for="plan in plans"
                        :key="plan.id"
                        :class="[
                            'relative rounded-xl border p-6 sm:p-8 flex flex-col transition-all',
                            plan.id === RECOMMENDED_PLAN_ID
                                ? 'border-2 border-primary shadow-xl scale-[1.03] z-10 bg-default'
                                : isCurrentPlan(plan.id)
                                    ? 'border-primary/40 bg-primary/5'
                                    : 'border-default bg-default hover:border-muted-foreground/30'
                        ]"
                    >
                        <!-- "CONSIGLIATO" badge for recommended plan -->
                        <div
                            v-if="plan.id === RECOMMENDED_PLAN_ID"
                            class="absolute -top-4 left-1/2 -translate-x-1/2"
                        >
                            <span class="inline-flex items-center px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-primary text-white">
                                {{ $t('subscription.recommended') }}
                            </span>
                        </div>

                        <!-- Current plan indicator (for non-recommended current plan) -->
                        <div
                            v-else-if="isCurrentPlan(plan.id)"
                            class="absolute -top-3 left-4"
                        >
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-primary text-white">
                                {{ $t('subscription.changePlan.current') }}
                            </span>
                        </div>

                        <!-- Plan Header -->
                        <div class="mb-5">
                            <h3 class="text-lg font-bold">{{ plan.name }}</h3>
                            <p class="text-xs text-muted mt-0.5">{{ plan.description }}</p>
                        </div>

                        <!-- Price -->
                        <div class="mb-5">
                            <div class="flex items-baseline gap-1">
                                <span class="text-4xl font-black">
                                    {{ billingPeriod === 'monthly' ? plan.price.monthlyFormatted : plan.price.yearlyFormatted }}
                                </span>
                                <span class="text-sm text-muted">
                                    /{{ billingPeriod === 'monthly' ? $t('subscription.perMonth') : $t('subscription.perYear') }}
                                </span>
                            </div>
                        </div>

                        <!-- Features -->
                        <ul class="space-y-3 mb-6 flex-1">
                            <li
                                v-for="feature in plan.features"
                                :key="feature.key"
                                class="flex items-start gap-2.5 text-sm text-muted"
                            >
                                <UIcon name="i-lucide-check-circle" class="w-4 h-4 text-primary shrink-0 mt-0.5" />
                                {{ $t(feature.key) || feature.text }}
                            </li>
                        </ul>

                        <!-- CTA Button -->
                        <UButton
                            @click="handleSelectPlan(plan.id)"
                            :loading="isLoading && !isCurrentPlan(plan.id)"
                            :disabled="isCurrentPlan(plan.id)"
                            :color="getPlanButtonColor(plan.id)"
                            :variant="isCurrentPlan(plan.id) ? 'soft' : plan.id === RECOMMENDED_PLAN_ID ? 'solid' : 'outline'"
                            block
                        >
                            {{ getPlanButtonLabel(plan.id) }}
                        </UButton>
                    </div>
                </div>

                <!-- Contact Footer -->
                <div class="text-center">
                    <p class="text-xs text-muted">
                        {{ $t('subscription.changePlan.customPlan') }}
                        <a href="mailto:support@example.com" class="text-primary hover:underline">{{ $t('subscription.changePlan.contactUs') }}</a>
                    </p>
                </div>

                <!-- Section 5: Payment Methods + Billing History -->
                <div v-if="hasActiveSubscription" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <!-- Payment Methods -->
                    <UPageCard :title="$t('subscription.paymentMethods.title')" variant="subtle">
                        <div class="flex flex-col items-start gap-4">
                            <div class="flex items-center gap-3 text-muted text-sm">
                                <UIcon name="i-lucide-credit-card" class="w-5 h-5 shrink-0" />
                                <span>{{ $t('subscription.paymentMethods.description') }}</span>
                            </div>
                            <UButton
                                @click="handleOpenPortalPayment"
                                :loading="isPortalLoadingPayment"
                                color="neutral"
                                variant="outline"
                                size="sm"
                                leading-icon="i-lucide-external-link"
                            >
                                {{ $t('subscription.paymentMethods.cta') }}
                            </UButton>
                        </div>
                    </UPageCard>

                    <!-- Billing History -->
                    <UPageCard :title="$t('subscription.billingHistory.title')" variant="subtle">
                        <div class="flex flex-col items-start gap-4">
                            <div class="flex items-center gap-3 text-muted text-sm">
                                <UIcon name="i-lucide-receipt" class="w-5 h-5 shrink-0" />
                                <span>{{ $t('subscription.billingHistory.description') }}</span>
                            </div>
                            <UButton
                                @click="handleOpenPortalBilling"
                                :loading="isPortalLoadingBilling"
                                color="neutral"
                                variant="outline"
                                size="sm"
                                leading-icon="i-lucide-external-link"
                            >
                                {{ $t('subscription.billingHistory.cta') }}
                            </UButton>
                        </div>
                    </UPageCard>
                </div>
            </div>

            <!-- Cancel Subscription Modal -->
            <UModal v-model:open="showCancelModal">
                <template #content>
                    <UCard>
                        <template #header>
                            <div class="flex items-center gap-3">
                                <UIcon name="i-lucide-alert-circle" class="w-5 h-5 text-error" />
                                <span class="font-semibold">{{ $t('subscription.cancelModal.title') }}</span>
                            </div>
                        </template>

                        <div class="space-y-4 text-sm">
                            <p>{{ $t('subscription.cancelModal.confirmMessage') }} <strong>{{ currentPlan.name }}</strong>?</p>
                            <div class="bg-warning/10 border border-warning/20 rounded-lg p-4 space-y-2">
                                <div class="flex items-start gap-2">
                                    <UIcon name="i-lucide-alert-triangle" class="w-4 h-4 text-warning shrink-0 mt-0.5" />
                                    <div class="text-muted">
                                        <p class="font-medium text-default">{{ $t('subscription.cancelModal.warningTitle') }}</p>
                                        <p>{{ $t('subscription.cancelModal.warningMessage') }}</p>
                                    </div>
                                </div>
                            </div>
                            <p class="text-muted">{{ $t('subscription.cancelModal.refundMessage') }}</p>
                        </div>

                        <template #footer>
                            <div class="flex justify-end gap-3">
                                <UButton @click="showCancelModal = false" variant="ghost" color="neutral">
                                    {{ $t('subscription.cancelModal.keepSubscription') }}
                                </UButton>
                                <UButton @click="handleCancelSubscription" color="error" :loading="isCanceling">
                                    <UIcon name="i-lucide-x-circle" class="w-4 h-4 mr-1.5" />
                                    {{ $t('subscription.cancelModal.confirmCancel') }}
                                </UButton>
                            </div>
                        </template>
                    </UCard>
                </template>
            </UModal>
        </template>
    </UDashboardPanel>
</template>
