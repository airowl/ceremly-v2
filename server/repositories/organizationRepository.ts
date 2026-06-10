import { eq } from "drizzle-orm";
import { getDB } from "../utils/db";
import * as schema from "../database/schema";

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
