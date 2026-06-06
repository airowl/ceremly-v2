/**
 * Organization service (phase 1b).
 * Logica pura riusabile dall'hook signup→org in server/utils/auth.ts.
 * Niente SDK qui: la creazione org reale avviene via auth.api.createOrganization.
 */
import { v7 as uuidv7 } from "uuid";

/**
 * Deriva un nome org leggibile dal nuovo utente.
 * Preferisce il name; fallback alla parte locale dell'email; fallback "Workspace".
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
 * Genera uno slug univoco-per-costruzione.
 * Base slugificata + suffisso uuid breve → collisione con
 * organization.slug (UNIQUE) praticamente impossibile, così
 * createOrganization non lancia mai ORGANIZATION_ALREADY_EXISTS.
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
