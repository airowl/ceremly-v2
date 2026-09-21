/**
 * Composable per gestire i quattro stati del sito:
 * - waitinglist: Landing page con waiting list attiva, nessun accesso a dashboard/auth
 * - active: SaaS completamente attivo, newsletter invece di waiting list
 * - maintenance: Solo pagina di manutenzione accessibile
 * - maintenance-readonly: sito navigabile, scritture bloccate
 */

import { resolveSiteMode, type SiteMode } from "~~/shared/constants/siteMode";

export type { SiteMode };

export const useSiteMode = () => {
    const config = useRuntimeConfig();

    /**
     * Modalità corrente lato client, dal valore inlined in runtimeConfig.public.
     * Best-effort: il client NON vede un eventuale override runtime (Redis) finché
     * non ricarica; la difesa autorevole è il middleware server. La validazione/
     * default è centralizzata in resolveSiteMode (shared).
     */
    const siteMode = computed<SiteMode>(() =>
        resolveSiteMode(config.public.siteMode)
    );

    /**
     * Verifica se il sito è in modalità waiting list
     */
    const isWaitingListMode = computed(() => siteMode.value === "waitinglist");

    /**
     * Verifica se il sito è in modalità attiva (SaaS disponibile)
     */
    const isActiveMode = computed(() => siteMode.value === "active");

    /**
     * Verifica se il sito è in manutenzione
     */
    const isMaintenanceMode = computed(() => siteMode.value === "maintenance");

    /**
     * Manutenzione in sola lettura: il sito è visibile e navigabile, le scritture
     * no. La UI non deve nascondere la dashboard — nasconderla sarebbe l'unica
     * differenza visibile rispetto a `maintenance`, cioè un secondo interruttore
     * che fa la stessa cosa. Dove una scrittura fallisce lo dice l'API (503).
     */
    const isReadOnlyMode = computed(() => siteMode.value === "maintenance-readonly");

    /**
     * Verifica se l'autenticazione è abilitata
     * (disabilitata in waitinglist e maintenance)
     */
    const isAuthEnabled = computed(() => isActiveMode.value || isReadOnlyMode.value);

    /**
     * Verifica se la dashboard è accessibile
     * (active, e in sola lettura durante maintenance-readonly)
     */
    const isDashboardEnabled = computed(() => isActiveMode.value || isReadOnlyMode.value);

    /**
     * Verifica se mostrare la waiting list CTA
     */
    const shouldShowWaitingListCTA = computed(() => isWaitingListMode.value);

    /**
     * Verifica se mostrare la newsletter CTA
     */
    const shouldShowNewsletterCTA = computed(() => isActiveMode.value);

    /**
     * Verifica se mostrare i link di autenticazione nella navbar/footer
     */
    const shouldShowAuthLinks = computed(() => isActiveMode.value || isReadOnlyMode.value);

    return {
        // Stato
        siteMode,

        // Checks booleani
        isWaitingListMode,
        isActiveMode,
        isMaintenanceMode,
        isReadOnlyMode,
        isAuthEnabled,
        isDashboardEnabled,

        // UI helpers
        shouldShowWaitingListCTA,
        shouldShowNewsletterCTA,
        shouldShowAuthLinks,
    };
};
