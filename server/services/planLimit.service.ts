/**
 * Plan Service — Creem subscription resolution per organization.
 *
 * Ceremly model (Free/Celebration/Atelier): the only org-scoped gate is the
 * EVENT gate (guests/reminders/active-events), resolved elsewhere (eventAccess.service)
 * from the owner's subscription. Only shared resolvers live here:
 * - getUserPlanInfo: the user's active subscription (or null = Free).
 * - resolveOrgOwnerId: the owner who holds the org's subscription.
 * - isOrgFreePlan: true if the org is on the Free plan (owner has no active subscription).
 */
import { eq, and } from "drizzle-orm";
import * as schema from "../database/schema";
import { getDB } from "../utils/db";
import { findMembers } from "../repositories/memberRepository";

export interface UserPlanInfo {
    subscription: typeof schema.creem_subscription.$inferSelect | null;
}

/**
 * Get user's active Creem subscription (null = Free).
 */
export async function getUserPlanInfo(userId: string): Promise<UserPlanInfo> {
    const db = getDB();

    const subscriptions = await db
        .select()
        .from(schema.creem_subscription)
        .where(
            and(
                eq(schema.creem_subscription.referenceId, userId),
                eq(schema.creem_subscription.status, "active")
            )
        )
        .limit(1);

    return { subscription: subscriptions[0] ?? null };
}

/**
 * Resolves the userId of an org's owner (to use their subscription).
 * Deterministic: first member with role 'owner'. Fallback: first member.
 * Centralised here: reused both by auth.ts (accept-invitation gate) and by
 * org-scoped plan checks, so owner resolution is identical everywhere.
 */
export async function resolveOrgOwnerId(organizationId: string): Promise<string | null> {
    const members = await findMembers(organizationId);
    if (members.length === 0) return null;
    const owner = members.find((m) => m.role === "owner");
    return (owner ?? members[0]!).userId;
}

/**
 * True if the ORGANISATION is on the Free plan: the org owner has no active
 * Creem subscription.
 *
 * Ceremly resources (events/guests) are org-scoped, so the plan MUST be
 * resolved from the owner who holds the subscription — NOT from the requesting
 * user. Resolving from the requester treated every teammate of a paying org as
 * Free (no personal subscription), blocking them with a 402 even though the
 * org is paid.
 */
export async function isOrgFreePlan(organizationId: string): Promise<boolean> {
    const ownerId = await resolveOrgOwnerId(organizationId);
    if (!ownerId) {
        // Invariant: every org has an owner (Better Auth creates one at creation time).
        // If missing it is data corruption: better to fail clearly than misapply limits.
        throw createError({ statusCode: 500, statusMessage: "Owner dell'organizzazione non risolto" });
    }
    const planInfo = await getUserPlanInfo(ownerId);
    return planInfo.subscription === null;
}
