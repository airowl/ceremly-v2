/**
 * Global client middleware for the three site modes (priority 0, before auth.global).
 *
 * UX only (client-side redirect): the real defence is the server middleware. Rules
 * are shared with the server via shared/constants/siteMode, so client and server
 * don't diverge and no locale is hardcoded.
 *
 * - maintenance: everything → /maintenance (absolute priority)
 * - waitinglist: allowlist (landing/legal/blog in every locale), rest → "/"
 * - active: no restrictions
 */
import {
    isMaintenancePage,
    isWaitingListAllowedPage,
} from "~~/shared/constants/siteMode";

export default defineNuxtRouteMiddleware((to) => {
    // Client-only: avoids SSR errors (the server already has its own enforcement).
    if (import.meta.server) return;

    const { isMaintenanceMode, isWaitingListMode } = useSiteMode();

    // === MAINTENANCE — absolute priority ===
    if (isMaintenanceMode.value) {
        if (!isMaintenancePage(to.path)) {
            return navigateTo("/maintenance");
        }
        return;
    }

    // Outside maintenance, /maintenance must not be reachable.
    if (isMaintenancePage(to.path)) {
        return navigateTo("/");
    }

    // === WAITING LIST — allowlist ===
    if (isWaitingListMode.value && !isWaitingListAllowedPage(to.path)) {
        return navigateTo("/");
    }

    // === ACTIVE — no restrictions (auth.global handles those) ===
});
