import { config } from "dotenv";

import { eq } from "drizzle-orm";
import { getDB } from "../../utils/db";
import * as schema from "../schema";
import { findOrganizationsForUser } from "../../repositories/organizationRepository";
config({ path: process.env.NUXT_ENV === "prod" ? ".env.prod" : ".env" });

/**
 * Gate PHASE 1b (CRITICAL): signup produced a personal org + owner member.
 * Usage: npx tsx server/database/seed/verify-signup-org.ts <email>
 * Run AFTER a real signup (smoke Task 11). Requires live Postgres.
 */
async function main() {
    const email = process.argv[2];
    if (!email) {
        console.error("Usage: npx tsx server/database/seed/verify-signup-org.ts <email>");
        process.exit(1);
    }

    const db = getDB();
    const users = await db
        .select({ id: schema.user.id, email: schema.user.email })
        .from(schema.user)
        .where(eq(schema.user.email, email))
        .limit(1);
    const user = users[0];
    if (!user) {
        console.error(`[FAIL] no user with email ${email} — signup did not complete successfully`);
        process.exit(1);
    }

    let failed = false;

    const orgs = await findOrganizationsForUser(user.id);
    if (orgs.length === 0) {
        console.error(`[FAIL] user ${email} has NO organizations — signup→org did NOT work (orphaned user!)`);
        failed = true;
    }

    const ownerMemberships = await db
        .select({ organizationId: schema.member.organizationId, role: schema.member.role })
        .from(schema.member)
        .where(eq(schema.member.userId, user.id));
    const ownerRow = ownerMemberships.find((m) => m.role === "owner");
    if (!ownerRow) {
        console.error(`[FAIL] user ${email} is NOT owner of any org — owner member row missing`);
        failed = true;
    }

    if (failed) {
        console.error("[verify-signup-org] SIGNUP→ORG VIOLATED");
        process.exit(1);
    }
    console.log(
        `[verify-signup-org] OK — ${email} has ${orgs.length} org, owner of org=${ownerRow!.organizationId}`,
    );
    process.exit(0);
}

main().catch((e) => {
    console.error("[verify-signup-org] error", e);
    process.exit(1);
});
