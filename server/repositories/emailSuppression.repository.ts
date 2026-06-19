import { eq } from "drizzle-orm";
import { getDB } from "../utils/db";
import * as schema from "../database/schema";

export async function isEmailSuppressed(email: string): Promise<boolean> {
    const db = getDB();
    const rows = await db
        .select({ id: schema.emailSuppressions.id })
        .from(schema.emailSuppressions)
        .where(eq(schema.emailSuppressions.email, email.toLowerCase()))
        .limit(1);
    return rows.length > 0;
}

export async function upsertSuppression(input: {
    email: string;
    reason: "hard_bounce" | "complaint" | "manual";
    bounceSubtype?: string;
    source?: string;
}): Promise<void> {
    const db = getDB();
    await db
        .insert(schema.emailSuppressions)
        .values({
            email: input.email.toLowerCase(),
            reason: input.reason,
            bounceSubtype: input.bounceSubtype,
            source: input.source ?? "resend_webhook",
        })
        .onConflictDoNothing();
}
