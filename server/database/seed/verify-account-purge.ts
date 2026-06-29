import { config } from "dotenv";

import { eq, inArray, like } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { getDB } from "../../utils/db";
import * as schema from "../schema";
import { purgeDueDeletedAccounts } from "../../services/gdpr.service";
import { ACCOUNT_DELETION_REASON_PREFIX, findUsersScheduledForDeletion } from "../../repositories/gdprRepository";
config({ path: process.env.NUXT_ENV === "prod" ? ".env.prod" : ".env" });

/**
 * Gate FIX #20/#19: GDPR hard-delete actually deletes the user + their sole-member
 * org (DB cascade + file/R2 rows) when the grace window has expired,
 * WITHOUT touching other tenants.
 *
 * Self-contained and SAFE: creates a disposable fixture (user + solo org +
 * file), marks it as due (banReason with a PAST date), runs the purge
 * RESTRICTED to the fixture user only, and verifies:
 *  - fixture user/org/file deleted;
 *  - TRIPWIRE: all pre-existing real orgs survive.
 * Always cleans up its own fixture (finally). Requires a live Postgres.
 */
async function main() {
    const db = getDB();
    const suffix = uuidv7();
    const userId = `verify-purge-user-${suffix}`;
    const orgId = `verify-purge-org-${suffix}`;
    const memberId = `verify-purge-member-${suffix}`;
    const fileId = uuidv7();

    // TRIPWIRE: snapshot of REAL orgs before any operation.
    const realOrgsBefore = (await db.select({ id: schema.organization.id }).from(schema.organization))
        .map((o) => o.id);

    let failed = false;

    try {
        // --- Fixture: org + owner (sole member) + org-scoped file ---
        const now = new Date();
        const pastPurge = new Date(now.getTime() - 60 * 1000); // expired 1 min ago
        await db.insert(schema.organization).values({ id: orgId, name: "Verify Purge Org", slug: `verify-purge-${suffix}`, createdAt: now });
        await db.insert(schema.user).values({
            id: userId,
            name: "Verify Purge",
            email: `verify-purge-${suffix}@example.invalid`,
            emailVerified: true,
            createdAt: now,
            updatedAt: now,
            banned: true,
            banReason: `${ACCOUNT_DELETION_REASON_PREFIX}${pastPurge.toISOString()}`,
        });
        await db.insert(schema.member).values({ id: memberId, organizationId: orgId, userId, role: "owner", createdAt: now });
        await db.insert(schema.file).values({
            id: fileId,
            originalName: "x.png", fileName: "x.png", mimeType: "image/png", fileType: "image",
            size: 1, path: `verify-purge/${suffix}.png`, organizationId: orgId,
            createdAt: now, updatedAt: now,
        });

        // 1. The fixture shows up as scheduled for deletion.
        const scheduled = await findUsersScheduledForDeletion();
        if (!scheduled.some((u) => u.id === userId)) {
            console.error("[FAIL] findUsersScheduledForDeletion does not include the fixture");
            failed = true;
        }

        // 2. Purge RESTRICTED to the fixture user only (never others).
        const result = await purgeDueDeletedAccounts({ restrictToUserIds: [userId] });
        if (result.purged !== 1) { console.error(`[FAIL] purged expected 1, got ${result.purged}`); failed = true; }
        if (result.orgsDeleted !== 1) { console.error(`[FAIL] orgsDeleted expected 1, got ${result.orgsDeleted}`); failed = true; }

        // 3. Fixture deleted (user, org, member, file).
        const userGone = (await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, userId))).length === 0;
        const orgGone = (await db.select({ id: schema.organization.id }).from(schema.organization).where(eq(schema.organization.id, orgId))).length === 0;
        const fileGone = (await db.select({ id: schema.file.id }).from(schema.file).where(eq(schema.file.id, fileId))).length === 0;
        if (!userGone) { console.error("[FAIL] fixture user not deleted"); failed = true; }
        if (!orgGone) { console.error("[FAIL] fixture org not deleted"); failed = true; }
        if (!fileGone) { console.error("[FAIL] fixture file not deleted"); failed = true; }

        // 4. TRIPWIRE: pre-existing real orgs must still exist.
        if (realOrgsBefore.length > 0) {
            const stillThere = (await db.select({ id: schema.organization.id }).from(schema.organization)
                .where(inArray(schema.organization.id, realOrgsBefore))).map((o) => o.id);
            const missing = realOrgsBefore.filter((id) => !stillThere.includes(id));
            if (missing.length > 0) {
                console.error(`[FAIL] TRIPWIRE: real orgs deleted by mistake: ${missing.join(", ")}`);
                failed = true;
            }
        }
    } finally {
        // Defensive cleanup of the fixture (in case a failure left it behind).
        await db.delete(schema.file).where(eq(schema.file.id, fileId)).catch(() => {});
        await db.delete(schema.member).where(eq(schema.member.id, memberId)).catch(() => {});
        await db.delete(schema.organization).where(eq(schema.organization.id, orgId)).catch(() => {});
        await db.delete(schema.user).where(eq(schema.user.id, userId)).catch(() => {});
        // Sanity: no leftover orphaned verify-purge fixture rows.
        await db.delete(schema.user).where(like(schema.user.email, "verify-purge-%@example.invalid")).catch(() => {});
    }

    if (failed) {
        console.error("[verify-account-purge] HARD-DELETE INCORRECT");
        process.exit(1);
    }
    console.log(`[verify-account-purge] OK — fixture user+org+file deleted, ${realOrgsBefore.length} real orgs intact (tripwire).`);
    process.exit(0);
}

main().catch((e) => {
    console.error("[verify-account-purge] error", e);
    process.exit(1);
});
