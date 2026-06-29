/**
 * GDPR Repository — Drizzle queries for definitive deletion (hard-delete)
 * of scheduled accounts (grace window expired). SYSTEM operations
 * (run by cron, no session): direct DB deletes.
 *
 * NB: `session` is not a DB table (Better Auth uses only secondaryStorage
 * Redis), so session cleanup goes through internalAdapter.deleteSessions
 * in the service, not here.
 */
import { and, eq, like } from "drizzle-orm";
import { getDB } from "../utils/db";
import * as schema from "../database/schema";

/** Prefisso del banReason che marca un account programmato per cancellazione. */
export const ACCOUNT_DELETION_REASON_PREFIX = "account_deletion_scheduled:";

/**
 * Users scheduled for deletion (banReason with the dedicated prefix).
 * The purge date is encoded AFTER the prefix (ISO) and filtered in the service.
 */
export async function findUsersScheduledForDeletion() {
    const db = getDB();
    return db
        .select({ id: schema.user.id, banReason: schema.user.banReason })
        .from(schema.user)
        .where(like(schema.user.banReason, `${ACCOUNT_DELETION_REASON_PREFIX}%`));
}

/** Ids of orgs OWNED by the user (member role='owner'). */
export async function findOwnedOrgIds(userId: string): Promise<string[]> {
    const db = getDB();
    const rows = await db
        .select({ organizationId: schema.member.organizationId })
        .from(schema.member)
        .where(and(eq(schema.member.userId, userId), eq(schema.member.role, "owner")));
    return rows.map((r) => r.organizationId);
}

/** R2 paths (file.path) + ids of an org's files, for storage cleanup. */
export async function findFilesByOrg(organizationId: string) {
    const db = getDB();
    return db
        .select({ id: schema.file.id, path: schema.file.path })
        .from(schema.file)
        .where(eq(schema.file.organizationId, organizationId));
}

/** Deletes an org's file rows (after the R2 objects have been removed). */
export async function deleteFilesByOrg(organizationId: string): Promise<void> {
    const db = getDB();
    await db.delete(schema.file).where(eq(schema.file.organizationId, organizationId));
}

/**
 * Transfers ownership of an org to a new member: promotes `toUserId` to
 * 'owner'. Must be called BEFORE removing the outgoing owner's membership.
 */
export async function transferOrgOwnership(organizationId: string, toUserId: string): Promise<void> {
    const db = getDB();
    await db
        .update(schema.member)
        .set({ role: "owner" })
        .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, toUserId)));
}

/** Removes a user's membership from an org (the user "leaves"). */
export async function removeMembership(organizationId: string, userId: string): Promise<void> {
    const db = getDB();
    await db
        .delete(schema.member)
        .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, userId)));
}

/**
 * Deletes the org row: cascades to events/guests/rsvp/activities/reminders/member
 * (FK onDelete cascade). Files (FK set null) must be deleted FIRST via
 * deleteFilesByOrg + R2 storage.
 */
export async function deleteOrganizationRow(organizationId: string): Promise<void> {
    const db = getDB();
    await db.delete(schema.organization).where(eq(schema.organization.id, organizationId));
}

/** Deletes the user's Creem subscriptions (referenceId, no FK → orphaned). */
export async function deleteCreemSubscriptionsByReference(userId: string): Promise<void> {
    const db = getDB();
    await db.delete(schema.creem_subscription).where(eq(schema.creem_subscription.referenceId, userId));
}

/** Deletes the user row: cascades to account/member/twoFactor (FK onDelete cascade). */
export async function deleteUserRow(userId: string): Promise<void> {
    const db = getDB();
    await db.delete(schema.user).where(eq(schema.user.id, userId));
}
