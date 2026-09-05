/**
 * Client plugin: redirect locale su "/" quando la pagina è servita statica
 * (prerender CDN) e il middleware server `0.i18n-geo.ts` non è stato eseguito.
 *
 * Gira solo su "/" esatto, solo se il cookie `i18n_redirected` non esiste
 * (nessuna scelta precedente / nessun redirect già avvenuto):
 * se `navigator.language` non è italiano → `/en`.
 */
export default defineNuxtPlugin(() => {
    if (useRoute().path !== "/") return;

    const redirected = useCookie("i18n_redirected").value;
    if (redirected) return;

    const lang = navigator.language?.toLowerCase() || "";
    if (lang && !lang.startsWith("it")) {
        window.location.replace("/en");
    }
});
