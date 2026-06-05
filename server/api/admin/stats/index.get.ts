import { count, eq, gte, sql } from "drizzle-orm";
import * as schema from "~~/server/database/schema";
import { requireAdminApiKey } from "~~/server/utils/requireAdminApiKey";
import { getDB } from "~~/server/utils/db";
import { getPlanFromProductId } from "~~/server/utils/creem";
import { PRICING_PLANS } from "~~/shared/constants/pricing";

export interface AdminStats {
    users: {
        total: number;
        newLast30Days: number;
        verified: number;
        banned: number;
    };
    events: {
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

    // Event stats
    const [totalEvents] = await db.select({ count: count() }).from(schema.events);
    const [newEvents] = await db.select({ count: count() })
        .from(schema.events)
        .where(gte(schema.events.createdAt, thirtyDaysAgo));

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

    const byPlan: Record<string, number> = {};
    for (const sub of activeSubsList) {
        const plan = getPlanFromProductId(sub.productId);
        byPlan[plan] = (byPlan[plan] || 0) + 1;
    }

    // Calculate MRR from pricing plans
    let mrr = 0;
    for (const sub of activeSubsList) {
        for (const [, plan] of Object.entries(PRICING_PLANS)) {
            if (sub.productId === plan.creemProductIds.monthly) {
                mrr += plan.pricing.monthly / 100;
            } else if (sub.productId === plan.creemProductIds.yearly) {
                mrr += (plan.pricing.yearly / 100) / 12;
            }
        }
    }

    return {
        users: {
            total: totalUsers?.count ?? 0,
            newLast30Days: newUsers?.count ?? 0,
            verified: verifiedUsers?.count ?? 0,
            banned: bannedUsers?.count ?? 0,
        },
        events: {
            total: totalEvents?.count ?? 0,
            newLast30Days: newEvents?.count ?? 0,
        },
        subscriptions: {
            total: totalSubscriptions?.count ?? 0,
            active: activeSubscriptions?.count ?? 0,
            byPlan,
        },
        mrr: Math.round(mrr * 100) / 100,
    };
});
