import { defineNuxtPlugin } from "#app";
import { installConvexHttp } from "~/plugins/convex";

/**
 * Server-only Convex install (Task 14): the plugin context with the **HTTP
 * client only**, no websocket client.
 *
 * It exists for the one route that still renders on the server with Convex
 * data — `/e/**`, the guest invitation, whose HTML carries the OG preview that
 * WhatsApp and Telegram read. Everything under `/dashboard/**` is CSR, so it
 * never reaches this file; and `useConvexQuery` only needs the context to exist
 * (with `{ server: false }` it returns inert refs on the server before touching
 * either client), while `useConvexHttpQuery` needs `httpClientRef`.
 */
export default defineNuxtPlugin({
    name: "convex-http",
    setup(nuxtApp) {
        const convexUrl = nuxtApp.$config.public.convexUrl;

        if (!convexUrl) {
            console.warn("[convex] NUXT_PUBLIC_CONVEX_URL or NUXT_PUBLIC_CONVEX_SITE_URL not set");
            return;
        }

        installConvexHttp(nuxtApp.vueApp, convexUrl);
    },
});
