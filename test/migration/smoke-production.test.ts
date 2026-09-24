import { describe, expect, it } from "vitest";
import { metaCsp, runSmoke, smokeFetchGuard, type SmokeOptions } from "../../scripts/migration/smoke-production";

/**
 * Task 17 — the smoke run between "DNS points at the new stack" and "Convex
 * accepts writes" (Task 18, Step 4). `--read-only` is run against production
 * before the point of no return, so it must be unable to write: only GETs, plus
 * Convex's query endpoint (a query cannot write). The proof is the injected
 * fetch: every request the run makes is recorded here.
 */

const BASE = "https://ceremly.test";
const CONVEX = "https://happy-otter-123.eu-west-1.convex.cloud";
const CONVEX_SITE = "https://happy-otter-123.eu-west-1.convex.site";

type Call = { url: string; method: string; body?: string };

function fakeFetch(overrides: { mode?: string; csp?: string; homeStatus?: number; cspInMeta?: boolean } = {}) {
    const calls: Call[] = [];
    const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        const method = (init?.method ?? "GET").toUpperCase();
        calls.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });
        const mode = overrides.mode ?? "maintenance-readonly";
        if (url === `${BASE}/`) {
            const csp = overrides.csp ?? `default-src 'self'; connect-src 'self' ${CONVEX} wss://happy-otter-123.eu-west-1.convex.cloud`;
            const headers: Record<string, string> = { "strict-transport-security": "max-age=63072000; includeSubDomains; preload" };
            if (!overrides.cspInMeta) headers["content-security-policy"] = csp;
            const html = overrides.cspInMeta
                ? `<html><head><meta http-equiv="Content-Security-Policy" content="${csp.replace(/'/g, "&#39;")}"></head></html>`
                : "<html></html>";
            return new Response(html, { status: overrides.homeStatus ?? 200, headers });
        }
        if (url === `${BASE}/login`) return new Response("<html></html>", { status: 200 });
        if (url === `${BASE}/api/auth/get-session`) return new Response("null", { status: 200 });
        if (url === `${CONVEX_SITE}/public/site-mode`) return new Response(JSON.stringify({ mode }), { status: 200 });
        if (url === `${CONVEX}/api/query`) {
            return new Response(JSON.stringify({ status: "success", value: { mode } }), { status: 200 });
        }
        if (url.startsWith(`${BASE}/api/public/invite/`) && method === "POST") return new Response("{}", { status: 200 });
        return new Response("not found", { status: 404 });
    };
    return { calls, impl: impl as typeof fetch };
}

const options = (overrides: Partial<SmokeOptions> = {}): SmokeOptions => ({
    mode: "read-only",
    baseUrl: BASE,
    convexUrl: CONVEX,
    convexSiteUrl: CONVEX_SITE,
    expectSiteMode: "maintenance-readonly",
    ...overrides,
});

describe("smoke --read-only", () => {
    it("passes on a healthy new stack and performs only GETs and Convex queries", async () => {
        const { calls, impl } = fakeFetch();
        const { exitCode, report } = await runSmoke(options(), { fetch: impl, env: {} });
        expect(report.checks.filter((c) => c.status !== "PASS")).toEqual([]);
        expect(exitCode).toBe(0);

        expect(calls.length).toBeGreaterThanOrEqual(5);
        for (const call of calls) {
            const isGet = call.method === "GET" || call.method === "HEAD";
            const isConvexQuery = call.method === "POST" && call.url === `${CONVEX}/api/query`;
            expect(isGet || isConvexQuery, `${call.method} ${call.url}`).toBe(true);
        }
        // The only POST body is a query, never a mutation or action.
        for (const call of calls.filter((c) => c.method === "POST")) {
            expect(JSON.parse(call.body ?? "{}")).toMatchObject({ path: "siteSettings:getPublic" });
        }
    });

    it("fails when the site mode is not the expected one", async () => {
        const { impl } = fakeFetch({ mode: "active" });
        const { exitCode, report } = await runSmoke(options(), { fetch: impl, env: {} });
        expect(exitCode).toBe(1);
        expect(report.checks.find((c) => c.id === "convexSiteMode")?.status).toBe("FAIL");
    });

    it("fails when the build's CSP does not allow the Convex origin (URL baked at build)", async () => {
        const { impl } = fakeFetch({ csp: "default-src 'self'; connect-src 'self' https://old-deployment.convex.cloud" });
        const { exitCode, report } = await runSmoke(options(), { fetch: impl, env: {} });
        expect(exitCode).toBe(1);
        expect(report.checks.find((c) => c.id === "home")?.status).toBe("FAIL");
    });

    it("reads the CSP from the <meta> of a prerendered page (Assets layer)", async () => {
        const { impl } = fakeFetch({ cspInMeta: true });
        const { exitCode } = await runSmoke(options(), { fetch: impl, env: {} });
        expect(exitCode).toBe(0);
        expect(metaCsp(`<meta http-equiv="content-security-policy" content="connect-src &#39;self&#39; ${CONVEX}">`)).toBe(
            `connect-src 'self' ${CONVEX}`,
        );
    });

    it("fails, not crashes, on a 5xx", async () => {
        const { impl } = fakeFetch({ homeStatus: 502 });
        const { exitCode } = await runSmoke(options(), { fetch: impl, env: {} });
        expect(exitCode).toBe(1);
    });

    it("never sends the write canary", async () => {
        const { calls, impl } = fakeFetch();
        await runSmoke(options(), { fetch: impl, env: { SMOKE_CANARY_INVITE_TOKEN: "canary-token" } });
        expect(calls.some((c) => c.url.includes("/rsvp"))).toBe(false);
    });
});

describe("smoke fetch guard", () => {
    it("read-only refuses every write, including a POST to the site or a Convex mutation", async () => {
        const seen: string[] = [];
        const guarded = smokeFetchGuard("read-only", CONVEX, (async (url: string) => {
            seen.push(url);
            return new Response("{}");
        }) as unknown as typeof fetch);
        await expect(guarded(`${BASE}/api/public/invite/t/rsvp`, { method: "POST" })).rejects.toThrow(/read-only/);
        await expect(guarded(`${CONVEX}/api/mutation`, { method: "POST" })).rejects.toThrow(/read-only/);
        await expect(guarded(`${CONVEX}/api/action`, { method: "POST" })).rejects.toThrow(/read-only/);
        await expect(guarded(`${BASE}/x`, { method: "DELETE" })).rejects.toThrow(/read-only/);
        expect(seen).toEqual([]);
        await guarded(`${CONVEX}/api/query`, { method: "POST", body: "{}" });
        await guarded(`${BASE}/`);
        expect(seen).toEqual([`${CONVEX}/api/query`, `${BASE}/`]);
    });
});

describe("smoke --write-canary (defined, never run by this task)", () => {
    it("requires a canary invite token", async () => {
        const { calls, impl } = fakeFetch({ mode: "active" });
        const { exitCode, report } = await runSmoke(options({ mode: "write-canary", expectSiteMode: "active" }), {
            fetch: impl,
            env: {},
        });
        expect(exitCode).toBe(1);
        expect(report.checks.find((c) => c.id === "rsvpCanary")?.detail).toMatch(/SMOKE_CANARY_INVITE_TOKEN/);
        expect(calls.some((c) => c.method === "POST" && c.url.includes("/rsvp"))).toBe(false);
    });

    it("sends exactly one RSVP to the canary token (fake fetch)", async () => {
        const { calls, impl } = fakeFetch({ mode: "active" });
        const { exitCode } = await runSmoke(options({ mode: "write-canary", expectSiteMode: "active" }), {
            fetch: impl,
            env: { SMOKE_CANARY_INVITE_TOKEN: "canary-token" },
        });
        expect(exitCode).toBe(0);
        const writes = calls.filter((c) => c.method === "POST" && c.url !== `${CONVEX}/api/query`);
        expect(writes.map((c) => c.url)).toEqual([`${BASE}/api/public/invite/canary-token/rsvp`]);
    });
});
