/**
 * Middleware org (FASE 1c) — sostituisce lo stub 2.events.ts.
 *
 * Precarica NON-BLOCCANTE l'org attiva in event.context.organization per le rotte
 * /api/organizations/*. È una convenienza: l'ENFORCEMENT (401/403) avviene nei guard
 * RBAC (requireMember/requireWrite/requireOwner) chiamati esplicitamente dalle route,
 * così il pattern funziona anche su /api/projects/* (nessun middleware path-matched).
 */
import { loadActiveOrganization } from "~~/server/utils/permissions";

export default defineEventHandler(async (event) => {
    const path = event.path;
    if (!path?.startsWith("/api/organizations")) {
        return;
    }
    try {
        await loadActiveOrganization(event);
    } catch {
        // Non-bloccante: i guard nelle route gestiscono i requisiti di accesso.
    }
});
