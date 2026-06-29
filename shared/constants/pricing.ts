/**
 * Ceremly pricing model — Free / Celebrazione / Atelier.
 * Used by both the frontend (usePricing) and the backend (eventAccess.service).
 *
 * - Free / Celebration are PER-EVENT states (events.tier field).
 * - Atelier is a property of the org/owner (active recurring subscription),
 *   resolved at runtime by isOrgAtelier via getPlanFromProductId.
 */

/** Check if a limit value means unlimited (sentinella -1, model-agnostic). */
export function isUnlimited(value: number): boolean {
    return value === -1;
}

/** Check if usage exceeds limit (respects unlimited). */
export function exceedsLimit(usage: number, limit: number): boolean {
    if (isUnlimited(limit)) return false;
    return usage >= limit;
}

/**
 * The three Ceremly tiers.
 * - 'free'/'celebration' are PER-EVENT states (events.tier field).
 * - 'atelier' is NOT a value of events.tier: it is a property of the org/owner
 *   (active recurring subscription), resolved at runtime.
 */
export type CeremlyTier = 'free' | 'celebration' | 'atelier';

/**
 * Limits per tier. `-1` = unlimited.
 *
 * MIXED SCOPE: `maxGuestsPerEvent`/`maxReminders` are PER-EVENT (depend on the
 * event tier). `maxActiveEvents` is PER-ORG and only meaningful for tiers that
 * describe an organization: Free (1) and Atelier (∞). 'celebration' is NOT an
 * org tier — it is the state of a single event — so its `maxActiveEvents`
 * (-1) is a PLACEHOLDER not used by enforcement: the event count checks whether
 * the ORG is Free or Atelier (see countActiveEventsByOrg + isOrgAtelier).
 */
export const CEREMLY_TIER_LIMITS: Record<
    CeremlyTier,
    { maxGuestsPerEvent: number; maxActiveEvents: number; maxReminders: number; unlimited: boolean }
> = {
    free: { maxGuestsPerEvent: 30, maxActiveEvents: 1, maxReminders: 3, unlimited: false },
    celebration: { maxGuestsPerEvent: 250, maxActiveEvents: -1, maxReminders: 3, unlimited: false },
    atelier: { maxGuestsPerEvent: -1, maxActiveEvents: -1, maxReminders: -1, unlimited: true },
};

/** Celebrazione price (one-time, EUR cents). */
export const CELEBRATION_PRICE_CENTS = 3900;
/** Atelier price (monthly recurring, EUR cents). */
export const ATELIER_PRICE_CENTS = 2400;
