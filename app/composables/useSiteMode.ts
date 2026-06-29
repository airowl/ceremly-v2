/**
 * Composable for managing the three site states:
 * - waitinglist: Landing page with active waiting list, no access to dashboard/auth
 * - active: Fully active SaaS, newsletter instead of waiting list
 * - maintenance: Only the maintenance page is accessible
 */

import { resolveSiteMode, type SiteMode } from "~~/shared/constants/siteMode";

export type { SiteMode };

export const useSiteMode = () => {
    const config = useRuntimeConfig();

    /**
     * Current mode on the client side, from the inlined value in runtimeConfig.public.
     * Best-effort: the client does NOT see a runtime override (Redis) until it
     * reloads; the authoritative defence is the server middleware. Validation/
     * defaults are centralised in resolveSiteMode (shared).
     */
    const siteMode = computed<SiteMode>(() =>
        resolveSiteMode(config.public.siteMode)
    );

    /**
     * Checks whether the site is in waiting list mode
     */
    const isWaitingListMode = computed(() => siteMode.value === "waitinglist");

    /**
     * Checks whether the site is in active mode (SaaS available)
     */
    const isActiveMode = computed(() => siteMode.value === "active");

    /**
     * Checks whether the site is in maintenance mode
     */
    const isMaintenanceMode = computed(() => siteMode.value === "maintenance");

    /**
     * Checks whether authentication is enabled
     * (disabled in waitinglist and maintenance)
     */
    const isAuthEnabled = computed(() => isActiveMode.value);

    /**
     * Checks whether the dashboard is accessible
     * (active mode only)
     */
    const isDashboardEnabled = computed(() => isActiveMode.value);

    /**
     * Checks whether to show the waiting list CTA
     */
    const shouldShowWaitingListCTA = computed(() => isWaitingListMode.value);

    /**
     * Checks whether to show the newsletter CTA
     */
    const shouldShowNewsletterCTA = computed(() => isActiveMode.value);

    /**
     * Checks whether to show authentication links in the navbar/footer
     */
    const shouldShowAuthLinks = computed(() => isActiveMode.value);

    return {
        // State
        siteMode,

        // Boolean checks
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
