/**
 * GET /api/admin/audit-logs
 * Global audit log query with filtering and pagination.
 * Auth: requireAdminApiKey (NUXT_ADMIN_API_KEY header)
 */
import { eq, desc, and, gte, lte, like, or, count } from "drizzle-orm";
import * as schema from "~~/server/database/schema";
import { requireAdminApiKey } from "~~/server/utils/requireAdminApiKey";
import { getDB } from "~~/server/utils/db";

export default defineEventHandler(async (event) => {
    await requireAdminApiKey(event);

    const db = getDB();
    const query = getQuery(event);

    // Pagination
    const page = Math.max(1, parseInt(query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit as string) || 50));
    const offset = (page - 1) * limit;

    // Filters
    const category = query.category as string | undefined;
    const action = query.action as string | undefined;
    const userId = query.userId as string | undefined;
    const eventId = query.eventId as string | undefined;
    const status = query.status as string | undefined;
    const startDate = query.startDate as string | undefined;
    const endDate = query.endDate as string | undefined;
    const search = query.search as string | undefined;

    // Build conditions
    const conditions = [];

    if (category) {
        conditions.push(eq(schema.auditLog.category, category));
    }
    if (action) {
        conditions.push(eq(schema.auditLog.action, action));
    }
    if (userId) {
        conditions.push(eq(schema.auditLog.userId, userId));
    }
    if (eventId) {
        conditions.push(eq(schema.auditLog.organizationId, eventId));
    }
    if (status) {
        conditions.push(eq(schema.auditLog.status, status));
    }
    if (startDate) {
        conditions.push(gte(schema.auditLog.createdAt, new Date(startDate)));
    }
    if (endDate) {
        conditions.push(lte(schema.auditLog.createdAt, new Date(endDate)));
    }
    if (search) {
        conditions.push(
            or(
                like(schema.auditLog.action, `%${search}%`),
                like(schema.auditLog.targetId, `%${search}%`),
                like(schema.auditLog.userId, `%${search}%`)
            )
        );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Efficient count query
    const [countResult] = await db
        .select({ total: count() })
        .from(schema.auditLog)
        .where(whereClause);

    const total = countResult?.total ?? 0;

    // Get paginated logs
    const logs = await db
        .select()
        .from(schema.auditLog)
        .where(whereClause)
        .orderBy(desc(schema.auditLog.createdAt))
        .limit(limit)
        .offset(offset);

    return {
        logs,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
    };
});
