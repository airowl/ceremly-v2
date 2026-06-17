/**
 * GDPR Service — cancellazione definitiva (hard-delete) degli account la cui
 * grace window è scaduta (SPEC: diritto all'oblio). Eseguito dal cron
 * `purge-deleted-accounts`, in contesto di sistema (nessuna sessione).
 *
 * Flusso per ogni utente dovuto:
 *  1. org POSSEDUTE: se l'utente è l'UNICO membro → l'org viene eliminata
 *     (R2 files + cascade DB events/guests/rsvp/...); se ci sono ALTRI membri →
 *     la ownership viene TRASFERITA (mai distruggere i dati di altri tenant) e
 *     la membership dell'utente rimossa.
 *  2. subscription Creem (referenceId, senza FK) eliminate esplicitamente.
 *  3. sessioni (Redis secondaryStorage) revocate via internalAdapter.
 *  4. riga user eliminata → cascade su account/member/twoFactor.
 *
 * Ogni utente è isolato in try/catch: un fallimento non aborta il batch.
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

/** Giorni di grazia prima della cancellazione definitiva. */
export const ACCOUNT_DELETION_GRACE_DAYS = 30;

export interface PurgeResult {
    scanned: number;
    purged: number;
    orgsDeleted: number;
    orgsTransferred: number;
    filesDeleted: number;
    errors: string[];
}

/** Estrae la data di purge codificata nel banReason (ISO dopo il prefisso). */
function parsePurgeDate(banReason: string | null): Date | null {
    if (!banReason || !banReason.startsWith(ACCOUNT_DELETION_REASON_PREFIX)) return null;
    const iso = banReason.slice(ACCOUNT_DELETION_REASON_PREFIX.length);
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
}

/** Sceglie il nuovo owner: admin più anziano, altrimenti membro più anziano. */
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

/** Elimina un'org solo-membro: oggetti R2 + righe file, poi cascade DB. */
async function purgeOrganization(
    organizationId: string,
    storage: ReturnType<typeof createR2Storage>,
    result: PurgeResult,
): Promise<void> {
    const files = await findFilesByOrg(organizationId);
    for (const f of files) {
        try {
            // S3/R2 DeleteObject è idempotente (ok anche se la chiave non esiste).
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
 * Cancella definitivamente gli account dovuti.
 * @param options.restrictToUserIds limita il purge a questi utenti (per i test);
 *        gli altri utenti dovuti vengono ignorati.
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
                    // Org solo-membro → eliminazione completa.
                    await purgeOrganization(orgId, storage, result);
                } else {
                    // Org con altri membri → trasferimento ownership (dati salvi).
                    await transferOrgOwnership(orgId, newOwnerId);
                    await removeMembership(orgId, u.id);
                    result.orgsTransferred++;
                }
            }

            // Subscription Creem (nessuna FK → vanno rimosse a mano).
            await deleteCreemSubscriptionsByReference(u.id);

            // Sessioni in Redis (nessuna tabella DB session) — come per l'admin ban.
            try {
                const ctx = await auth.$context;
                await ctx.internalAdapter.deleteSessions(u.id);
            } catch (e) {
                result.errors.push(`deleteSessions ${u.id}: ${e instanceof Error ? e.message : "errore"}`);
            }

            // Riga user → cascade su account/member (residue)/twoFactor.
            await deleteUserRow(u.id);
            result.purged++;
        } catch (e) {
            result.errors.push(`purge ${u.id}: ${e instanceof Error ? e.message : "errore"}`);
        }
    }

    return result;
}
