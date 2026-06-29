/**
 * Event Access Service — resolution of the EFFECTIVE tier of an event (design §4).
 *
 * Three levels, in order:
 *   1. owner's org on Atelier (active subscription) -> atelier (unlimited);
 *   2. otherwise event.tier === 'celebration'        -> celebration (250);
 *   3. otherwise                                     -> free (30).
 *
 * isOrgAtelier derives the tier from the owner's SUBSCRIPTION via
 * getPlanFromProductId (Ceremly discriminant). Mirror of isOrgFreePlan.
 */
import type { CeremlyTier } from "~~/shared/constants/pricing";
import { CEREMLY_TIER_LIMITS } from "~~/shared/constants/pricing";
import { resolveOrgOwnerId, getUserPlanInfo } from "./planLimit.service";
import { getPlanFromProductId } from "~~/server/utils/creem";

/**
 * True if the ORG is on Atelier: the owner has a Creem subscription whose productId
 * maps to 'atelier'. Org without owner/subscription -> NOT Atelier (fail-safe
 * towards Free limits, never towards unlimited).
 */
export async function isOrgAtelier(organizationId: string): Promise<boolean> {
    const ownerId = await resolveOrgOwnerId(organizationId);
    if (!ownerId) return false;
    const { subscription } = await getUserPlanInfo(ownerId);
    if (!subscription?.productId) return false;
    return getPlanFromProductId(subscription.productId) === "atelier";
}

/** Per-event limits resolved from the effective tier. -1 = unlimited (atelier). */
export async function getEventLimits(event: {
    id: string;
    organizationId: string;
    tier: string;
}): Promise<{ tier: CeremlyTier; maxGuestsPerEvent: number; maxReminders: number }> {
    if (await isOrgAtelier(event.organizationId)) {
        const l = CEREMLY_TIER_LIMITS.atelier;
        return { tier: "atelier", maxGuestsPerEvent: l.maxGuestsPerEvent, maxReminders: l.maxReminders };
    }
    if (event.tier === "celebration") {
        const l = CEREMLY_TIER_LIMITS.celebration;
        return { tier: "celebration", maxGuestsPerEvent: l.maxGuestsPerEvent, maxReminders: l.maxReminders };
    }
    const l = CEREMLY_TIER_LIMITS.free;
    return { tier: "free", maxGuestsPerEvent: l.maxGuestsPerEvent, maxReminders: l.maxReminders };
}
