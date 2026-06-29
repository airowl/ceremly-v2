import { config } from "dotenv";

import { and, eq } from "drizzle-orm";
import { getDB } from "../../utils/db";
import * as schema from "../schema";
import { isOrgFreePlan, resolveOrgOwnerId } from "../../services/planLimit.service";
config({ path: process.env.NUXT_ENV === "prod" ? ".env.prod" : ".env" });

/**
 * Gate FIX #1: the plan is resolved from the org OWNER, not the requester.
 *
 * Original bug: isFreePlan read the plan from the current user; a teammate
 * (admin/member) of a paying org has no personal subscription → treated
 * as Free → 402 "passa a Celebrazione" even though the org is paying.
 *
 * PROVEN INVARIANT (toggle on the OWNER's subscription):
 *  1. owner WITHOUT an active subscription → isOrgFreePlan === true.
 *  2. an ACTIVE subscription inserted for the OWNER → isOrgFreePlan === false.
 *  3. removed → back to true.
 * isOrgFreePlan(orgId) does not receive the requester at all: whether resources
 * are created by the owner or a non-owner teammate, the result depends ONLY on the owner →
 * the bug class is structurally eliminated.
 *
 * Self-contained: picks a real org, uses a temporary subscription keyed on
 * the owner and always removes it (finally). Requires a live Postgres.
 */
async function main() {
    const db = getDB();

    // Org with more members (for a stronger demonstration if a teammate exists),
    // otherwise the first org with a resolvable owner.
    const orgRows = await db
        .select({
            id: schema.organization.id,
            slug: schema.organization.slug,
            userId: schema.member.userId,
            role: schema.member.role,
        })
        .from(schema.organization)
        .innerJoin(schema.member, eq(schema.member.organizationId, schema.organization.id));

    const byOrg = new Map<string, { slug: string; members: { userId: string; role: string }[] }>();
    for (const r of orgRows) {
        const entry = byOrg.get(r.id) ?? { slug: r.slug, members: [] };
        entry.members.push({ userId: r.userId, role: r.role });
        byOrg.set(r.id, entry);
    }
    const candidates = [...byOrg.entries()]
        .filter(([, o]) => o.members.some((m) => m.role === "owner"))
        .sort((a, b) => b[1].members.length - a[1].members.length);
    if (candidates.length === 0) {
        throw new Error("no org with owner in DB: run `pnpm db:seed` or create an account");
    }
    const [orgId, org] = candidates[0]!;
    const owner = org.members.find((m) => m.role === "owner")!;
    const nonOwner = org.members.find((m) => m.role !== "owner");

    // Sanity: owner resolution matches the member with role=owner.
    const resolvedOwner = await resolveOrgOwnerId(orgId);
    if (resolvedOwner !== owner.userId) {
        console.error(`[FAIL] resolveOrgOwnerId expected ${owner.userId}, got ${resolvedOwner}`);
        process.exit(1);
    }

    // Baseline: the toggle requires the owner to NOT already have an active sub.
    const existingActive = await db
        .select({ id: schema.creem_subscription.id })
        .from(schema.creem_subscription)
        .where(and(
            eq(schema.creem_subscription.referenceId, owner.userId),
            eq(schema.creem_subscription.status, "active"),
        ))
        .limit(1);
    if (existingActive.length > 0) {
        console.error(`[SKIP] owner ${owner.userId.slice(0, 8)} already has an active subscription: cannot test the toggle without touching real data.`);
        process.exit(0);
    }

    let failed = false;
    const TEST_SUB_ID = `verify-plan-limit-${owner.userId}`;

    try {
        // 1. Owner without subscription → org Free.
        const freeBefore = await isOrgFreePlan(orgId);
        if (freeBefore !== true) {
            console.error(`[FAIL] owner without subscription: isOrgFreePlan expected true, got ${freeBefore}`);
            failed = true;
        }

        // 2. ACTIVE subscription for the OWNER → org NOT Free.
        await db.delete(schema.creem_subscription).where(eq(schema.creem_subscription.id, TEST_SUB_ID));
        await db.insert(schema.creem_subscription).values({
            id: TEST_SUB_ID,
            productId: "verify_plan_limit_premium",
            referenceId: owner.userId,
            status: "active",
        });

        const freeAfter = await isOrgFreePlan(orgId);
        if (freeAfter !== false) {
            console.error(`[FAIL] owner with active subscription: isOrgFreePlan expected false (paying org), got ${freeAfter}`);
            console.error("       → a non-owner teammate would still be blocked as Free: BUG #1 NOT resolved.");
            failed = true;
        }
    } finally {
        // Cleanup: ALWAYS removes the test subscription (even on failure).
        await db.delete(schema.creem_subscription).where(eq(schema.creem_subscription.id, TEST_SUB_ID));
    }

    // 3. Back to initial state (no sub) → Free again.
    const freeRestored = await isOrgFreePlan(orgId);
    if (freeRestored !== true) {
        console.error(`[FAIL] after cleanup: isOrgFreePlan expected true, got ${freeRestored}`);
        failed = true;
    }

    if (failed) {
        console.error("[verify-plan-limit] PLAN NOT RESOLVED FROM OWNER — fix #1 incomplete");
        process.exit(1);
    }
    console.log(
        `[verify-plan-limit] OK — org=${org.slug} owner=${owner.userId.slice(0, 8)}: `
        + `no-sub → free=true, active-sub → free=false, cleanup → free=true. `
        + `Plan depends ONLY on the owner${nonOwner ? ` (ignores teammate ${nonOwner.userId.slice(0, 8)})` : " (signature without requester)"}.`,
    );
    process.exit(0);
}

main().catch((e) => {
    console.error("[verify-plan-limit] error", e);
    process.exit(1);
});
