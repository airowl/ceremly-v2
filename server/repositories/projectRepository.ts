import { eq } from "drizzle-orm";
import { getDB } from "../utils/db";
import * as schema from "../database/schema";

export async function findProjectsByOrg(organizationId: string) {
    const db = getDB();
    return db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.organizationId, organizationId));
}
