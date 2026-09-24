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

/** Upper bound accepted from the console: large enough, small enough to be a typo guard. */
export const MAX_LIMIT_VALUE = 1_000_000;

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
