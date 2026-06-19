/**
 * Event Access Service — risoluzione del tier EFFETTIVO di un evento (design §4).
 *
 * Tre livelli, in ordine:
 *   1. org dell'owner su Atelier (subscription attiva) -> atelier (illimitato);
 *   2. altrimenti event.tier === 'celebration'          -> celebration (250);
 *   3. altrimenti                                        -> free (30).
 *
 * isOrgAtelier deriva il tier dalla SUBSCRIPTION dell'owner via
 * getPlanFromProductId (discriminante Ceremly), NON da getUserPlanInfo().plan
 * (che resta B2B: Atelier->'agency'). Mirror di isOrgFreePlan. Così il sistema
 * gate org/team legacy resta intatto.
 */
import type { CeremlyTier } from "~~/shared/constants/pricing";
import { CEREMLY_TIER_LIMITS } from "~~/shared/constants/pricing";
import { resolveOrgOwnerId, getUserPlanInfo } from "./planLimit.service";
import { getPlanFromProductId } from "~~/server/utils/creem";

/**
 * True se l'ORG è su Atelier: l'owner ha una subscription Creem la cui productId
 * mappa a 'atelier'. Org senza owner/subscription -> NON Atelier (fail-safe
 * verso i limiti Free, mai verso illimitato).
 */
export async function isOrgAtelier(organizationId: string): Promise<boolean> {
    const ownerId = await resolveOrgOwnerId(organizationId);
    if (!ownerId) return false;
    const { subscription } = await getUserPlanInfo(ownerId);
    if (!subscription?.productId) return false;
    return getPlanFromProductId(subscription.productId) === "atelier";
}

/** Limiti per-evento risolti dal tier effettivo. -1 = illimitato (atelier). */
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
