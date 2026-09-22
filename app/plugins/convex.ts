import type { App } from "vue";
import { inject } from "vue";
import { ConvexHttpClient } from "convex/browser";
import { convexVue, useConvexClient, type ConvexVueContext } from "convex-vue";

export type FetchConvexToken = (args: { forceRefreshToken: boolean }) => Promise<string | null>;

/**
 * Client-side install (Task 3, G02 wiring; used by `convex.client.ts`).
 *
 * `setAuth` is called here and not by `convex-vue` itself: the plugin's `auth`
 * option is inert (measured during G02), so the token fetcher has exactly one
 * caller. The fetcher must never reject — see `createConvexTokenFetcher`.
 */
export function installConvex(app: App, url: string, fetchToken: FetchConvexToken) {
  app.use(convexVue, { url, server: true });
  const client = app.runWithContext(() => useConvexClient());
  client.setAuth(fetchToken);
  return client;
}

/**
 * Server-side install (Task 14): the **HTTP client only**, no websocket client.
 *
 * The server path of `useConvexQuery` (and `useConvexHttpQuery`) talks to Convex
 * through `ConvexHttpClient`; the websocket `ConvexClient` is never used there,
 * because a server render subscribes to nothing. Building one anyway would put a
 * `new WebSocket(...)` in every Worker request on a runtime that has no global
 * `WebSocket` — so the context is created with `manualInit` and only
 * `httpClientRef` is filled in.
 *
 * Consequence, deliberate: on the server `useConvexQuery` must be called with
 * `{ server: false }` (it returns inert refs) or with the HTTP query API. A
 * query that tries the websocket path on the server throws "Client not
 * initialized" instead of silently hanging.
 */
export function installConvexHttp(app: App, url: string) {
  app.use(convexVue, { url, manualInit: true, server: true });

  const context = app.runWithContext(() => inject<ConvexVueContext | undefined>("convex-vue"));
  if (!context) {
    throw new Error("convex-vue context not installed");
  }

  const httpClient = new ConvexHttpClient(url);
  context.httpClientRef.value = httpClient;
  return httpClient;
}
