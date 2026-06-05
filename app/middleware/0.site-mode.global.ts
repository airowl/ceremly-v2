/**
 * Middleware globale per gestire i tre stati del sito.
 * Ha priorità '0' per essere eseguito prima di auth.global.ts
 *
 * Comportamento per stato:
 * - waitinglist: Solo landing page e pagine legali accessibili (approccio allowlist)
 * - maintenance: Forza redirect a /maintenance per tutte le pagine tranne /maintenance
 * - active: Nessuna restrizione (comportamento normale)
 */

export default defineNuxtRouteMiddleware((to) => {
    // Esegui solo lato client per evitare errori SSR
    if (process.server) return

    const { siteMode, isMaintenanceMode, isWaitingListMode } = useSiteMode()

    // ============================================
    // MODALITÀ MANUTENZIONE - Priorità assoluta
    // ============================================
    if (isMaintenanceMode.value) {
        // Permetti solo accesso alla pagina di manutenzione
        if (to.path !== '/maintenance') {
            return navigateTo('/maintenance')
        }
        return
    }

    // Se NON siamo in maintenance ma stiamo cercando di accedere a /maintenance,
    // redirect alla home
    if (to.path === '/maintenance') {
        return navigateTo('/')
    }

    // ============================================
    // MODALITÀ WAITING LIST - Approccio allowlist
    // Solo landing page e pagine legali accessibili
    // ============================================
    if (isWaitingListMode.value) {
        // Route esatte consentite
        const allowedPaths = [
            '/',
            '/en',
        ]

        // Prefissi consentiti (pagine legali e blog in tutte le lingue)
        const allowedPrefixes = [
            '/legal/',
            '/en/legal/',
            '/blogs',
            '/en/blogs',
        ]

        const isAllowed =
            allowedPaths.includes(to.path) ||
            allowedPrefixes.some(prefix => to.path.startsWith(prefix))

        if (!isAllowed) {
            return navigateTo('/')
        }
    }

    // ============================================
    // MODALITÀ ACTIVE - Nessuna restrizione
    // ============================================
    // Lascia che il middleware auth.global.ts gestisca l'autenticazione
})
