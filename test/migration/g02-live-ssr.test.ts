/// <reference types="vitest/globals" />
import { describe, expect, it } from "vitest";
import { createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "@vue/server-renderer";
import { useConvexQuery } from "convex-vue";
import { installConvex } from "~/lib/convexInstall";
import { api } from "../../convex/_generated/api";

// Gate G02 (plan Task 3 Step 4) requires the public query SSR case against a
// live Convex deployment: the plugin must reach Convex over the HTTP client
// while rendering on the server (no `window`), and suspense() must resolve the
// typed result. The deployment URL comes from .env (loaded by test/setup.ts).
//
// The suite is armed only by `pnpm test:gate:g02` so the default `pnpm test`
// never depends on a staging backend; when armed without a URL it fails loudly.
const armed = process.env.G02_GATE === "live";
const url = process.env.CONVEX_GATE_URL || process.env.NUXT_PUBLIC_CONVEX_URL || "";

describe.skipIf(!armed)("G02 live · SSR (HTTP client, no window)", () => {
    it("resolves a public query through suspense() while rendering on the server", async () => {
        expect(url).toBeTruthy();
        expect(typeof window).toBe("undefined");

        const Probe = defineComponent({
            async setup() {
                const { suspense } = useConvexQuery(api.health.ping, {});
                const result = await suspense();
                return () => h("div", { "data-ok": String(result.ok) });
            },
        });

        const app = createSSRApp(Probe);
        const client = installConvex(app, url, async () => null);

        const html = await renderToString(app);
        expect(html).toContain('data-ok="true"');

        await client.close();
    }, 20000);

    it("keeps a query explicitly marked client-only out of the SSR payload", async () => {
        const Probe = defineComponent({
            async setup() {
                const { data, suspense } = useConvexQuery(api.health.ping, {}, { server: false });
                await suspense();
                return () => h("div", { "data-resolved": String(data.value === undefined) });
            },
        });

        const app = createSSRApp(Probe);
        const client = installConvex(app, url, async () => null);

        const html = await renderToString(app);
        expect(html).toContain('data-resolved="true"');

        await client.close();
    }, 20000);
});
