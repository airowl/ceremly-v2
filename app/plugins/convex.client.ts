import { defineNuxtPlugin } from "#app";
import { convexVue, useConvexClient } from "convex-vue";
import type { App } from "vue";

export type FetchConvexToken = (args: { forceRefreshToken: boolean }) => Promise<string | null>;

export function installConvex(app: App, url: string, fetchToken: FetchConvexToken) {
  app.use(convexVue, { url, server: true });
  const client = app.runWithContext(() => useConvexClient());
  client.setAuth(fetchToken);
  return client;
}

export default defineNuxtPlugin((nuxtApp) => {
  const config = nuxtApp.$config;
  const convexUrl = config.public.convexUrl;

  if (!convexUrl) {
    console.warn("[convex] NUXT_PUBLIC_CONVEX_URL or NUXT_PUBLIC_CONVEX_SITE_URL not set");
    return;
  }

  // Provide the Convex URL so components can use it
  nuxtApp.provide("convexUrl", convexUrl);

  // The actual client initialization with auth will happen in useAuth composable
  // when the user session is available.
});