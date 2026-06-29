/**
 * GDPR Service — permanent hard-delete of accounts whose grace window has
 * expired (SPEC: right to erasure). Run by the `purge-deleted-accounts` cron
 * in system context (no session).
 *
 * Flow for each due user:
 *  1. OWNED orgs: if the user is the ONLY member → the org is deleted
 *     (R2 files + DB cascade events/guests/rsvp/...); if there are OTHER members →
 *     ownership is TRANSFERRED (never destroy other tenants' data) and
 *     the user's membership is removed.
 *  2. Creem subscriptions (referenceId, no FK) deleted explicitly.
 *  3. Sessions (Redis secondaryStorage) revoked via internalAdapter.
 *  4. User row deleted → cascade on account/member/twoFactor.
 *
 * Each user is isolated in try/catch: a failure does not abort the batch.
 */
import { createR2Storage } from "./file/storage/r2";
import { runtimeConfig } from "../utils/runtimeConfig";
import { useServerAuth } from "../utils/auth";
import { findMembers } from "../repositories/memberRepository";
import {
    ACCOUNT_DELETION_REASON_PREFIX,
    deleteCreemSubscriptionsByReference,
    deleteFilesByOrg,
    deleteOrganizationRow,
    deleteUserRow,
    findFilesByOrg,
    findOwnedOrgIds,
    findUsersScheduledForDeletion,
    removeMembership,
    transferOrgOwnership,
} from "../repositories/gdprRepository";

/** Grace days before permanent deletion. */
export const ACCOUNT_DELETION_GRACE_DAYS = 30;

export interface PurgeResult {
    scanned: number;
    purged: number;
    orgsDeleted: number;
    orgsTransferred: number;
    filesDeleted: number;
    errors: string[];
}

/** Extracts the purge date encoded in banReason (ISO string after the prefix). */
function parsePurgeDate(banReason: string | null): Date | null {
    if (!banReason || !banReason.startsWith(ACCOUNT_DELETION_REASON_PREFIX)) return null;
    const iso = banReason.slice(ACCOUNT_DELETION_REASON_PREFIX.length);
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
}

/** Picks the new owner: most tenured admin, otherwise most tenured member. */
function pickNewOwner(
    members: Awaited<ReturnType<typeof findMembers>>,
    leavingUserId: string,
): string | null {
    const others = members.filter((m) => m.userId !== leavingUserId);
    if (others.length === 0) return null;
    const byTenure = (a: typeof others[number], b: typeof others[number]) =>
        a.createdAt.getTime() - b.createdAt.getTime();
    const admins = others.filter((m) => m.role === "admin").sort(byTenure);
    if (admins.length > 0) return admins[0]!.userId;
    return [...others].sort(byTenure)[0]!.userId;
}

/** Deletes a single-member org: R2 objects + file rows, then DB cascade. */
async function purgeOrganization(
    organizationId: string,
    storage: ReturnType<typeof createR2Storage>,
    result: PurgeResult,
): Promise<void> {
    const files = await findFilesByOrg(organizationId);
    for (const f of files) {
        try {
            // S3/R2 DeleteObject is idempotent (ok even if the key does not exist).
            await storage.delete(f.path);
            result.filesDeleted++;
        } catch (e) {
            result.errors.push(`R2 delete ${f.id}: ${e instanceof Error ? e.message : "errore"}`);
        }
    }
    await deleteFilesByOrg(organizationId);
    await deleteOrganizationRow(organizationId);
    result.orgsDeleted++;
}

/**
 * Permanently deletes due accounts.
 * @param options.restrictToUserIds restricts the purge to these users (for tests);
 *        other due users are ignored.
 */
export async function purgeDueDeletedAccounts(
    options?: { restrictToUserIds?: string[] },
): Promise<PurgeResult> {
    const result: PurgeResult = {
        scanned: 0,
        purged: 0,
        orgsDeleted: 0,
        orgsTransferred: 0,
        filesDeleted: 0,
        errors: [],
    };

    const now = Date.now();
    const restrict = options?.restrictToUserIds ? new Set(options.restrictToUserIds) : null;

    const scheduled = await findUsersScheduledForDeletion();
    const due = scheduled.filter((u) => {
        if (restrict && !restrict.has(u.id)) return false;
        const purgeAt = parsePurgeDate(u.banReason);
        return purgeAt !== null && purgeAt.getTime() <= now;
    });
    result.scanned = due.length;

    if (due.length === 0) return result;

    const storage = createR2Storage(runtimeConfig.fileManager.storage);
    const auth = useServerAuth();

    for (const u of due) {
        try {
            const ownedOrgIds = await findOwnedOrgIds(u.id);
            for (const orgId of ownedOrgIds) {
                const members = await findMembers(orgId);
                const newOwnerId = pickNewOwner(members, u.id);
                if (newOwnerId === null) {
                    // Single-member org → full deletion.
                    await purgeOrganization(orgId, storage, result);
                } else {
                    // Org with other members → ownership transfer (data preserved).
                    await transferOrgOwnership(orgId, newOwnerId);
                    await removeMembership(orgId, u.id);
                    result.orgsTransferred++;
                }
            }

            // Creem subscriptions (no FK → must be removed manually).
            await deleteCreemSubscriptionsByReference(u.id);

            // Sessions in Redis (no DB session table) — same mechanism as admin ban.
            try {
                const ctx = await auth.$context;
                await ctx.internalAdapter.deleteSessions(u.id);
            } catch (e) {
                result.errors.push(`deleteSessions ${u.id}: ${e instanceof Error ? e.message : "errore"}`);
            }

            // User row → cascade on account/member (residual)/twoFactor.
            await deleteUserRow(u.id);
            result.purged++;
        } catch (e) {
            result.errors.push(`purge ${u.id}: ${e instanceof Error ? e.message : "errore"}`);
        }
    }

    return result;
}
