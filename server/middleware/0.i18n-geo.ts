/**
 * Server middleware: redirect locale su "/" in base alla geolocalizzazione IP.
 *
 * Perché esiste: "/" è prerendered (CDN statico) quindi il
 * `detectBrowserLanguage` di @nuxtjs/i18n non gira mai al primo hit.
 * Questo middleware copre le richieste SSR/dinamiche; il caso CDN-statico
 * è coperto da `app/plugins/i18n-geo.client.ts`.
 *
 * Priorità:
 *   1. Cookie `i18n_redirected` già settato → lascia fare a nuxt-i18n (scelta utente).
 *   2. Header geo del provider: `x-vercel-ip-country` (Vercel), `cf-ipcountry`
 *      (Cloudflare), `x-country-code` (generico).
 *   3. Fallback `accept-language`: se la prima lingua non è `it*` → `/en`.
 *   4. Solo `IT` (e assenza di segnali non-IT) resta su `/` (italiano default).
 *
 * Solo sul path esatto "/" — tutte le altre route hanno già il prefisso
 * locale o sono gestite da nuxt-i18n.
 */
export default defineEventHandler((event) => {
    if (import.meta.prerender) return;

    const path = event.path || "/";
    if (path !== "/") return;

    const cookies = parseCookies(event);
    // L'utente ha già una scelta (o è già stato rediretto): non interferire.
    if (cookies.i18n_redirected) return;

    const headers = getHeaders(event);
    const country = (
        headers["x-vercel-ip-country"] ||
        headers["cf-ipcountry"] ||
        headers["x-country-code"] ||
        ""
    ).toUpperCase();

    if (country) {
        if (country !== "IT") {
            return sendRedirect(event, "/en", 302);
        }
        return;
    }

    // Nessun header geo (dev locale, preview): fallback Accept-Language.
    const acceptLanguage = headers["accept-language"] || "";
    const firstLang = acceptLanguage.split(",")[0]?.trim().toLowerCase() || "";
    if (firstLang && !firstLang.startsWith("it")) {
        return sendRedirect(event, "/en", 302);
    }
});
