/**
 * Server middleware: enforcement dei site mode waitinglist/maintenance.
 *
 * È la difesa REALE (il middleware client è solo UX). Modalità autorevole letta
 * via getServerSiteMode() — stessa authority del catch-all auth, così un toggle
 * runtime aggiorna entrambi in modo coerente.
 *
 * Approccio blocklist mirato: il server vede OGNI request (asset, _nuxt, payload,
 * API, jobs, cron), quindi blocca solo ciò che va bloccato e lascia passare il
 * resto. Le regole locale-agnostiche vivono in shared/constants/siteMode.
 *
 * WAITINGLIST:
 *   - API: tutte 503 tranne /api/waiting-list/** (+ jobs/cron/public sempre liberi)
 *   - Pagine: /dashboard, /login, /signup, /logout, /auth, /invite, /contact
 *     (in ogni locale) → redirect "/"
 * MAINTENANCE:
 *   - API: tutte 503 (tranne jobs/cron/public)
 *   - Pagine: tutte → /maintenance (che risponde 503 dal proprio setup)
 * MAINTENANCE-READONLY (modalità del cutover, Task 17):
 *   - valutata PRIMA di ogni esenzione: in questa modalità anche /api/public
 *     (RSVP), /api/cron e i webhook passano dalla stessa regola;
 *   - ogni metodo di scrittura → 503 + Retry-After, salvo l'allowlist esplicita
 *     `READONLY_ALLOWED_WRITES` (toggle site-mode, drain dei job, webhook,
 *     login password/TOTP e logout);
 *   - le GET passano, salvo quelle che scrivono (`READONLY_SIDE_EFFECT_READS`);
 *   - Pagine: tutte raggiungibili, /maintenance esclusa.
 * BREAK-GLASS (ogni modalità non-active, Task 15): /admin/**, /login?redirect=/admin…
 *   e le API di sessione di Better Auth passano (vedi `isAdminBreakGlass`).
 */
import {
    READONLY_RETRY_AFTER_SECONDS,
    isAdminBreakGlass,
    isMaintenancePage,
    isWaitingListBlockedPage,
    readonlyVerdict,
} from "~~/shared/constants/siteMode";
import { getServerSiteMode } from "../utils/siteMode";

export default defineEventHandler(async (event) => {
    // In fase di prerender (build) non c'è enforcement né Redis: le pagine
    // statiche vanno catturate sempre nello stato "active".
    if (import.meta.prerender) return;

    const path = event.path || "/";

    // Risorse interne di Nuxt / payload prerenderizzati: mai gate
    // (evita anche un round-trip Redis inutile sugli asset).
    if (path.startsWith("/_")) return;

    // Read before the exemptions below (review fix round 1, minor): the read-only
    // rule must see jobs/cron/public/webhooks too. The cost is one lookup on those
    // paths, the Creem webhook included — cached per instance for 10 s
    // (`server/utils/siteMode.ts`), and a Redis failure falls back to the env
    // value instead of throwing, so a webhook is never failed by this read.
    const siteMode = await getServerSiteMode();

    // === MAINTENANCE-READONLY ===
    //
    // Valutata prima delle esenzioni sotto: nelle altre modalità jobs, cron,
    // /api/public e i webhook sono sempre liberi, ma nel cutover una scrittura
    // dopo il watermark è persa (il delta export non la vede). Qui vale una regola
    // sola, chiusa per default sulle scritture (vedi `readonlyVerdict`).
    if (siteMode === "maintenance-readonly") {
        const verdict = readonlyVerdict(path, event.method);
        if (verdict === "redirect-home") return sendRedirect(event, "/", 302);
        if (verdict === "block") {
            setResponseHeader(event, "Retry-After", READONLY_RETRY_AFTER_SECONDS);
            throw createError({
                statusCode: 503,
                statusMessage: "Service Unavailable",
                data: { siteMode, retryAfter: READONLY_RETRY_AFTER_SECONDS },
            });
        }
        return;
    }

    // Background jobs (QStash) e cron (Vercel): liberi in ogni altra modalità.
    if (path.startsWith("/api/jobs") || path.startsWith("/api/cron")) return;

    // API pubbliche ospite (invito/RSVP/pixel email): liberi in ogni altra
    // modalità. I token degli inviti sono già stati recapitati agli ospiti: bloccarli
    // in waitinglist/maintenance romperebbe RSVP già in circolazione e il pixel
    // di apertura nelle email inviate.
    if (path.startsWith("/api/public/")) return;

    // Endpoint admin (protetti da admin API key): restano operabili anche in
    // waitinglist/maintenance. Critico: il toggle stesso (/api/admin/site-mode)
    // deve poter riaccendere il sito, altrimenti la maintenance è irreversibile via API.
    if (path.startsWith("/api/admin/")) return;

    // Webhook Creem (billing): mai gate. Con persistSubscriptions il webhook è la
    // source-of-truth della tabella creem_subscription e Creem ritenta solo per
    // una finestra limitata: un 503 in waitinglist/maintenance può perdere eventi
    // di pagamento (pagante mostrato come non-pagante, o accesso non revocato).
    if (path.startsWith("/api/auth/creem/webhook")) return;
    // Webhook Resend: mai gate (eventi delivery/bounce, Resend ritenta a finestra limitata).
    if (path.startsWith("/api/webhooks/resend")) return;

    if (siteMode === "active") {
        // La pagina /maintenance risponde 503 in SSR: fuori da maintenance non
        // va servita. Specchia il client e la redirige a "/" (evita 503 spuri,
        // es. un crawler che ritorna dopo Retry-After con il sito già attivo).
        if (isMaintenancePage(path)) return sendRedirect(event, "/", 302);
        return;
    }

    // Break-glass della console admin (Task 15): la shell `/admin`, il login diretto
    // alla console e le API di sessione restano raggiungibili in ogni modalità,
    // altrimenti la console non potrebbe annullare la modalità che ha impostato.
    // Il gate vero è Convex (`requireSuperAdmin`), non questa pagina.
    if (isAdminBreakGlass(path)) return;

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
        // La pagina di manutenzione stessa (anche localizzata) passa e risponde 503.
        if (isMaintenancePage(path)) return;
        return sendRedirect(event, "/maintenance", 302);
    }
});
