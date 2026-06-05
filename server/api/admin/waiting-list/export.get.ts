import { count, ilike, desc, asc, sql } from "drizzle-orm";
import * as schema from "~~/server/database/schema";
import { requireAdminApiKey } from "~~/server/utils/requireAdminApiKey";
import { getDB } from "~~/server/utils/db";

export interface WaitingListExportItem {
    id: string;
    email: string;
    language: string;
    createdAt: Date;
    source: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    ipAddress: string | null;
    userAgent: string | null;
}

export interface WaitingListExportResponse {
    items: WaitingListExportItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export default defineEventHandler(async (event) => {
    await requireAdminApiKey(event);

    const db = getDB();
    const query = getQuery(event);

    const format = (query.format as string) || "json";

    // Pagination (ignored for CSV — exports all rows)
    const page = Math.max(1, parseInt(query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit as string) || 20));
    const offset = (page - 1) * limit;

    // Filters
    const search = (query.search as string) || "";
    const sortBy = (query.sortBy as string) || "createdAt";
    const sortOrder = (query.sortOrder as string) || "desc";

    // Build where conditions
    const conditions = [];

    if (search) {
        conditions.push(ilike(schema.waitingList.email, `%${search}%`));
    }

    const whereClause = conditions.length > 0
        ? sql`${sql.join(conditions, sql` AND `)}`
        : undefined;

    // Get total count
    const [totalResult] = await db
        .select({ count: count() })
        .from(schema.waitingList)
        .where(whereClause);

    const total = totalResult?.count ?? 0;

    // Sort column mapping
    const sortColumn = sortBy === "email" ? schema.waitingList.email
        : sortBy === "language" ? schema.waitingList.language
            : schema.waitingList.createdAt;

    const orderFn = sortOrder === "asc" ? asc : desc;

    // CSV: export all rows, no pagination
    if (format === "csv") {
        const allRows = await db
            .select()
            .from(schema.waitingList)
            .where(whereClause)
            .orderBy(orderFn(sortColumn));

        const headers = [
            "id", "email", "language", "created_at",
            "source", "utm_source", "utm_medium", "utm_campaign",
            "ip_address", "user_agent",
        ];

        const csvRows = allRows.map((row) =>
            [
                row.id,
                row.email,
                row.language,
                row.createdAt.toISOString(),
                row.source ?? "",
                row.utmSource ?? "",
                row.utmMedium ?? "",
                row.utmCampaign ?? "",
                row.ipAddress ?? "",
                row.userAgent ? row.userAgent.replace(/"/g, '""') : "",
            ]
                .map((v) => `"${v}"`)
                .join(",")
        );

        const csv = [headers.join(","), ...csvRows].join("\n");

        setHeader(event, "Content-Type", "text/csv; charset=utf-8");
        setHeader(event, "Content-Disposition", `attachment; filename="waiting-list-${new Date().toISOString().slice(0, 10)}.csv"`);

        return csv;
    }

    // JSON: paginated
    const items = await db
        .select()
        .from(schema.waitingList)
        .where(whereClause)
        .orderBy(orderFn(sortColumn))
        .limit(limit)
        .offset(offset);

    return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
    } satisfies WaitingListExportResponse;
});
