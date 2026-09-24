import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { TierLimits } from "./pricing";

/**
 * Per-organization limit overrides (plan Task 15).
 *
 * The admin console can raise or lower a single organization's limits; the plan
 * limits in `lib/pricing.ts` stay the default. An override field replaces the
 * plan value when present, `-1` meaning unlimited as everywhere else. Every
 * enforcement point reads through `applyLimitOverride`, so an override cannot be
 * honoured by one path and ignored by another.
 */

export const OVERRIDABLE_LIMITS = ["maxGuestsPerEvent", "maxActiveEvents", "maxReminders"] as const;
export type OverridableLimit = (typeof OVERRIDABLE_LIMITS)[number];

/**
 * Upper bound accepted from the console, per limit (fix round 1).
 *
 * Not a typo guard only: each enforcement point reads up to `limit + 1`
 * documents in the transaction that creates the resource, so the bound is what
 * keeps that read under Convex's per-transaction limits. `maxActiveEvents` reads
 * events (large documents: the whole invitation) → 500; `maxGuestsPerEvent`
 * reads the event's guests → 10,000; `maxReminders` → 50. `-1` (unlimited) skips
 * the count entirely.
 */
export const LIMIT_MAXIMA: Record<OverridableLimit, number> = {
    maxGuestsPerEvent: 10_000,
    maxActiveEvents: 500,
    maxReminders: 50,
};

type ReadCtx = QueryCtx | MutationCtx;

export async function findLimitOverride(
    ctx: ReadCtx,
    organizationId: Id<"organizations">,
): Promise<Doc<"organizationLimitOverrides"> | null> {
    return await ctx.db
        .query("organizationLimitOverrides")
        .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
        .unique();
}

/**
 * The plan limits with the override applied. `unlimited` is recomputed: an
 * Atelier organization whose guest cap was lowered is no longer "unlimited".
 */
export function applyLimitOverride<T extends TierLimits>(
    limits: T,
    override: Pick<Doc<"organizationLimitOverrides">, OverridableLimit> | null,
): T {
    if (!override) return limits;

    const merged = { ...limits };
    for (const key of OVERRIDABLE_LIMITS) {
        const value = override[key];
        if (value !== undefined) merged[key] = value;
    }
    merged.unlimited = OVERRIDABLE_LIMITS.every((key) => merged[key] === -1);
    return merged;
}

/** Part of the organization cascade: the override has no meaning without it. */
export async function deleteLimitOverrides(
    ctx: MutationCtx,
    organizationId: Id<"organizations">,
): Promise<void> {
    for (const row of await ctx.db
        .query("organizationLimitOverrides")
        .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
        .collect()) {
        await ctx.db.delete(row._id);
    }
}
