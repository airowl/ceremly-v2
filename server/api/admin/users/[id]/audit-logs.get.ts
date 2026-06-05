import { eq, desc, or, and, gte, lte, count } from "drizzle-orm";
import * as schema from "~~/server/database/schema";
import { requireAdminApiKey } from "~~/server/utils/requireAdminApiKey";
import { getDB } from "~~/server/utils/db";

export interface AuditLogEntry {
    id: number;
    userId: string | null;
    organizationId: string | null;
    category: string;
    action: string;
    targetType: string | null;
    targetId: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    status: string;
    details: Record<string, unknown> | null;
    createdAt: Date;
}

export interface AuditLogResponse {
    logs: AuditLogEntry[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export default defineEventHandler(async (event): Promise<AuditLogResponse> => {
    await requireAdminApiKey(event);

    const db = getDB();
    const userId = getRouterParam(event, "id");
    const query = getQuery(event);

    if (!userId) {
        throw createError({
            statusCode: 400,
            statusMessage: "User ID is required",
        });
    }

    // Pagination
    const page = Math.max(1, parseInt(query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit as string) || 50));
    const offset = (page - 1) * limit;

    // Optional filters
    const category = query.category as string | undefined;
    const eventId = query.eventId as string | undefined;
    const startDate = query.startDate as string | undefined;
    const endDate = query.endDate as string | undefined;

    // Build conditions - logs where user is either the actor or the target
    const conditions = [
        or(
            eq(schema.auditLog.userId, userId),
            eq(schema.auditLog.targetId, userId)
        ),
    ];

    if (category) {
        conditions.push(eq(schema.auditLog.category, category));
    }

    if (eventId) {
        conditions.push(eq(schema.auditLog.organizationId, eventId));
    }

    if (startDate) {
        conditions.push(gte(schema.auditLog.createdAt, new Date(startDate)));
    }

    if (endDate) {
        conditions.push(lte(schema.auditLog.createdAt, new Date(endDate)));
    }

    const whereClause = and(...conditions);

    // Efficient count query (not SELECT * then .length)
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
        logs: logs as AuditLogEntry[],
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
    };
});
