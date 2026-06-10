/**
 * Middleware globale client per i tre site mode (priorità 0, prima di auth.global).
 *
 * È solo UX (redirect lato client): la difesa reale è il middleware server. Le
 * regole sono condivise con il server via shared/constants/siteMode, così client
 * e server non divergono e nessuna locale è hardcodata.
 *
 * - maintenance: tutto → /maintenance (priorità assoluta)
 * - waitinglist: allowlist (landing/legal/blog in ogni locale), il resto → "/"
 * - active: nessuna restrizione
 */
import {
    isMaintenancePage,
    isWaitingListAllowedPage,
} from "~~/shared/constants/siteMode";

export default defineNuxtRouteMiddleware((to) => {
    // Solo client: evita errori SSR (e il server ha già il suo enforcement).
    if (import.meta.server) return;

    const { isMaintenanceMode, isWaitingListMode } = useSiteMode();

    // === MANUTENZIONE — priorità assoluta ===
    if (isMaintenanceMode.value) {
        if (!isMaintenancePage(to.path)) {
            return navigateTo("/maintenance");
        }
        return;
    }

    // Fuori da maintenance, /maintenance non deve essere raggiungibile.
    if (isMaintenancePage(to.path)) {
        return navigateTo("/");
    }

    // === WAITING LIST — allowlist ===
    if (isWaitingListMode.value && !isWaitingListAllowedPage(to.path)) {
        return navigateTo("/");
    }

    // === ACTIVE — nessuna restrizione (gestisce auth.global) ===
});
