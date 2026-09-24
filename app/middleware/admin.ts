import { api } from "~~/convex/_generated/api";

/**
 * Admin console guard (plan Task 15).
 *
 * A convenience, not the gate: every `api.admin.*` function checks the
 * superAdmin role on the server, and the admin layout renders nothing until
 * `api.admin.whoami` succeeds. This middleware only spares a non-admin a page
 * of refusals by sending them where they belong.
 *
 * `whoami` is itself an admin function, so "am I an admin?" is answered by the
 * same check that protects the data — there is no separate public role probe.
 * Any failure (not signed in, not an admin, network) fails closed.
 */
export default defineNuxtRouteMiddleware(async (to) => {
    // The console is CSR only (`routeRules`): the Convex websocket client and the
    // Better Auth token exist in the browser.
    if (import.meta.server) return;

    const localePath = useLocalePath();
    const { loggedIn, fetchSession } = useAuth();
    await fetchSession();

    if (!loggedIn.value) {
        return navigateTo(`${localePath("/login")}?redirect=${encodeURIComponent(to.fullPath)}`);
    }

    const convex = useNuxtApp().$convex;
    if (!convex) return navigateTo(localePath("/dashboard"));

    try {
        await convex.query(api.admin.whoami, {});
    } catch {
        return navigateTo(localePath("/dashboard"));
    }
});
