import { defineNuxtPlugin } from "#app";

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