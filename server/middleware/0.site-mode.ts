/**
 * Server middleware per bloccare accessi in modalità waitinglist/maintenance.
 *
 * Approccio blocklist mirato: blocca solo route specifiche (API + pagine app),
 * lascia passare tutto il resto (assets, interni Nuxt, HMR, payload, ecc.).
 *
 * WAITINGLIST:
 *   - API bloccate: tutte tranne /api/waiting-list/**
 *   - Pagine bloccate: /login, /signup, /dashboard/**, /auth/**, /invite/**, /logout, /contactUs
 *
 * MAINTENANCE:
 *   - API: tutte bloccate
 *   - Pagine: tutte redirect a /maintenance
 */
let logged = false;

export default defineEventHandler((event) => {
    const config = useRuntimeConfig();
    const siteMode = config.public.siteMode;
    const path = event.path;

    // Log una sola volta all'avvio per verificare il valore
    if (!logged) {
        console.log(`[site-mode] siteMode = "${siteMode}" (type: ${typeof siteMode})`);
        logged = true;
    }

    // Nessuna restrizione in modalità active
    if (!siteMode || siteMode === "active") return;

    // === MODALITÀ WAITING LIST ===
    if (siteMode === "waitinglist") {
        // --- Blocco API ---
        if (path?.startsWith("/api/")) {
            // API consentite in waitinglist
            if (path.startsWith("/api/waiting-list/")) return;
            // Background jobs (QStash) e cron (Vercel) passano a prescindere dal site mode
            if (path.startsWith("/api/jobs") || path.startsWith("/api/cron")) return;

            throw createError({
                statusCode: 503,
                statusMessage: "Service Unavailable",
            });
        }

        // --- Blocco pagine app ---
        const blockedPagePrefixes = [
            "/dashboard",
            "/login",
            "/signup",
            "/logout",
            "/auth",
            "/invite",
            "/contactUs",
        ];

        const isBlocked = blockedPagePrefixes.some(
            (prefix) => path === prefix || path?.startsWith(`${prefix}/`)
        );

        if (isBlocked) {
            return sendRedirect(event, "/", 302);
        }

        // Tutto il resto passa: landing, legal, assets, interni Nuxt, ecc.
        return;
    }

    // === MODALITÀ MAINTENANCE ===
    if (siteMode === "maintenance") {
        if (path?.startsWith("/api/")) {
            // Background jobs (QStash) e cron (Vercel) passano anche in maintenance
            if (path.startsWith("/api/jobs") || path.startsWith("/api/cron")) return;
            throw createError({
                statusCode: 503,
                statusMessage: "Service Unavailable",
            });
        }

        if (path === "/maintenance") return;

        // Non bloccare risorse interne di Nuxt
        if (path?.startsWith("/_")) return;

        return sendRedirect(event, "/maintenance", 302);
    }
});
