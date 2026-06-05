import { and, eq } from "drizzle-orm";
import { getDB } from "../utils/db";
import * as schema from "../database/schema";

export async function findMembers(organizationId: string) {
    const db = getDB();
    return db
        .select()
        .from(schema.member)
        .where(eq(schema.member.organizationId, organizationId));
}

export async function findMemberRole(
    organizationId: string,
    userId: string,
): Promise<string | null> {
    const db = getDB();
    const rows = await db
        .select({ role: schema.member.role })
        .from(schema.member)
        .where(
            and(
                eq(schema.member.organizationId, organizationId),
                eq(schema.member.userId, userId),
            ),
        )
        .limit(1);
    return rows[0]?.role ?? null;
}
