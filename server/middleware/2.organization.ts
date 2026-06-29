/**
 * Org middleware (PHASE 1c) — replaces the 2.events.ts stub.
 *
 * Non-blocking preload of the active org into event.context.organization for
 * /api/organizations/* routes. This is a convenience: ENFORCEMENT (401/403) happens
 * in the RBAC guards (requireMember/requireWrite/requireOwner) called explicitly by
 * routes, so the pattern also works on /api/projects/* (no path-matched middleware).
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
        // Non-blocking: guards in the routes handle access requirements.
    }
});
