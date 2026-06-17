/**
 * GDPR Repository — query Drizzle per la cancellazione definitiva (hard-delete)
 * degli account programmati (grace window scaduta). Operazioni di SISTEMA
 * (eseguite dal cron, nessuna sessione): delete diretti in DB.
 *
 * NB: la `session` non è una tabella DB (Better Auth usa solo secondaryStorage
 * Redis), quindi la pulizia sessioni passa per internalAdapter.deleteSessions
 * nel service, non qui.
 */
import { and, eq, like } from "drizzle-orm";
import { getDB } from "../utils/db";
import * as schema from "../database/schema";

/** Prefisso del banReason che marca un account programmato per cancellazione. */
export const ACCOUNT_DELETION_REASON_PREFIX = "account_deletion_scheduled:";

/**
 * Utenti programmati per la cancellazione (banReason col prefisso dedicato).
 * La data di purge è codificata DOPO il prefisso (ISO) e filtrata nel service.
 */
export async function findUsersScheduledForDeletion() {
    const db = getDB();
    return db
        .select({ id: schema.user.id, banReason: schema.user.banReason })
        .from(schema.user)
        .where(like(schema.user.banReason, `${ACCOUNT_DELETION_REASON_PREFIX}%`));
}

/** Id delle org POSSEDUTE dall'utente (member role='owner'). */
export async function findOwnedOrgIds(userId: string): Promise<string[]> {
    const db = getDB();
    const rows = await db
        .select({ organizationId: schema.member.organizationId })
        .from(schema.member)
        .where(and(eq(schema.member.userId, userId), eq(schema.member.role, "owner")));
    return rows.map((r) => r.organizationId);
}

/** Path R2 (file.path) + id dei file di un'org, per la pulizia storage. */
export async function findFilesByOrg(organizationId: string) {
    const db = getDB();
    return db
        .select({ id: schema.file.id, path: schema.file.path })
        .from(schema.file)
        .where(eq(schema.file.organizationId, organizationId));
}

/** Elimina le righe file di un'org (dopo aver cancellato gli oggetti R2). */
export async function deleteFilesByOrg(organizationId: string): Promise<void> {
    const db = getDB();
    await db.delete(schema.file).where(eq(schema.file.organizationId, organizationId));
}

/**
 * Trasferisce la ownership di un'org a un nuovo membro: promuove `toUserId` a
 * 'owner'. Da chiamare PRIMA di rimuovere la membership dell'owner uscente.
 */
export async function transferOrgOwnership(organizationId: string, toUserId: string): Promise<void> {
    const db = getDB();
    await db
        .update(schema.member)
        .set({ role: "owner" })
        .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, toUserId)));
}

/** Rimuove la membership di un utente da un'org (l'utente "esce"). */
export async function removeMembership(organizationId: string, userId: string): Promise<void> {
    const db = getDB();
    await db
        .delete(schema.member)
        .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, userId)));
}

/**
 * Elimina la riga org: cascade su events/guests/rsvp/activities/reminders/member
 * (FK onDelete cascade). I file (FK set null) vanno cancellati PRIMA via
 * deleteFilesByOrg + storage R2.
 */
export async function deleteOrganizationRow(organizationId: string): Promise<void> {
    const db = getDB();
    await db.delete(schema.organization).where(eq(schema.organization.id, organizationId));
}

/** Elimina le subscription Creem dell'utente (referenceId, nessuna FK → orfane). */
export async function deleteCreemSubscriptionsByReference(userId: string): Promise<void> {
    const db = getDB();
    await db.delete(schema.creem_subscription).where(eq(schema.creem_subscription.referenceId, userId));
}

/** Elimina la riga user: cascade su account/member/twoFactor (FK onDelete cascade). */
export async function deleteUserRow(userId: string): Promise<void> {
    const db = getDB();
    await db.delete(schema.user).where(eq(schema.user.id, userId));
}
