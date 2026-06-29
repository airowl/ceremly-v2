/**
 * Organization service (phase 1b).
 * Pure reusable logic from the signup→org hook in server/utils/auth.ts.
 * No SDK here: real org creation happens via auth.api.createOrganization.
 */
import { v7 as uuidv7 } from "uuid";

/**
 * Derives a human-readable org name from the new user.
 * Prefers name; fallback to the local part of the email; fallback "Workspace".
 */
export function deriveOrgNameFromUser(user: { name?: string | null; email: string }): string {
    const fromName = (user.name ?? "").trim();
    if (fromName.length > 0) {
        return `${fromName}'s Workspace`;
    }
    const localPart = user.email.split("@")[0]?.trim();
    if (localPart && localPart.length > 0) {
        return `${localPart}'s Workspace`;
    }
    return "Workspace";
}

/**
 * Generates a by-construction unique slug.
 * Slugified base + short uuid suffix → collision with
 * organization.slug (UNIQUE) is practically impossible, so
 * createOrganization never throws ORGANIZATION_ALREADY_EXISTS.
 */
export function generateUniqueOrgSlug(name: string): string {
    const base = name
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32);
    const suffix = uuidv7().split("-")[0]; // 8 hex chars
    const safeBase = base.length > 0 ? base : "org";
    return `${safeBase}-${suffix}`;
}
