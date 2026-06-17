import { config } from "dotenv";

import { eq, inArray, like } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { getDB } from "../../utils/db";
import * as schema from "../schema";
import { purgeDueDeletedAccounts } from "../../services/gdpr.service";
import { ACCOUNT_DELETION_REASON_PREFIX, findUsersScheduledForDeletion } from "../../repositories/gdprRepository";
config({ path: process.env.NUXT_ENV === "prod" ? ".env.production" : ".env" });

/**
 * Gate FIX #20/#19: il hard-delete GDPR cancella davvero l'utente + la sua org
 * solo-membro (DB cascade + righe file/R2) quando la grace window è scaduta,
 * SENZA toccare gli altri tenant.
 *
 * Self-contained e SICURO: crea una fixture usa-e-getta (user + org solo +
 * file), la marca come dovuta (banReason con data PASSATA), esegue il purge
 * RISTRETTO al solo fixture user, e verifica:
 *  - fixture user/org/file eliminati;
 *  - TRIPWIRE: tutte le org reali preesistenti sopravvivono.
 * Pulisce sempre la propria fixture (finally). Richiede un Postgres vivo.
 */
async function main() {
    const db = getDB();
    const suffix = uuidv7();
    const userId = `verify-purge-user-${suffix}`;
    const orgId = `verify-purge-org-${suffix}`;
    const memberId = `verify-purge-member-${suffix}`;
    const fileId = uuidv7();

    // TRIPWIRE: snapshot delle org REALI prima di qualsiasi operazione.
    const realOrgsBefore = (await db.select({ id: schema.organization.id }).from(schema.organization))
        .map((o) => o.id);

    let failed = false;

    try {
        // --- Fixture: org + owner (solo membro) + file org-scoped ---
        const now = new Date();
        const pastPurge = new Date(now.getTime() - 60 * 1000); // scaduta da 1 min
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

        // 1. La fixture risulta programmata per cancellazione.
        const scheduled = await findUsersScheduledForDeletion();
        if (!scheduled.some((u) => u.id === userId)) {
            console.error("[FAIL] findUsersScheduledForDeletion non include la fixture");
            failed = true;
        }

        // 2. Purge RISTRETTO al solo fixture user (mai gli altri).
        const result = await purgeDueDeletedAccounts({ restrictToUserIds: [userId] });
        if (result.purged !== 1) { console.error(`[FAIL] purged atteso 1, è ${result.purged}`); failed = true; }
        if (result.orgsDeleted !== 1) { console.error(`[FAIL] orgsDeleted atteso 1, è ${result.orgsDeleted}`); failed = true; }

        // 3. Fixture eliminata (user, org, member, file).
        const userGone = (await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, userId))).length === 0;
        const orgGone = (await db.select({ id: schema.organization.id }).from(schema.organization).where(eq(schema.organization.id, orgId))).length === 0;
        const fileGone = (await db.select({ id: schema.file.id }).from(schema.file).where(eq(schema.file.id, fileId))).length === 0;
        if (!userGone) { console.error("[FAIL] user fixture non eliminato"); failed = true; }
        if (!orgGone) { console.error("[FAIL] org fixture non eliminata"); failed = true; }
        if (!fileGone) { console.error("[FAIL] file fixture non eliminato"); failed = true; }

        // 4. TRIPWIRE: le org reali preesistenti devono esistere ancora.
        if (realOrgsBefore.length > 0) {
            const stillThere = (await db.select({ id: schema.organization.id }).from(schema.organization)
                .where(inArray(schema.organization.id, realOrgsBefore))).map((o) => o.id);
            const missing = realOrgsBefore.filter((id) => !stillThere.includes(id));
            if (missing.length > 0) {
                console.error(`[FAIL] TRIPWIRE: org reali eliminate per errore: ${missing.join(", ")}`);
                failed = true;
            }
        }
    } finally {
        // Cleanup difensivo della fixture (se un fallimento l'ha lasciata).
        await db.delete(schema.file).where(eq(schema.file.id, fileId)).catch(() => {});
        await db.delete(schema.member).where(eq(schema.member.id, memberId)).catch(() => {});
        await db.delete(schema.organization).where(eq(schema.organization.id, orgId)).catch(() => {});
        await db.delete(schema.user).where(eq(schema.user.id, userId)).catch(() => {});
        // Sanity: nessun residuo di fixture verify-purge orfano in giro.
        await db.delete(schema.user).where(like(schema.user.email, "verify-purge-%@example.invalid")).catch(() => {});
    }

    if (failed) {
        console.error("[verify-account-purge] HARD-DELETE NON CORRETTO");
        process.exit(1);
    }
    console.log(`[verify-account-purge] OK — fixture user+org+file eliminati, ${realOrgsBefore.length} org reali intatte (tripwire).`);
    process.exit(0);
}

main().catch((e) => {
    console.error("[verify-account-purge] errore", e);
    process.exit(1);
});
