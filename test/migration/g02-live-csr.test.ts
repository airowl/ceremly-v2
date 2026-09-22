// @vitest-environment jsdom
/// <reference types="vitest/globals" />
import { describe, expect, it } from "vitest";
import { createApp, defineComponent, h } from "vue";
import { useConvexMutation, useConvexQuery } from "convex-vue";
import { WebSocket as WsWebSocket } from "ws";
import { installConvex, type FetchConvexToken } from "~/lib/convexInstall";
import { GATE_AUTH_ISSUER } from "../../convex/auth.config";
import { api } from "../../convex/_generated/api";
import { gatePrivateKeyPem, signGateToken } from "./gate-jwt";

const gatePrivateKey = gatePrivateKeyPem();

// Gate G02 (plan Task 3 Step 4), client half: authenticated CSR query path,
// typed mutation, realtime re-execution after a write, forced token refresh and
// survival of a transient token failure. Requires a live Convex deployment:
// armed by `pnpm test:gate:g02` + NUXT_PUBLIC_CONVEX_URL (or CONVEX_GATE_URL).
const armed = process.env.G02_GATE === "live";
const url = process.env.CONVEX_GATE_URL || process.env.NUXT_PUBLIC_CONVEX_URL || "";
const KEY = "g02-csr";

// jsdom's WebSocket is a thin wrapper around undici's, and undici fires its
// "open" event with `new Event(...)` taken from the *global* scope. Under
// vitest+jsdom that global is jsdom's Event, which Node's EventTarget rejects
// (`ERR_INVALID_ARG_TYPE`: "must be an instance of Event") — so the socket never
// opens. Pin the client to the `ws` implementation convex itself uses on Node.
globalThis.WebSocket = WsWebSocket as unknown as typeof WebSocket;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntil(check: () => boolean, timeoutMs = 15000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        if (check()) return;
        await sleep(50);
    }
    throw new Error("timed out waiting for the Convex deployment to converge");
}

describe.skipIf(!armed)("G02 live · CSR (websocket client)", () => {
    it("lands a typed mutation and re-executes the open subscription", async () => {
        expect(url).toBeTruthy();

        const value = `v-${Date.now()}`;
        let latest!: ReturnType<typeof useConvexQuery<typeof api.health.latest>>;
        let record!: ReturnType<typeof useConvexMutation<typeof api.health.record>>;

        const Probe = defineComponent({
            setup() {
                latest = useConvexQuery(api.health.latest, { key: KEY });
                record = useConvexMutation(api.health.record);
                return () => h("div");
            },
        });

        const app = createApp(Probe);
        const client = installConvex(app, url, async () => null);
        app.mount(document.createElement("div"));

        // Initial subscription result (whatever the previous gate run left).
        await waitUntil(() => latest.data.value !== undefined);
        expect(latest.data.value?.value).not.toBe(value);

        const written = await record.mutate({ key: KEY, value });
        expect(written.value).toBe(value);

        // Realtime proof: nobody re-queried; the subscription re-ran on its own.
        await waitUntil(() => latest.data.value?.value === value);
        expect(latest.error.value).toBeNull();

        app.unmount();
        await client.close();
    }, 30000);

    it.skipIf(!gatePrivateKey)("resolves the identity of an authenticated CSR query", async () => {
        const subject = `gate-user-${Date.now()}`;
        const token = signGateToken({ privateKeyPem: gatePrivateKey!, subject });

        let whoami!: ReturnType<typeof useConvexQuery<typeof api.health.whoami>>;
        const Probe = defineComponent({
            setup() {
                whoami = useConvexQuery(api.health.whoami, {});
                return () => h("div");
            },
        });

        const app = createApp(Probe);
        const client = installConvex(app, url, async () => token);
        app.mount(document.createElement("div"));

        await waitUntil(() => whoami.data.value !== undefined);
        expect(whoami.data.value?.subject).toBe(subject);
        expect(whoami.data.value?.issuer).toBe(GATE_AUTH_ISSUER);
        expect(whoami.error.value).toBeNull();

        app.unmount();
        await client.close();
    }, 30000);

    it("keeps an anonymous CSR query anonymous", async () => {
        let whoami!: ReturnType<typeof useConvexQuery<typeof api.health.whoami>>;
        const Probe = defineComponent({
            setup() {
                whoami = useConvexQuery(api.health.whoami, {});
                return () => h("div");
            },
        });

        const app = createApp(Probe);
        const client = installConvex(app, url, async () => null);
        app.mount(document.createElement("div"));

        // The subscription must resolve to `null`, not stay pending forever.
        await waitUntil(() => whoami.data.value !== undefined || whoami.error.value !== null);
        expect(whoami.error.value).toBeNull();
        expect(whoami.data.value).toBeNull();

        app.unmount();
        await client.close();
    }, 30000);

    it("refreshes a rejected token exactly once and keeps the query usable", async () => {
        const calls: Array<{ forceRefreshToken: boolean }> = [];
        const fetchToken: FetchConvexToken = async ({ forceRefreshToken }) => {
            calls.push({ forceRefreshToken });
            return forceRefreshToken ? null : "g02-not-a-valid-convex-jwt";
        };

        let ping!: ReturnType<typeof useConvexQuery<typeof api.health.ping>>;
        const Probe = defineComponent({
            setup() {
                ping = useConvexQuery(api.health.ping, {});
                return () => h("div");
            },
        });

        const app = createApp(Probe);
        const client = installConvex(app, url, fetchToken);
        app.mount(document.createElement("div"));

        expect(calls[0]).toEqual({ forceRefreshToken: false });
        // The deployment rejects the token; the client must ask for a forced
        // refresh instead of dropping to a permanent signed-out state.
        await waitUntil(() => calls.some((call) => call.forceRefreshToken));
        await waitUntil(() => ping.data.value?.ok === true);

        // No refresh loop: once the session resolves to "no token", it settles.
        const settled = calls.length;
        await sleep(1500);
        expect(calls.length).toBe(settled);
        expect(ping.error.value).toBeNull();

        app.unmount();
        await client.close();
    }, 30000);

    it("survives a transient session failure without latching into a signed-out state", async () => {
        // Mirrors the Task 4 contract: the wrapper never rejects. A transient
        // 502 on the session endpoint is swallowed and reported as "no token",
        // so the client keeps working anonymously instead of logging out.
        // (Observed on convex 1.45.0: a fetchToken that *rejects* propagates as
        // an unhandled rejection out of setAuth and the client never connects,
        // so the wrapper must absorb the error.)
        let sessionEndpointUp = false;
        let fetchCount = 0;
        const fetchToken: FetchConvexToken = async () => {
            fetchCount += 1;
            if (!sessionEndpointUp) {
                try {
                    throw new Error("502 from session endpoint");
                } catch {
                    return null; // transient failure: keep the previous (anonymous) state
                }
            }
            return null;
        };

        let ping!: ReturnType<typeof useConvexQuery<typeof api.health.ping>>;
        let record!: ReturnType<typeof useConvexMutation<typeof api.health.record>>;
        const Probe = defineComponent({
            setup() {
                ping = useConvexQuery(api.health.ping, {});
                record = useConvexMutation(api.health.record);
                return () => h("div");
            },
        });

        const app = createApp(Probe);
        const client = installConvex(app, url, fetchToken);
        app.mount(document.createElement("div"));

        // While the session endpoint is down the client is still connected.
        await waitUntil(() => ping.data.value?.ok === true);

        const value = `recovered-${Date.now()}`;
        const written = await record.mutate({ key: KEY, value });
        expect(written.value).toBe(value);

        // Session endpoint back online: installing the auth function again
        // re-asks for the token instead of staying latched as signed out.
        sessionEndpointUp = true;
        const before = fetchCount;
        client.setAuth(fetchToken);
        await waitUntil(() => fetchCount > before);
        await waitUntil(() => ping.data.value?.ok === true);
        expect(ping.error.value).toBeNull();

        app.unmount();
        await client.close();
    }, 30000);
});
