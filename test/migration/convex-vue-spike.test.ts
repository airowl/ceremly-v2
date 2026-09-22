// @vitest-environment jsdom
/// <reference types="vitest/globals" />
/// <reference lib="dom" />
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApp, defineComponent, h } from "vue";
import { createPinia } from "pinia";
import { installConvex } from "~/lib/convexInstall";
import { useConvexQuery } from "convex-vue";
import { makeFunctionReference } from "convex/server";

// Sanctioned manual reference (convex docs: for custom clients); onUpdate is
// spied so no server is ever contacted.
const fakeQuery = makeFunctionReference<"query">("health:ping");

const QueryProbe = defineComponent({
  setup() {
    useConvexQuery(fakeQuery, {});
    return () => h("div");
  },
});

describe("convex-vue binding with auth token", () => {
  let app: ReturnType<typeof createApp>;
  let pinia: ReturnType<typeof createPinia>;
  let fetchTokenSpy: ReturnType<typeof vi.fn>;
  let client: ReturnType<typeof installConvex>;

  beforeEach(() => {
    fetchTokenSpy = vi.fn().mockResolvedValue("test-token");
    pinia = createPinia();
    app = createApp(QueryProbe);
    app.use(pinia);
  });

  it("registers fetch token once and unsubscribes query on unmount", async () => {
    // Install convex using our wrapper
    client = installConvex(app, "http://localhost:3210", fetchTokenSpy);

    // Spy the subscription path before mount: no server is contacted.
    const mockUnsubscribe = vi.fn();
    vi.spyOn(client, "onUpdate").mockReturnValue(
      mockUnsubscribe as unknown as ReturnType<typeof client.onUpdate>,
    );

    // The client points at a dead URL by design; silence its network-layer
    // reconnect chatter so test output stays pristine (assertions unaffected).
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    // Mount the app to trigger setAuth + query subscription
    app.mount(document.createElement("div"));

    // Verify setAuth was called once with fetchToken
    expect(fetchTokenSpy).toHaveBeenCalledTimes(1);
    expect(fetchTokenSpy).toHaveBeenCalledWith({ forceRefreshToken: false });

    // A query subscription was established through convex-vue
    expect(client.onUpdate).toHaveBeenCalledTimes(1);
    expect(mockUnsubscribe).not.toHaveBeenCalled();

    // Unmount tears the subscription down via onScopeDispose
    app.unmount();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    // Shut the client down so its socket stops retrying the dead URL
    // (prevents post-test reconnect chatter).
    await (client as unknown as { close?: () => Promise<void> }).close?.();
    logSpy.mockRestore();
  });
});
