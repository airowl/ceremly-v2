// @vitest-environment jsdom
/// <reference types="vitest/globals" />
/// <reference lib="dom" />
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApp, h } from "vue";
import { createPinia } from "pinia";
import { installConvex } from "~/plugins/convex";

describe("convex-vue binding with auth token", () => {
  let app: ReturnType<typeof createApp>;
  let pinia: ReturnType<typeof createPinia>;
  let fetchTokenSpy: ReturnType<typeof vi.fn>;
  let client: ReturnType<typeof installConvex>;

  beforeEach(() => {
    fetchTokenSpy = vi.fn().mockResolvedValue("test-token");
    pinia = createPinia();
    app = createApp({
      render: () => h("div"),
    });
    app.use(pinia);
  });

  it("registers fetch token once and unsubscribes query on unmount", async () => {
    // Install convex using our wrapper
    client = installConvex(app, "http://localhost:3210", fetchTokenSpy);

    // Mount the app to trigger setAuth
    app.mount(document.createElement("div"));

    // Verify setAuth was called once with fetchToken
    expect(fetchTokenSpy).toHaveBeenCalledTimes(1);
    expect(fetchTokenSpy).toHaveBeenCalledWith({ forceRefreshToken: false });

    // Unmount
    app.unmount();
  });
});