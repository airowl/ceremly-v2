import { eq } from "drizzle-orm";
import * as schema from "../database/schema";
import { getDB } from "./db";

/**
 * Pure predicate: is a ban currently in effect?
 * - banned falsy            → not banned
 * - banExpires null         → permanent ban (also how account-deletion grace is
 *                             modelled: user.service sets banned:true, banExpires:null)
 * - banExpires in the future → active; in the past → expired.
 */
export function isBanActive(
    banned: boolean | null | undefined,
    banExpires: Date | null | undefined,
    now: Date = new Date(),
): boolean {
    if (!banned) return false;
    if (!banExpires) return true;
    return banExpires.getTime() > now.getTime();
}

/**
 * Fresh DB read of a user's ban status. The cached session (Redis
 * secondaryStorage) can outlive a failed revocation — e.g. deleteSessions did
 * not clear the session keys because Upstash had a transient error at ban time
 * — so reading the STALE session.user.banned would let a banned/deleted user
 * keep access until the session TTL. This re-check from the source of truth
 * guarantees immediate revocation regardless of the cache state.
 */
export async function isUserBannedFresh(userId: string): Promise<boolean> {
    const db = getDB();
    const rows = await db
        .select({ banned: schema.user.banned, banExpires: schema.user.banExpires })
        .from(schema.user)
        .where(eq(schema.user.id, userId))
        .limit(1);
    const row = rows[0];
    if (!row) return false;
    return isBanActive(row.banned, row.banExpires);
}
