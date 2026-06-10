/**
 * Plan Limit Service
 * Functions to get user's subscription plan and validate limits.
 * All checks are scoped to organizations (the primary tenant entity).
 */
import { eq, and } from "drizzle-orm";
import * as schema from "../database/schema";
import { getPlanLimits, exceedsLimit, isUnlimited, type PlanLimits } from "~~/shared/constants/pricing";
import { getDB } from "../utils/db";
import { getPlanFromProductId } from "../utils/creem";
import { findMembers } from "../repositories/memberRepository";
import { findPendingInvitations } from "../repositories/invitationRepository";

export type PlanName = "starter" | "premium" | "agency";

export interface UserPlanInfo {
    plan: PlanName;
    limits: PlanLimits;
    subscription: typeof schema.creem_subscription.$inferSelect | null;
}

export type LimitType = 'organization' | 'team'

export interface LimitCheck {
    allowed: boolean
    current: number
    limit: number
    plan: PlanName
}

export interface EffectiveLimitsInfo {
    limits: PlanLimits;
    planLimits: PlanLimits;
    customLimits: Partial<PlanLimits> | null;
    hasCustom: boolean;
    plan: PlanName;
}

/**
 * Get user's current plan from creem_subscription table
 * Returns 'starter' if no active subscription found
 */
export async function getUserPlan(userId: string): Promise<PlanName> {
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

    const userSubscription = subscriptions[0];

    if (!userSubscription) {
        return "starter";
    }

    const plan = getPlanFromProductId(userSubscription.productId);
    if (plan === "starter" || plan === "premium" || plan === "agency") {
        return plan;
    }

    return "starter";
}

/**
 * Get user's plan info including limits
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

    const userSubscription = subscriptions[0] ?? null;

    let plan: PlanName = "starter";
    if (userSubscription) {
        const planName = getPlanFromProductId(userSubscription.productId);
        if (planName === "starter" || planName === "premium" || planName === "agency") {
            plan = planName;
        }
    }

    return {
        plan,
        limits: getPlanLimits(plan),
        subscription: userSubscription,
    };
}

/**
 * Get user's custom limits override (if any)
 * Returns null if no custom limits are set
 */
export async function getUserCustomLimits(userId: string): Promise<Partial<PlanLimits> | null> {
    const db = getDB();

    const result = await db
        .select()
        .from(schema.userCustomLimits)
        .where(eq(schema.userCustomLimits.userId, userId))
        .limit(1);

    const custom = result[0];
    if (!custom) return null;

    const limits: Partial<PlanLimits> = {};
    if (custom.maxOrganizations !== null) limits.max_organizations = custom.maxOrganizations;
    if (custom.storageMb !== null) limits.storage_mb = custom.storageMb;
    if (custom.teamMembers !== null) limits.team_members = custom.teamMembers;

    return Object.keys(limits).length > 0 ? limits : null;
}

/**
 * Get effective limits for a user (plan limits merged with custom overrides)
 * Custom limits take precedence over plan limits
 */
export async function getEffectiveLimits(userId: string): Promise<EffectiveLimitsInfo> {
    const planInfo = await getUserPlanInfo(userId);
    const customLimits = await getUserCustomLimits(userId);

    if (!customLimits) {
        return {
            limits: planInfo.limits,
            planLimits: planInfo.limits,
            customLimits: null,
            hasCustom: false,
            plan: planInfo.plan,
        };
    }

    const effectiveLimits: PlanLimits = {
        ...planInfo.limits,
        max_organizations: customLimits.max_organizations ?? planInfo.limits.max_organizations,
        storage_mb: customLimits.storage_mb ?? planInfo.limits.storage_mb,
        team_members: customLimits.team_members ?? planInfo.limits.team_members,
    };

    return {
        limits: effectiveLimits,
        planLimits: planInfo.limits,
        customLimits,
        hasCustom: true,
        plan: planInfo.plan,
    };
}

// ─── Organization limit checks ──────────────────────────────────────

/**
 * Count organizations OWNED by a user (role === "owner").
 * Essere membro/admin di org altrui NON consuma il limite di creazione.
 */
export async function countUserOrganizations(userId: string): Promise<number> {
    const db = getDB();
    const rows = await db
        .select({ id: schema.member.organizationId })
        .from(schema.member)
        .where(
            and(
                eq(schema.member.userId, userId),
                eq(schema.member.role, "owner"),
            ),
        );
    return rows.length;
}

/**
 * Check if user can create a new organization based on plan limits.
 */
export async function canCreateOrganization(userId: string): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    plan: PlanName;
}> {
    const effectiveInfo = await getEffectiveLimits(userId);
    const limit = effectiveInfo.limits.max_organizations;
    const current = await countUserOrganizations(userId);

    return {
        allowed: !exceedsLimit(current, limit),
        current,
        limit: isUnlimited(limit) ? -1 : limit,
        plan: effectiveInfo.plan,
    };
}

// ─── Team member limit checks ───────────────────────────────────────

/**
 * Count team members for a specific event
 * STUB phase 1a — sostituito da countOrgMembers in 1c
 */
export async function countEventMembers(_eventId: string): Promise<number> {
    return 0; // STUB phase 1a — query su schema.eventUsers rimossa; 1c conta i membri org
}

/**
 * Count pending (non-expired) invitations for a specific event
 * STUB phase 1a — sostituito da countPendingOrgInvitations in 1c
 */
export async function countPendingInvitations(_eventId: string): Promise<number> {
    return 0; // STUB phase 1a — query su schema.invitations rimossa; 1c conta gli inviti org
}

/**
 * Count total reserved team slots (members + pending invitations) for an event
 */
export async function countReservedSlots(eventId: string): Promise<number> {
    const [members, pending] = await Promise.all([
        countEventMembers(eventId),
        countPendingInvitations(eventId),
    ]);
    return members + pending; // STUB phase 1a — risulta sempre 0 (entrambi stub)
}

/**
 * Count current members of an organization (phase 1b — org-aware).
 */
export async function countOrgMembers(organizationId: string): Promise<number> {
    const members = await findMembers(organizationId);
    return members.length;
}

/**
 * Count pending (status='pending') invitations of an organization (phase 1b — org-aware).
 */
export async function countPendingOrgInvitations(organizationId: string): Promise<number> {
    const pending = await findPendingInvitations(organizationId);
    return pending.length;
}

/**
 * Check if a team member can be added to an organization based on plan limits.
 * Org-aware (phase 1b): conta i membri OLTRE l'owner + inviti pending sull'org.
 * Il limite è quello dell'OWNER del piano (ownerId), non dell'invitante.
 *
 * SEMANTICA LIMITE: `team_members` è il numero di teammate OLTRE l'owner
 * (l'owner non consuma uno slot). Es. starter=1 → owner + 1 teammate.
 * current = max(0, members - 1) + pending.
 *
 * NOTE: la firma resta (ownerId, organizationId) per compatibilità con il
 * re-export in server/utils/userPlan.ts. Il 2° param è ora un organizationId.
 */
export async function canAddTeamMember(
    ownerId: string,
    organizationId: string
): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    plan: PlanName;
}> {
    const effectiveInfo = await getEffectiveLimits(ownerId);
    const limit = effectiveInfo.limits.team_members;

    const [members, pending] = await Promise.all([
        countOrgMembers(organizationId),
        countPendingOrgInvitations(organizationId),
    ]);
    // L'owner non conta nel limite: i teammate sono i membri oltre l'owner.
    const current = Math.max(0, members - 1) + pending;

    return {
        allowed: !exceedsLimit(current, limit),
        current,
        limit: isUnlimited(limit) ? -1 : limit,
        plan: effectiveInfo.plan,
    };
}

// ─── Route-level limit functions ─────────────────────────────────────

/**
 * Get team limit for an event.
 * STUB phase 1a — query su schema.events rimosse; 1c risolve rispetto a org membership.
 */
export async function getTeamLimit(
    userId: string,
    _eventId?: string,
): Promise<{ allowed: boolean; current: number; limit: number; plan: string }> {
    // STUB phase 1a — non interroga schema.events né schema.eventUsers; 1c è org-aware
    const result = await canAddTeamMember(userId, '');
    return {
        allowed: result.allowed,
        current: result.current,
        limit: result.limit,
        plan: result.plan,
    };
}

// ─── Downgrade validation ────────────────────────────────────────────

export interface DowngradeViolation {
    resource: 'organizations' | 'team_members';
    organizationId?: string;
    organizationName?: string;
    current: number;
    limit: number;
    message: string;
}

/**
 * Validate if a user can downgrade to a new plan (org-aware).
 * Confronta l'uso corrente con i limiti del piano di destinazione:
 * - organizzazioni possedute vs max_organizations
 * - membri+inviti per ogni org posseduta vs team_members
 * Una violazione è current > limit (stare ESATTAMENTE al limite è consentito;
 * a differenza della creazione che blocca su >=).
 */
export async function validateDowngrade(
    userId: string,
    newPlan: string,
): Promise<{
    allowed: boolean;
    violations: DowngradeViolation[];
    summary: {
        totalOrganizations: number;
        organizationsChecked: number;
    };
}> {
    const db = getDB();
    const targetLimits = getPlanLimits(newPlan);
    const violations: DowngradeViolation[] = [];

    // Org possedute dall'utente (owner) con nome, in una sola query.
    const ownedOrgs = await db
        .select({ id: schema.organization.id, name: schema.organization.name })
        .from(schema.member)
        .innerJoin(schema.organization, eq(schema.member.organizationId, schema.organization.id))
        .where(and(eq(schema.member.userId, userId), eq(schema.member.role, "owner")));

    const overLimit = (current: number, limit: number) => !isUnlimited(limit) && current > limit;

    // 1. Limite numero di organizzazioni.
    const orgCount = ownedOrgs.length;
    if (overLimit(orgCount, targetLimits.max_organizations)) {
        violations.push({
            resource: 'organizations',
            current: orgCount,
            limit: targetLimits.max_organizations,
            message: `Hai ${orgCount} organizzazioni ma il piano selezionato ne consente ${targetLimits.max_organizations}. Eliminane ${orgCount - targetLimits.max_organizations} prima del downgrade.`,
        });
    }

    // 2. Limite membri team, per ogni org posseduta.
    const teamLimit = targetLimits.team_members;
    if (!isUnlimited(teamLimit)) {
        const perOrg = await Promise.all(
            ownedOrgs.map(async (org) => {
                const [members, pending] = await Promise.all([
                    countOrgMembers(org.id),
                    countPendingOrgInvitations(org.id),
                ]);
                // current = teammate oltre l'owner + inviti pending (stessa semantica di canAddTeamMember).
                return { org, current: Math.max(0, members - 1) + pending };
            }),
        );
        for (const { org, current } of perOrg) {
            if (overLimit(current, teamLimit)) {
                violations.push({
                    resource: 'team_members',
                    organizationId: org.id,
                    organizationName: org.name,
                    current,
                    limit: teamLimit,
                    message: `L'organizzazione "${org.name}" ha ${current} membri/inviti ma il piano selezionato ne consente ${teamLimit}.`,
                });
            }
        }
    }

    return {
        allowed: violations.length === 0,
        violations,
        summary: {
            totalOrganizations: orgCount,
            organizationsChecked: orgCount,
        },
    };
}
