import { and, eq } from "drizzle-orm";
import { getDB } from "../utils/db";
import * as schema from "../database/schema";

export async function findPendingInvitations(organizationId: string) {
    const db = getDB();
    return db
        .select()
        .from(schema.invitation)
        .where(
            and(
                eq(schema.invitation.organizationId, organizationId),
                eq(schema.invitation.status, "pending"),
            ),
        );
}
