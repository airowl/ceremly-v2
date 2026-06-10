<script setup lang="ts">
import { formatCurrencyAmount } from '~~/shared/utils/currency'

const { t } = useI18n()
const { isWaitingListMode } = useSiteMode()

// Dynamic pricing
const { plans: dynamicPlans } = usePricing()

const ctaLink = computed(() => isWaitingListMode.value ? '#waiting-list' : '#contact')

// Billing cycle toggle
const billingCycle = ref<'monthly' | 'yearly'>('monthly')

// Get savings percentage from dynamic pricing
const yearlySavings = computed(() => {
    const starterPlan = dynamicPlans.value.find(p => p.id === 'starter')
    return starterPlan?.pricing.yearlySavingsPercent || 17
})

const isYearly = computed(() => billingCycle.value === 'yearly')

// Get dynamic pricing for a plan
const getPlanPricing = (planId: string) => {
    const plan = dynamicPlans.value.find(p => p.id === planId)
    const zeroFormatted = formatCurrencyAmount(0)
    const defaultPricing = {
        monthly: { price: zeroFormatted, period: t('landing.pricing.billing.perMonth') },
        yearly: { price: zeroFormatted, period: t('landing.pricing.billing.perYear'), savings: null as string | null }
    }
    if (!plan) return defaultPricing

    const pricing = plan.pricing
    const monthlyAmount = pricing.monthly / 100
    const yearlyAmount = pricing.yearly / 100

    // Calculate yearly savings
    const yearlySavingsAmount = (monthlyAmount * 12) - yearlyAmount

    return {
        monthly: { price: pricing.monthlyFormatted, period: t('landing.pricing.billing.perMonth') },
        yearly: {
            price: pricing.yearlyFormatted,
            period: t('landing.pricing.billing.perYear'),
            savings: yearlySavingsAmount > 0 ? `$${Math.round(yearlySavingsAmount)}` : null
        }
    }
}

const pricingPlans = computed(() => {
    const starterPricing = getPlanPricing('starter')
    const premiumPricing = getPlanPricing('premium')
    const agencyPricing = getPlanPricing('agency')

    // Get features from dynamic plans and translate via i18n keys
    const getFeatures = (planId: string) => {
        const plan = dynamicPlans.value.find(p => p.id === planId)
        if (!plan) return []
        return plan.features.map(f => t(f.key))
    }

    return [
        {
            id: 'starter',
            name: t('landing.pricing.tiers.starter.title'),
            description: t('landing.pricing.tiers.starter.description'),
            price: isYearly.value ? starterPricing.yearly.price : starterPricing.monthly.price,
            billingCycle: isYearly.value ? starterPricing.yearly.period : starterPricing.monthly.period,
            savings: isYearly.value ? starterPricing.yearly.savings : null,
            cta: t('landing.pricing.tiers.starter.cta'),
            features: getFeatures('starter'),
            to: ctaLink.value
        },
        {
            id: 'premium',
            name: t('landing.pricing.tiers.premium.title'),
            description: t('landing.pricing.tiers.premium.description'),
            price: isYearly.value ? premiumPricing.yearly.price : premiumPricing.monthly.price,
            billingCycle: isYearly.value ? premiumPricing.yearly.period : premiumPricing.monthly.period,
            savings: isYearly.value ? premiumPricing.yearly.savings : null,
            badge: t('landing.pricing.tiers.premium.badge'),
            cta: t('landing.pricing.tiers.premium.cta'),
            highlighted: true,
            features: getFeatures('premium'),
            to: ctaLink.value
        },
        {
            id: 'agency',
            name: t('landing.pricing.tiers.agency.title'),
            description: t('landing.pricing.tiers.agency.description'),
            price: isYearly.value ? agencyPricing.yearly.price : agencyPricing.monthly.price,
            billingCycle: isYearly.value ? agencyPricing.yearly.period : agencyPricing.monthly.period,
            savings: isYearly.value ? agencyPricing.yearly.savings : null,
            cta: t('landing.pricing.tiers.agency.cta'),
            features: getFeatures('agency'),
            to: ctaLink.value
        }
    ]
})
</script>

<template>
    <UPageSection
id="pricing" :title="$t('landing.pricing.title')" :description="$t('landing.pricing.description')"
        class="scroll-mt-20">

        <!-- Billing Toggle -->
        <div class="flex flex-col items-center mt-8 mb-4 gap-3">
            <div class="inline-flex items-center rounded-full border border-gray-200 bg-white p-1 shadow-sm">
                <button
                    type="button"
                    :class="[
                        'rounded-full px-5 py-2 text-sm font-medium transition-all duration-200',
                        billingCycle === 'monthly'
                            ? 'bg-gray-900 text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                    ]"
                    @click="billingCycle = 'monthly'"
                >
                    {{ t('landing.pricing.billing.monthly') }}
                </button>
                <button
                    type="button"
                    :class="[
                        'flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-all duration-200',
                        billingCycle === 'yearly'
                            ? 'bg-gray-900 text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                    ]"
                    @click="billingCycle = 'yearly'"
                >
                    {{ t('landing.pricing.billing.yearly') }}
                    <span class="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white">
                        -{{ yearlySavings }}%
                    </span>
                </button>
            </div>
        </div>

        <!-- Pricing Cards Grid -->
        <div class="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-6">
            <UCard
v-for="plan in pricingPlans" :key="plan.id" :ui="{
                body: 'p-6 sm:p-8'
            }" :class="[
                'group relative overflow-hidden transition-all duration-300 hover:shadow-xl flex flex-col h-full',
                plan.highlighted && 'scale-105 lg:scale-110 z-10 ring-2 ring-primary'
            ]">
                <!-- Badge -->
                <div v-if="plan.badge" class="mb-4">
                    <UBadge
color="primary" variant="subtle" size="md"
                        class="animate-fade-in">
                        {{ plan.badge }}
                    </UBadge>
                </div>

                <!-- Plan Header -->
                <div class="mb-6">
                    <h3 class="text-2xl font-bold text-gray-900 dark:text-white mb-2 transition-colors">
                        {{ plan.name }}
                    </h3>
                    <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                        {{ plan.description }}
                    </p>
                </div>

                <!-- Price -->
                <div class="mb-6">
                    <div class="flex items-baseline gap-2">
                        <span
                            class="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white transition-all duration-300">
                            {{ plan.price }}
                        </span>
                        <span v-if="plan.billingCycle" class="text-lg text-gray-600 dark:text-gray-400">
                            {{ plan.billingCycle }}
                        </span>
                    </div>
                    <p v-if="plan.savings" class="mt-2 text-sm font-medium text-success">
                        {{ $t('landing.pricing.billing.savings', { amount: plan.savings }) }}
                    </p>
                </div>

                <!-- Features List -->
                <div class="mb-8 grow">
                    <ul class="space-y-4">
                        <li
v-for="(feature, index) in plan.features" :key="index"
                            class="flex items-start gap-3 group/item animate-fade-in"
                            :style="{ animationDelay: `${index * 50}ms` }">
                            <UIcon
name="i-heroicons-check-circle-solid"
                                class="w-5 h-5 text-primary shrink-0 mt-0.5 transition-transform group-hover/item:scale-110" />
                            <span class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                                {{ feature }}
                            </span>
                        </li>
                    </ul>
                </div>

                <!-- CTA Button -->
                <UButton
:variant="plan.highlighted ? 'solid' : 'outline'"
                    :color="plan.highlighted ? 'primary' : 'neutral'" size="lg" block
                    class="group relative overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/25 active:scale-95"
                    :to="plan.to">
                    <span class="relative z-10 transition-transform duration-300 group-hover:translate-x-1">
                        {{ plan.cta }}
                    </span>
                    <div class="absolute inset-0 bg-linear-to-r from-primary-600 to-primary-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </UButton>
            </UCard>
        </div>

        <!-- Bottom Note -->
        <div class="mt-12 text-center animate-fade-in" style="animation-delay: 400ms">
            <p class="text-sm text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                {{ $t('landing.pricing.note') }}
            </p>
        </div>
    </UPageSection>
</template>

<style scoped>
@keyframes fade-in {
    from {
        opacity: 0;
        transform: translateY(10px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.animate-fade-in {
    animation: fade-in 0.6s ease-out forwards;
    opacity: 0;
}

/* Smooth hover transition for cards */
.group:hover {
    transform: translateY(-4px);
}

/* Gradient overlay for highlighted plan */
.group.scale-105::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: linear-gradient(90deg, var(--color-primary-500), var(--color-primary-400));
    opacity: 0;
    transition: opacity 0.3s ease;
}

.group.scale-105:hover::before {
    opacity: 1;
}
</style>
