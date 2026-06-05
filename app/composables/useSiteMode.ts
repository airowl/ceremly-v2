/**
 * Composable per gestire i tre stati del sito:
 * - waitinglist: Landing page con waiting list attiva, nessun accesso a dashboard/auth
 * - active: SaaS completamente attivo, newsletter invece di waiting list
 * - maintenance: Solo pagina di manutenzione accessibile
 */

export type SiteMode = "waitinglist" | "active" | "maintenance";

export const useSiteMode = () => {
    const config = useRuntimeConfig();

    /**
     * Ottiene la modalità corrente del sito dalla variabile d'ambiente
     * Default: 'active' se non specificata
     */
    const siteMode = computed<SiteMode>(() => {
        const mode = config.public.siteMode as string;

        // Validazione del valore
        if (
            mode === "waitinglist" ||
            mode === "active" ||
            mode === "maintenance"
        ) {
            return mode;
        }

        // Default a 'active' se non specificato o valore non valido
        return "active";
    });

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
     * Verifica se l'autenticazione è abilitata
     * (disabilitata in waitinglist e maintenance)
     */
    const isAuthEnabled = computed(() => isActiveMode.value);

    /**
     * Verifica se la dashboard è accessibile
     * (solo in modalità active)
     */
    const isDashboardEnabled = computed(() => isActiveMode.value);

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
    const shouldShowAuthLinks = computed(() => isActiveMode.value);

    return {
        // Stato
        siteMode,

        // Checks booleani
        isWaitingListMode,
        isActiveMode,
        isMaintenanceMode,
        isAuthEnabled,
        isDashboardEnabled,

        // UI helpers
        shouldShowWaitingListCTA,
        shouldShowNewsletterCTA,
        shouldShowAuthLinks,
    };
};
