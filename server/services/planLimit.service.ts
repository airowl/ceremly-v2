/**
 * Plan Limit Service
 * Functions to get user's subscription plan and validate limits.
 * All checks are scoped to events (the primary organizational entity).
 */
import { eq, and, count, gt } from "drizzle-orm";
import * as schema from "../database/schema";
import { getPlanLimits, exceedsLimit, isUnlimited, type PlanLimits } from "~~/shared/constants/pricing";
import { getDB } from "../utils/db";
import { getPlanFromProductId } from "../utils/creem";

export type PlanName = "starter" | "premium" | "agency";

export interface UserPlanInfo {
    plan: PlanName;
    limits: PlanLimits;
    subscription: typeof schema.creem_subscription.$inferSelect | null;
}

export type LimitType = 'event' | 'team'

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
    if (custom.maxEvents !== null) limits.max_events = custom.maxEvents;
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
        max_events: customLimits.max_events ?? planInfo.limits.max_events,
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

// ─── Event limit checks ─────────────────────────────────────────────

/**
 * Count events owned by a user
 */
export async function countUserEvents(userId: string): Promise<number> {
    const db = getDB();

    const result = await db
        .select({ count: count() })
        .from(schema.events)
        .where(eq(schema.events.userId, userId));

    return result[0]?.count ?? 0;
}

/**
 * Check if user can create a new event based on plan limits
 */
export async function canCreateEvent(userId: string): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    plan: PlanName;
}> {
    const effectiveInfo = await getEffectiveLimits(userId);
    const currentCount = await countUserEvents(userId);
    const limit = effectiveInfo.limits.max_events;

    return {
        allowed: !exceedsLimit(currentCount, limit),
        current: currentCount,
        limit: isUnlimited(limit) ? -1 : limit,
        plan: effectiveInfo.plan,
    };
}

// ─── Team member limit checks ───────────────────────────────────────

/**
 * Count team members for a specific event
 */
export async function countEventMembers(eventId: string): Promise<number> {
    const db = getDB();

    const result = await db
        .select({ count: count() })
        .from(schema.eventUsers)
        .where(eq(schema.eventUsers.eventId, eventId));

    return result[0]?.count ?? 0;
}

/**
 * Count pending (non-expired) invitations for a specific event
 */
export async function countPendingInvitations(eventId: string): Promise<number> {
    const db = getDB();

    const result = await db
        .select({ count: count() })
        .from(schema.invitations)
        .where(
            and(
                eq(schema.invitations.eventId, eventId),
                eq(schema.invitations.status, "pending"),
                gt(schema.invitations.expiresAt, new Date())
            )
        );

    return result[0]?.count ?? 0;
}

/**
 * Count total reserved team slots (members + pending invitations) for an event
 */
export async function countReservedSlots(eventId: string): Promise<number> {
    const [members, pending] = await Promise.all([
        countEventMembers(eventId),
        countPendingInvitations(eventId),
    ]);
    return members + pending;
}

/**
 * Check if a team member can be added to an event based on plan limits
 */
export async function canAddTeamMember(
    eventOwnerId: string,
    eventId: string
): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    plan: PlanName;
}> {
    const effectiveInfo = await getEffectiveLimits(eventOwnerId);
    const currentCount = await countReservedSlots(eventId);
    const limit = effectiveInfo.limits.team_members;

    return {
        allowed: !exceedsLimit(currentCount, limit),
        current: currentCount,
        limit: isUnlimited(limit) ? -1 : limit,
        plan: effectiveInfo.plan,
    };
}

// ─── Route-level limit functions ─────────────────────────────────────

/**
 * Get team limit for an event.
 * Looks up event by ID or falls back to user's first event. Delegates to canAddTeamMember.
 */
export async function getTeamLimit(
    userId: string,
    eventId?: string,
): Promise<{ allowed: boolean; current: number; limit: number; plan: string }> {
    const db = getDB();

    let eventRecord: { id: string; userId: string };

    if (eventId) {
        const eventResult = await db
            .select({
                id: schema.events.id,
                userId: schema.events.userId,
            })
            .from(schema.events)
            .where(eq(schema.events.id, eventId))
            .limit(1);

        if (!eventResult.length) {
            return {
                allowed: true,
                current: 0,
                limit: 1,
                plan: 'starter',
            };
        }

        eventRecord = eventResult[0]!;
    } else {
        const userEvents = await db
            .select({
                id: schema.events.id,
                userId: schema.events.userId,
            })
            .from(schema.events)
            .where(eq(schema.events.userId, userId))
            .limit(1);

        if (!userEvents.length) {
            return {
                allowed: true,
                current: 0,
                limit: 1,
                plan: 'starter',
            };
        }

        eventRecord = userEvents[0]!;
    }

    const ownerId = eventRecord.userId;
    const result = await canAddTeamMember(ownerId, eventRecord.id);

    return {
        allowed: result.allowed,
        current: result.current,
        limit: result.limit,
        plan: result.plan,
    };
}

// ─── Downgrade validation ────────────────────────────────────────────

/**
 * Validate if user can downgrade to a new plan.
 * Checks events and team members for violations.
 */
export async function validateDowngrade(
    userId: string,
    newPlan: string,
): Promise<{
    allowed: boolean;
    violations: Array<{
        resource: string;
        eventId?: string;
        eventName?: string;
        current: number;
        limit: number;
        message: string;
    }>;
    summary: {
        totalEvents: number;
        eventsChecked: number;
    };
}> {
    const db = getDB();
    const limits = getPlanLimits(newPlan);
    const violations: Array<{
        resource: string;
        eventId?: string;
        eventName?: string;
        current: number;
        limit: number;
        message: string;
    }> = [];

    // Get all user's events for per-event checks
    const userEvents = await db
        .select({ id: schema.events.id, name: schema.events.name })
        .from(schema.events)
        .where(eq(schema.events.userId, userId));

    // 1. Check events count (user scope)
    const eventsCount = await countUserEvents(userId);
    if (!isUnlimited(limits.max_events) && eventsCount > limits.max_events) {
        violations.push({
            resource: 'events',
            current: eventsCount,
            limit: limits.max_events,
            message: `You have ${eventsCount} events but the ${newPlan} plan allows only ${limits.max_events}`,
        });
    }

    // 2. Check team members per event
    for (const event of userEvents) {
        const [membersCount, pendingCount] = await Promise.all([
            countEventMembers(event.id),
            countPendingInvitations(event.id),
        ]);

        const totalMembers = membersCount + pendingCount;

        // Team members check
        if (!isUnlimited(limits.team_members) && totalMembers > limits.team_members) {
            violations.push({
                resource: 'team_members',
                eventId: event.id,
                eventName: event.name,
                current: totalMembers,
                limit: limits.team_members,
                message: `Event "${event.name}" has ${totalMembers} team members (${membersCount} active + ${pendingCount} pending) but the ${newPlan} plan allows only ${limits.team_members}`,
            });
        }
    }

    const summary = {
        totalEvents: eventsCount,
        eventsChecked: userEvents.length,
    };

    return {
        allowed: violations.length === 0,
        violations,
        summary,
    };
}
