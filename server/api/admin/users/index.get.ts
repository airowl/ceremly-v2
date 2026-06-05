import { count, eq, ilike, or, desc, asc, sql } from "drizzle-orm";
import * as schema from "~~/server/database/schema";
import { requireAdminApiKey } from "~~/server/utils/requireAdminApiKey";
import { getDB } from "~~/server/utils/db";

export interface AdminUserListItem {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image: string | null;
    role: string | null;
    banned: boolean | null;
    banReason: string | null;
    createdAt: Date;
    updatedAt: Date;
    subscriptionProductId: string | null;
    subscriptionStatus: string | null;
}

export interface AdminUserListResponse {
    users: AdminUserListItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export default defineEventHandler(async (event): Promise<AdminUserListResponse> => {
    await requireAdminApiKey(event);

    const db = getDB();
    const query = getQuery(event);

    // Pagination
    const page = Math.max(1, parseInt(query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit as string) || 20));
    const offset = (page - 1) * limit;

    // Filters
    const search = (query.search as string) || "";
    const roleFilter = query.role as string | undefined;
    const statusFilter = query.status as string | undefined;
    const sortBy = (query.sortBy as string) || "createdAt";
    const sortOrder = (query.sortOrder as string) || "desc";

    // Build where conditions
    const conditions = [];

    if (search) {
        conditions.push(
            or(
                ilike(schema.user.name, `%${search}%`),
                ilike(schema.user.email, `%${search}%`)
            )
        );
    }

    if (roleFilter) {
        if (roleFilter === "user") {
            conditions.push(
                or(
                    eq(schema.user.role, "user"),
                    sql`${schema.user.role} IS NULL`
                )
            );
        } else {
            conditions.push(eq(schema.user.role, roleFilter));
        }
    }

    if (statusFilter === "banned") {
        conditions.push(eq(schema.user.banned, true));
    } else if (statusFilter === "active") {
        conditions.push(
            or(
                eq(schema.user.banned, false),
                sql`${schema.user.banned} IS NULL`
            )
        );
    } else if (statusFilter === "unverified") {
        conditions.push(eq(schema.user.emailVerified, false));
    }

    // Get total count
    const whereClause = conditions.length > 0
        ? sql`${sql.join(conditions, sql` AND `)}`
        : undefined;

    const [totalResult] = await db
        .select({ count: count() })
        .from(schema.user)
        .where(whereClause);

    const total = totalResult?.count ?? 0;

    // Get users with subscription info
    const sortColumn = sortBy === "name" ? schema.user.name
        : sortBy === "email" ? schema.user.email
            : schema.user.createdAt;

    const orderFn = sortOrder === "asc" ? asc : desc;

    const users = await db
        .select({
            id: schema.user.id,
            name: schema.user.name,
            email: schema.user.email,
            emailVerified: schema.user.emailVerified,
            image: schema.user.image,
            role: schema.user.role,
            banned: schema.user.banned,
            banReason: schema.user.banReason,
            createdAt: schema.user.createdAt,
            updatedAt: schema.user.updatedAt,
            subscriptionProductId: schema.creem_subscription.productId,
            subscriptionStatus: schema.creem_subscription.status,
        })
        .from(schema.user)
        .leftJoin(
            schema.creem_subscription,
            eq(schema.user.id, schema.creem_subscription.referenceId)
        )
        .where(whereClause)
        .orderBy(orderFn(sortColumn))
        .limit(limit)
        .offset(offset);

    return {
        users,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
    };
});
