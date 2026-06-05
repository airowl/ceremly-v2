/**
 * usePricing Composable
 * Provides reactive access to static pricing plans
 */

import {
    PRICING_PLANS_LIST,
    calculateYearlySavings,
    type PricingPlan,
} from '~~/shared/constants/pricing'
import { formatCurrencyAmount } from '~~/shared/utils/currency'

export interface PricingPlanView extends PricingPlan {
    pricing: PricingPlan['pricing'] & {
        monthlyFormatted: string
        yearlyFormatted: string
        yearlySavingsPercent: number
    }
}

export interface UsePricingReturn {
    plans: Ref<PricingPlanView[]>
    isLoading: Ref<boolean>
    getPlan: (planId: string) => PricingPlanView | undefined
    getPrice: (planId: string, interval: 'monthly' | 'yearly') => number
    getFormattedPrice: (planId: string, interval: 'monthly' | 'yearly') => string
    getSavingsPercent: (planId: string) => number
}

const buildPlans = (): PricingPlanView[] =>
    PRICING_PLANS_LIST.map(plan => ({
        ...plan,
        pricing: {
            ...plan.pricing,
            monthlyFormatted: formatCurrencyAmount(plan.pricing.monthly),
            yearlyFormatted: formatCurrencyAmount(plan.pricing.yearly),
            yearlySavingsPercent: calculateYearlySavings(plan.pricing.monthly, plan.pricing.yearly),
        },
    }))

// Built once at module level — static data, no reactivity needed
const staticPlans: PricingPlanView[] = buildPlans()

export const usePricing = (): UsePricingReturn => {
    const plans = shallowRef<PricingPlanView[]>(staticPlans)
    const isLoading = ref(false)

    const getPlan = (planId: string): PricingPlanView | undefined =>
        staticPlans.find(p => p.id === planId)

    const getPrice = (planId: string, interval: 'monthly' | 'yearly'): number =>
        getPlan(planId)?.pricing[interval] ?? 0

    const getFormattedPrice = (planId: string, interval: 'monthly' | 'yearly'): string => {
        const plan = getPlan(planId)
        if (!plan) return formatCurrencyAmount(0)
        return interval === 'monthly'
            ? plan.pricing.monthlyFormatted
            : plan.pricing.yearlyFormatted
    }

    const getSavingsPercent = (planId: string): number =>
        getPlan(planId)?.pricing.yearlySavingsPercent ?? 0

    return { plans, isLoading, getPlan, getPrice, getFormattedPrice, getSavingsPercent }
}

/** Format price amount (cents) to display string */
export const formatPriceAmount = (amountInCents: number): string =>
    formatCurrencyAmount(amountInCents)

/** Check if a limit is unlimited (-1) */
export const isUnlimited = (value: number): boolean => value === -1

/** Format limit for display */
export const formatLimit = (value: number, unlimitedText: string = 'Illimitati'): string =>
    isUnlimited(value) ? unlimitedText : value.toString()
