import type { App } from "vue";
import { convexVue, useConvexClient } from "convex-vue";

export type FetchConvexToken = (args: { forceRefreshToken: boolean }) => Promise<string | null>;

export function installConvex(app: App, url: string, fetchToken: FetchConvexToken) {
  app.use(convexVue, { url, server: true });
  const client = app.runWithContext(() => useConvexClient());
  client.setAuth(fetchToken);
  return client;
}