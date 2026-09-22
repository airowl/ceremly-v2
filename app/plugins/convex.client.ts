import { defineNuxtPlugin } from "#app";
import { createConvexTokenFetcher } from "~/lib/auth-client";
import { installConvex } from "~/lib/convexInstall";

/**
 * Browser Convex client, with the Better Auth JWT attached (Task 14).
 *
 * Before this task the file only *provided* the URL and left a note that the
 * client would be initialised "in useAuth" — which never happened, so no
 * `useConvexQuery` could have worked in the app. The install lives here because
 * the Vue app instance is only available to a plugin, and because `setAuth`
 * must be called exactly once per client.
 *
 * Ordering is not load-bearing: `createConvexTokenFetcher` never rejects and
 * keeps the last token across transient failures, so installing before or after
 * the session fetch only changes when the first authenticated query succeeds.
 * The Convex client asks for a token again when a function call comes back with
 * an auth error, which is what recovers a client installed before sign-in.
 */
export default defineNuxtPlugin({
    name: "convex",
    setup(nuxtApp) {
        const config = nuxtApp.$config;
        const convexUrl = config.public.convexUrl;

        if (!convexUrl) {
            console.warn("[convex] NUXT_PUBLIC_CONVEX_URL or NUXT_PUBLIC_CONVEX_SITE_URL not set");
            return;
        }

        // Kept for components that only need the URL (no behaviour change).
        nuxtApp.provide("convexUrl", convexUrl);

        const { client } = useAuth();
        const convexClient = installConvex(
            nuxtApp.vueApp,
            convexUrl,
            createConvexTokenFetcher(client),
        );

        return {
            provide: {
                convex: convexClient,
            },
        };
    },
});
