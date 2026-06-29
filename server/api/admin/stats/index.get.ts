import { count, eq, gte, sql } from "drizzle-orm";
import * as schema from "~~/server/database/schema";
import { requireAdminApiKey } from "~~/server/utils/requireAdminApiKey";
import { getDB } from "~~/server/utils/db";
import { getPlanFromProductId } from "~~/server/utils/creem";
import { ATELIER_PRICE_CENTS } from "~~/shared/constants/pricing";

export interface AdminStats {
    users: {
        total: number;
        newLast30Days: number;
        verified: number;
        banned: number;
    };
    organizations: {
        total: number;
        newLast30Days: number;
    };
    subscriptions: {
        total: number;
        active: number;
        byPlan: Record<string, number>;
    };
    mrr: number;
}

export default defineEventHandler(async (event): Promise<AdminStats> => {
    await requireAdminApiKey(event);

    const db = getDB();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // User stats
    const [totalUsers] = await db.select({ count: count() }).from(schema.user);
    const [newUsers] = await db.select({ count: count() })
        .from(schema.user)
        .where(gte(schema.user.createdAt, thirtyDaysAgo));
    const [verifiedUsers] = await db.select({ count: count() })
        .from(schema.user)
        .where(eq(schema.user.emailVerified, true));
    const [bannedUsers] = await db.select({ count: count() })
        .from(schema.user)
        .where(eq(schema.user.banned, true));

    // Organization stats (phase 1c — replaces the event stubs from 1a)
    const [totalOrganizations] = await db.select({ count: count() }).from(schema.organization);
    const [newOrganizations] = await db.select({ count: count() })
        .from(schema.organization)
        .where(gte(schema.organization.createdAt, thirtyDaysAgo));

    // Subscription stats
    const [totalSubscriptions] = await db.select({ count: count() }).from(schema.creem_subscription);
    const [activeSubscriptions] = await db.select({ count: count() })
        .from(schema.creem_subscription)
        .where(
            sql`${schema.creem_subscription.status} IN ('active', 'trialing')`
        );

    // Get active subscriptions to compute plan breakdown
    const activeSubsList = await db.select({
        productId: schema.creem_subscription.productId,
    })
        .from(schema.creem_subscription)
        .where(sql`${schema.creem_subscription.status} IN ('active', 'trialing')`);

    // Breakdown by Ceremly tier: only Atelier is recurring (Celebration is
    // one-time per-event and does not generate a subscription).
    const byPlan: Record<string, number> = {};
    for (const sub of activeSubsList) {
        const plan = getPlanFromProductId(sub.productId) ?? "unknown";
        byPlan[plan] = (byPlan[plan] || 0) + 1;
    }

    // MRR = active Atelier subscriptions × monthly Atelier price.
    const atelierCount = byPlan.atelier ?? 0;
    const mrr = atelierCount * (ATELIER_PRICE_CENTS / 100);

    return {
        users: {
            total: totalUsers?.count ?? 0,
            newLast30Days: newUsers?.count ?? 0,
            verified: verifiedUsers?.count ?? 0,
            banned: bannedUsers?.count ?? 0,
        },
        organizations: {
            total: totalOrganizations?.count ?? 0,
            newLast30Days: newOrganizations?.count ?? 0,
        },
        subscriptions: {
            total: totalSubscriptions?.count ?? 0,
            active: activeSubscriptions?.count ?? 0,
            byPlan,
        },
        mrr: Math.round(mrr * 100) / 100,
    };
});
