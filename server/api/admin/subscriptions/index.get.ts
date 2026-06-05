import { count, eq, desc, asc, sql } from "drizzle-orm";
import * as schema from "~~/server/database/schema";
import { requireAdminApiKey } from "~~/server/utils/requireAdminApiKey";
import { getDB } from "~~/server/utils/db";

export interface AdminSubscriptionListItem {
    id: string;
    productId: string;
    referenceId: string;
    creemCustomerId: string | null;
    creemSubscriptionId: string | null;
    creemOrderId: string | null;
    status: string | null;
    periodStart: Date | null;
    periodEnd: Date | null;
    cancelAtPeriodEnd: boolean | null;
    userName: string | null;
    userEmail: string | null;
}

export interface AdminSubscriptionListResponse {
    subscriptions: AdminSubscriptionListItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export default defineEventHandler(async (event): Promise<AdminSubscriptionListResponse> => {
    await requireAdminApiKey(event);

    const db = getDB();
    const query = getQuery(event);

    // Pagination
    const page = Math.max(1, parseInt(query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit as string) || 20));
    const offset = (page - 1) * limit;

    // Filters
    const search = (query.search as string) || "";
    const statusFilter = query.status as string | undefined;
    const sortBy = (query.sortBy as string) || "periodEnd";
    const sortOrder = (query.sortOrder as string) || "desc";

    // Build conditions
    const conditions = [];

    if (statusFilter) {
        conditions.push(eq(schema.creem_subscription.status, statusFilter));
    }

    const whereClause = conditions.length > 0
        ? sql`${sql.join(conditions, sql` AND `)}`
        : undefined;

    // Get total count
    const [totalResult] = await db
        .select({ count: count() })
        .from(schema.creem_subscription)
        .where(whereClause);

    const total = totalResult?.count ?? 0;

    // Determine sort column
    const sortColumn = sortBy === "status" ? schema.creem_subscription.status
        : sortBy === "periodStart" ? schema.creem_subscription.periodStart
            : schema.creem_subscription.periodEnd;

    const orderFn = sortOrder === "asc" ? asc : desc;

    // Get subscriptions with user info
    let subscriptionsQuery = db
        .select({
            id: schema.creem_subscription.id,
            productId: schema.creem_subscription.productId,
            referenceId: schema.creem_subscription.referenceId,
            creemCustomerId: schema.creem_subscription.creemCustomerId,
            creemSubscriptionId: schema.creem_subscription.creemSubscriptionId,
            creemOrderId: schema.creem_subscription.creemOrderId,
            status: schema.creem_subscription.status,
            periodStart: schema.creem_subscription.periodStart,
            periodEnd: schema.creem_subscription.periodEnd,
            cancelAtPeriodEnd: schema.creem_subscription.cancelAtPeriodEnd,
            userName: schema.user.name,
            userEmail: schema.user.email,
        })
        .from(schema.creem_subscription)
        .leftJoin(
            schema.user,
            eq(schema.creem_subscription.referenceId, schema.user.id)
        )
        .where(whereClause)
        .orderBy(orderFn(sortColumn))
        .limit(limit)
        .offset(offset);

    // Apply search filter on user name/email if provided
    if (search) {
        subscriptionsQuery = db
            .select({
                id: schema.creem_subscription.id,
                productId: schema.creem_subscription.productId,
                referenceId: schema.creem_subscription.referenceId,
                creemCustomerId: schema.creem_subscription.creemCustomerId,
                creemSubscriptionId: schema.creem_subscription.creemSubscriptionId,
                creemOrderId: schema.creem_subscription.creemOrderId,
                status: schema.creem_subscription.status,
                periodStart: schema.creem_subscription.periodStart,
                periodEnd: schema.creem_subscription.periodEnd,
                cancelAtPeriodEnd: schema.creem_subscription.cancelAtPeriodEnd,
                userName: schema.user.name,
                userEmail: schema.user.email,
            })
            .from(schema.creem_subscription)
            .leftJoin(
                schema.user,
                eq(schema.creem_subscription.referenceId, schema.user.id)
            )
            .where(
                sql`(${schema.user.name} ILIKE ${`%${search}%`} OR ${schema.user.email} ILIKE ${`%${search}%`})${whereClause ? sql` AND ${whereClause}` : sql``}`
            )
            .orderBy(orderFn(sortColumn))
            .limit(limit)
            .offset(offset);
    }

    const subscriptions = await subscriptionsQuery;

    return {
        subscriptions,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
    };
});
