/**
 * Server middleware: enforcement of waitinglist/maintenance site modes.
 *
 * This is the REAL defense (the client middleware is UX only). The authoritative mode
 * is read via getServerSiteMode() — same authority as the catch-all auth, so a
 * runtime toggle updates both consistently.
 *
 * Targeted blocklist approach: the server sees EVERY request (assets, _nuxt, payload,
 * API, jobs, cron), so it blocks only what needs blocking and lets the rest through.
 * Locale-agnostic rules live in shared/constants/siteMode.
 *
 * WAITINGLIST:
 *   - API: all 503 except /api/waiting-list/** (+ jobs/cron/public always free)
 *   - Pages: /dashboard, /login, /signup, /logout, /auth, /invite, /contact
 *     (in every locale) → redirect "/"
 * MAINTENANCE:
 *   - API: all 503 (except jobs/cron/public)
 *   - Pages: all → /maintenance (which responds 503 from its own setup)
 */
import {
    isMaintenancePage,
    isWaitingListBlockedPage,
} from "~~/shared/constants/siteMode";
import { getServerSiteMode } from "../utils/siteMode";

export default defineEventHandler(async (event) => {
    // During prerender (build) there is no enforcement or Redis: static pages
    // must always be captured in the "active" state.
    if (import.meta.prerender) return;

    const path = event.path || "/";

    // Background jobs (QStash) and cron (Vercel): always free regardless of mode.
    if (path.startsWith("/api/jobs") || path.startsWith("/api/cron")) return;

    // Public guest APIs (invite/RSVP/email pixel): always free regardless of
    // mode. Invite tokens have already been delivered to guests: blocking them
    // in waitinglist/maintenance would break RSVPs already in circulation and the
    // open pixel in sent emails.
    if (path.startsWith("/api/public/")) return;

    // Admin endpoints (protected by admin API key): remain operable even in
    // waitinglist/maintenance. Critical: the toggle itself (/api/admin/site-mode)
    // must be able to turn the site back on, otherwise maintenance is irreversible via API.
    if (path.startsWith("/api/admin/")) return;

    // Creem webhook (billing): never gated. With persistSubscriptions the webhook is the
    // source-of-truth for the creem_subscription table and Creem retries only within
    // a limited window: a 503 in waitinglist/maintenance can lose payment events
    // (payer shown as non-payer, or access not revoked).
    if (path.startsWith("/api/auth/creem/webhook")) return;
    // Resend webhook: never gated (delivery/bounce events, Resend retries within a limited window).
    if (path.startsWith("/api/webhooks/resend")) return;

    // Nuxt internal resources / prerendered payloads: never gated
    // (also avoids a pointless Redis round-trip on assets).
    if (path.startsWith("/_")) return;

    const siteMode = await getServerSiteMode();
    if (siteMode === "active") {
        // The /maintenance page responds 503 in SSR: outside of maintenance it
        // must not be served. Mirrors the client and redirects to "/" (avoids spurious 503s,
        // e.g. a crawler returning after Retry-After with the site already active).
        if (isMaintenancePage(path)) return sendRedirect(event, "/", 302);
        return;
    }

    const isApi = path.startsWith("/api/");

    // === WAITING LIST ===
    if (siteMode === "waitinglist") {
        if (isApi) {
            if (path.startsWith("/api/waiting-list/")) return;
            throw createError({
                statusCode: 503,
                statusMessage: "Service Unavailable",
            });
        }
        if (isWaitingListBlockedPage(path)) {
            return sendRedirect(event, "/", 302);
        }
        return;
    }

    // === MAINTENANCE ===
    if (siteMode === "maintenance") {
        if (isApi) {
            throw createError({
                statusCode: 503,
                statusMessage: "Service Unavailable",
            });
        }
        // The maintenance page itself (including localised variants) passes through and responds 503.
        if (isMaintenancePage(path)) return;
        return sendRedirect(event, "/maintenance", 302);
    }
});
