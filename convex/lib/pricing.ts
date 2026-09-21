/**
 * Pricing model inside Convex (plan Task 6).
 *
 * This is the Convex-side mirror of `shared/constants/pricing.ts`: Convex
 * bundles only files under `convex/`, so the shared module cannot be imported
 * from a deployed function. The two are kept honest by a contract test outside
 * Convex (`test/migration/billing-plan-contract.test.ts`) that fails if the tier
 * names or limits drift.
 *
 * Semantics carried over from the legacy app, unchanged:
 * - `free` / `celebration` describe a single *event* (`events.tier`).
 * - `atelier` is a property of the organization, resolved at runtime from an
 *   active Creem subscription — it is never a value of `events.tier`.
 * - `-1` means unlimited.
 */

export const CEREMLY_TIERS = ["free", "celebration", "atelier"] as const;
export type CeremlyTier = (typeof CEREMLY_TIERS)[number];

/** Values `events.tier` may take: the one-time event state only. */
export const EVENT_TIERS = ["free", "celebration"] as const;
export type EventTier = (typeof EVENT_TIERS)[number];

/** Plans that describe an organization (what `billing.planForActiveOrganization` returns). */
export const ORG_PLANS = ["free", "atelier"] as const;
export type OrgPlan = (typeof ORG_PLANS)[number];

export interface TierLimits {
    maxGuestsPerEvent: number;
    maxActiveEvents: number;
    maxReminders: number;
    unlimited: boolean;
}

export const TIER_LIMITS: Record<CeremlyTier, TierLimits> = {
    free: { maxGuestsPerEvent: 30, maxActiveEvents: 1, maxReminders: 3, unlimited: false },
    celebration: { maxGuestsPerEvent: 250, maxActiveEvents: -1, maxReminders: 3, unlimited: false },
    atelier: { maxGuestsPerEvent: -1, maxActiveEvents: -1, maxReminders: -1, unlimited: true },
};

/**
 * Convex environment variables holding the Creem product ids.
 *
 * On the deployment these are `CREEM_PRODUCT_ID_*`; the Nuxt/Vercel side keeps
 * `NUXT_CREEM_PRODUCT_ID_*` for the legacy integration, which is why the two
 * names live in different files instead of being derived from one.
 */
export const CREEM_PRODUCT_ENV = {
    celebration: "CREEM_PRODUCT_ID_CELEBRATION",
    atelier: "CREEM_PRODUCT_ID_ATELIER",
} as const satisfies Record<Exclude<CeremlyTier, "free">, string>;

export type PaidTier = keyof typeof CREEM_PRODUCT_ENV;

/** Product id configured for a paid tier, or `null` when the deployment has none. */
export function productIdForTier(tier: PaidTier): string | null {
    const value = process.env[CREEM_PRODUCT_ENV[tier]];
    return value && value.length > 0 ? value : null;
}

/**
 * Reverse mapping used by the webhook fulfillment to decide what a paid product
 * means. Returns `null` for a product this deployment does not know (for example
 * a product created after the billing env changed): an unknown product must not
 * silently provision anything.
 */
export function tierForProductId(productId: string | null | undefined): CeremlyTier | null {
    if (!productId) return null;
    if (productId === productIdForTier("celebration")) return "celebration";
    if (productId === productIdForTier("atelier")) return "atelier";
    return null;
}

/** Limits of the plan an organization is on (B2C orgs are simply `free`). */
export const limitsForOrgPlan = (plan: OrgPlan): TierLimits => TIER_LIMITS[plan];
