/**
 * Static pricing plans data
 * Used by both frontend and backend.
 *
 * Note: creemProductIds are populated from process.env (server-side).
 * On the client they are empty strings — the client uses runtimeConfig.public
 * via useSubscription for checkout.
 */

export interface PlanLimits {
    /** Maximum number of organizations (-1 = unlimited) */
    max_organizations: number;
    /** Maximum storage in MB (-1 = unlimited) */
    storage_mb: number;
    /** Maximum team members (-1 = unlimited) */
    team_members: number;
}

export interface PlanPricing {
    /** Monthly price in cents (EUR) */
    monthly: number;
    /** Yearly price in cents (EUR) */
    yearly: number;
}

export interface PlanFeature {
    /** Feature key for i18n */
    key: string;
    /** Fallback text if i18n not available */
    text: string;
}

export interface PricingPlan {
    id: string;
    name: string;
    description: string;
    limits: PlanLimits;
    pricing: PlanPricing;
    features: PlanFeature[];
    order: number;
    /** Creem product IDs — populated from env server-side, empty on client */
    creemProductIds: {
        monthly: string;
        yearly: string;
    };
}

export const PRICING_PLANS: Record<string, PricingPlan> = {
    starter: {
        id: "starter",
        name: "Starter",
        description: "Per progetti personali e piccoli team",
        limits: {
            max_organizations: 2,
            storage_mb: 500,
            team_members: 1,
        },
        pricing: {
            monthly: 900,
            yearly: 9000,
        },
        features: [
            { key: "plan.starter.organizations", text: "2 organizzazioni" },
            { key: "plan.starter.team", text: "1 membro del team" },
            { key: "plan.starter.emails", text: "200 email al mese" },
            { key: "plan.starter.storage", text: "500 MB di storage" },
            { key: "plan.starter.support", text: "Supporto email" },
        ],
        order: 1,
        creemProductIds: {
            monthly: process.env.NUXT_CREEM_PRODUCT_ID_STARTER_MONTH || "",
            yearly: process.env.NUXT_CREEM_PRODUCT_ID_STARTER_YEAR || "",
        },
    },
    premium: {
        id: "premium",
        name: "Premium",
        description: "Per team in crescita e startup",
        limits: {
            max_organizations: 5,
            storage_mb: 2000,
            team_members: 5,
        },
        pricing: {
            monthly: 3900,
            yearly: 39000,
        },
        features: [
            { key: "plan.premium.organizations", text: "5 organizzazioni" },
            { key: "plan.premium.team", text: "5 membri del team" },
            { key: "plan.premium.emails", text: "2000 email al mese" },
            { key: "plan.premium.storage", text: "2 GB di storage" },
            { key: "plan.premium.support", text: "Supporto prioritario" },
        ],
        order: 2,
        creemProductIds: {
            monthly: process.env.NUXT_CREEM_PRODUCT_ID_PREMIUM_MONTH || "",
            yearly: process.env.NUXT_CREEM_PRODUCT_ID_PREMIUM_YEAR || "",
        },
    },
    agency: {
        id: "agency",
        name: "Agency",
        description: "Per agenzie e aziende con più organizzazioni",
        limits: {
            max_organizations: -1,
            storage_mb: 10000,
            team_members: -1,
        },
        pricing: {
            monthly: 4900,
            yearly: 49000,
        },
        features: [
            { key: "plan.agency.organizations", text: "Organizzazioni illimitate" },
            { key: "plan.agency.team", text: "Membri del team illimitati" },
            { key: "plan.agency.emails", text: "Email illimitate" },
            { key: "plan.agency.storage", text: "10 GB di storage" },
            { key: "plan.agency.support", text: "Supporto 24/7" },
            { key: "plan.agency.api", text: "Accesso API" },
        ],
        order: 3,
        creemProductIds: {
            monthly: process.env.NUXT_CREEM_PRODUCT_ID_AGENCY_MONTH || "",
            yearly: process.env.NUXT_CREEM_PRODUCT_ID_AGENCY_YEAR || "",
        },
    },
};

/** Plans sorted by order, as array */
export const PRICING_PLANS_LIST: PricingPlan[] = Object.values(PRICING_PLANS)
    .sort((a, b) => a.order - b.order);

/**
 * Get limits for a specific plan.
 * Falls back to starter if plan not found.
 */
export function getPlanLimits(planName: string): PlanLimits {
    return PRICING_PLANS[planName]?.limits ?? PRICING_PLANS.starter!.limits;
}

/** Check if a limit value means unlimited */
export function isUnlimited(value: number): boolean {
    return value === -1;
}

/** Check if usage exceeds limit (respects unlimited) */
export function exceedsLimit(usage: number, limit: number): boolean {
    if (isUnlimited(limit)) return false;
    return usage >= limit;
}

/** Calculate yearly savings percentage */
export function calculateYearlySavings(
    monthlyPrice: number,
    yearlyPrice: number,
): number {
    if (monthlyPrice === 0) return 0;
    const yearlyEquivalent = monthlyPrice * 12;
    const savings = ((yearlyEquivalent - yearlyPrice) / yearlyEquivalent) * 100;
    return Math.round(savings);
}

/**
 * Ceremly: limiti del piano Free (org senza subscription Creem attiva).
 * Enforcement nel service layer; org con qualsiasi piano attivo = nessun limite.
 */
export const CEREMLY_FREE_LIMITS = {
    maxGuestsPerEvent: 30,
    maxActiveEvents: 1,
    maxReminders: 3,
} as const;
