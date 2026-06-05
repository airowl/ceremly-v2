import { eq } from "drizzle-orm";
import { getDB } from "../utils/db";
import * as schema from "../database/schema";

export async function findOrganizationById(organizationId: string) {
    const db = getDB();
    const rows = await db
        .select()
        .from(schema.organization)
        .where(eq(schema.organization.id, organizationId))
        .limit(1);
    return rows[0] ?? null;
}

export async function findOrganizationsForUser(userId: string) {
    const db = getDB();
    return db
        .select({
            id: schema.organization.id,
            name: schema.organization.name,
            slug: schema.organization.slug,
            role: schema.member.role,
        })
        .from(schema.member)
        .innerJoin(
            schema.organization,
            eq(schema.member.organizationId, schema.organization.id),
        )
        .where(eq(schema.member.userId, userId));
}
