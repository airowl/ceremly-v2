import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { loadNuxtConfig } from "@nuxt/kit";
import { convexConnectSources } from "../../shared/migration/convexCsp";

/**
 * G09 — the protection matrix (plan Task 8, Step 3).
 *
 * Two legs, one set of expectations:
 *
 * - **declared** (always): the Nuxt config is loaded and the protections it
 *   *says* it applies are asserted — HSTS lifetime, body and upload ceilings,
 *   bot-trap redirects, the CSP directives that must be there, and the exact set
 *   of routes allowed to relax a neutralizer. This is the leg that fails on a
 *   config regression, and it runs in the normal suite.
 * - **observed** (`G09_GATE=live`, needs `pnpm build:cloudflare` and the built
 *   `.output`): a real Worker is started on `wrangler dev` and the same
 *   protections are read off the wire. G01 asserted headers by code review; this
 *   is where they are measured, including the ones that only exist at runtime —
 *   the size ceilings, the trap redirects and the bad-user-agent gate.
 *
 * A protection that is declared but not observed (or the other way round) is a
 * finding, not a footnote: the first version of this gate is where the two HSTS
 * declarations (route rule vs `security.headers`) were compared against the
 * value the Worker actually returns.
 */

const LIVE = process.env.G09_GATE === "live";
const PORT = Number(process.env.G09_PORT ?? 8799);
const BASE = `http://127.0.0.1:${PORT}`;

/** A browser UA: `4.block-bots.ts` answers 403 to curl/wget/python-requests. */
const BROWSER_UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

const EXPECTED = {
    /** 2 years, per `security.headers.strictTransportSecurity`. */
    hstsMaxAge: 63072000,
    csp: ["default-src 'self'", "object-src 'none'", "frame-src 'self'"],
    fakeServer: { poweredBy: "PHP/5.2.17", server: "Apache/2.2.15" },
    bodyLimit: 1_000_000,
    uploadLimit: 5_000_000,
    /**
     * Declared route rule → the URL the observed leg fetches and where it must
     * land. Two authorities declare traps: Nuxt's `routeRules` redirect to `/`,
     * Nitro's `routeRules` (in `nuxt.config.ts` → `nitro.routeRules`) send the
     * dotfile and `wp-*`/`config*` families to `/404`. Both are non-content
     * answers, and the split is asserted rather than smoothed over.
     */
    botTraps: [
        { owner: "nuxt", declared: "/wp-admin/**", url: "/wp-admin", location: "/" },
        { owner: "nuxt", declared: "/wp-login.php", url: "/wp-login.php", location: "/" },
        { owner: "nuxt", declared: "/wordpress/**", url: "/wordpress/", location: "/" },
        { owner: "nuxt", declared: "/xmlrpc.php", url: "/xmlrpc.php", location: "/" },
        { owner: "nuxt", declared: "/cmd_sco", url: "/cmd_sco", location: "/" },
        { owner: "nuxt", declared: "/.git/**", url: "/.git/config", location: "/" },
        { owner: "nitro", declared: "/.env", url: "/.env", location: "/404" },
    ] satisfies { owner: "nuxt" | "nitro"; declared: string; url: string; location: string }[],
    /**
     * The only routes allowed to switch a neutralizer off, and which one. CSP
     * itself is never switched off: the exceptions relax the *body-mutating*
     * pieces (xssValidator) and the shared rate limiter, they do not drop headers.
     */
    exceptions: {
        "/api/_nuxt_icon/**": ["rateLimiter", "xssValidator", "corsHandler", "requestSizeLimiter"],
        "/*/p/*": ["rateLimiter"],
        "/api/auth/creem/**": ["corsHandler", "xssValidator", "rateLimiter"],
        "/api/webhooks/resend": ["corsHandler", "xssValidator", "rateLimiter"],
        "/api/jobs/**": ["corsHandler", "xssValidator", "rateLimiter"],
        "/api/cron/**": ["rateLimiter"],
    } as Record<string, string[]>,
} as const;

// ---------------------------------------------------------------------------
// Declared
// ---------------------------------------------------------------------------

/**
 * The `security` block of `nuxt-security`. Declared here as a local shape rather
 * than relied upon from the module augmentation: this file is typechecked by the
 * *Nuxt* project (which does not load the module's own types through
 * `loadNuxtConfig`'s return type), and a cast keeps the gate honest about what it
 * reads instead of silently asserting on `any`.
 */
interface SecurityBlock {
    headers?: {
        strictTransportSecurity?: { maxAge?: number; includeSubdomains?: boolean; preload?: boolean };
        contentSecurityPolicy?: Record<string, string[]>;
    };
    requestSizeLimiter?: { maxRequestSizeInBytes?: number; maxUploadFileRequestInBytes?: number };
    rateLimiter?: { tokensPerInterval?: number; interval?: string };
    allowedMethodsRestricter?: { methods?: string[] };
}

type LoadedConfig = Awaited<ReturnType<typeof loadNuxtConfig>>;
const securityOf = (config: LoadedConfig): SecurityBlock =>
    (config as LoadedConfig & { security?: SecurityBlock }).security ?? {};

describe("protection matrix (declared)", () => {
    let config: LoadedConfig;

    beforeAll(async () => {
        config = await loadNuxtConfig({ cwd: process.cwd() });
    }, 120_000);

    it("declares HSTS for two years with preload", () => {
        const hsts = securityOf(config).headers?.strictTransportSecurity;
        expect(hsts).toMatchObject({
            maxAge: EXPECTED.hstsMaxAge,
            includeSubdomains: true,
            preload: true,
        });
    });

    it("declares the request and upload size ceilings", () => {
        expect(securityOf(config).requestSizeLimiter).toMatchObject({
            maxRequestSizeInBytes: EXPECTED.bodyLimit,
            maxUploadFileRequestInBytes: EXPECTED.uploadLimit,
        });
    });

    it("declares the in-app rate limiter and the HTTP methods it allows", () => {
        expect(securityOf(config).rateLimiter).toMatchObject({ tokensPerInterval: 100, interval: "minute" });
        expect(securityOf(config).allowedMethodsRestricter?.methods).toEqual([
            "GET",
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
            "OPTIONS",
        ]);
    });

    it("declares the CSP directives the matrix relies on, without unsafe-eval", () => {
        const csp = securityOf(config).headers?.contentSecurityPolicy ?? {};
        for (const directive of EXPECTED.csp) {
            const [name, ...tokens] = directive.split(" ");
            const declared = (csp as Record<string, string[]>)[name!];
            expect(declared, `${name} must be declared`).toBeDefined();
            for (const token of tokens) {
                expect(declared, `${name} must contain ${token}`).toContain(token);
            }
        }
        // `'wasm-unsafe-eval'` is a different token from `'unsafe-eval'` (it only
        // allows compiling WASM): compare tokens, never substrings, or the gate
        // fails for the wrong reason.
        expect(csp["script-src"] ?? []).not.toContain("'unsafe-eval'");
    });

    it("lets the browser reach this Convex deployment and R2, and nothing wider", () => {
        // Without these the dashboard's websocket and the presigned R2 PUT are
        // blocked by the page's own CSP (Task 14). Exact origins derived from
        // NUXT_PUBLIC_CONVEX_URL at build time — a `*.convex.cloud` wildcard would
        // allow exfiltration to any Convex deployment (Task 14c fix round 1).
        const connect = securityOf(config).headers?.contentSecurityPolicy?.["connect-src"] ?? [];
        expect(connect.filter((source) => /\*\.convex\./.test(source))).toEqual([]);
        for (const source of convexConnectSources(process.env.NUXT_PUBLIC_CONVEX_URL)) {
            expect(connect).toContain(source);
        }
        expect(connect).toContain("https://*.r2.cloudflarestorage.com");
    });

    it("derives exactly the deployment's https and wss origins", () => {
        expect(convexConnectSources("https://wary-spaniel-466.convex.cloud")).toEqual([
            "https://wary-spaniel-466.convex.cloud",
            "wss://wary-spaniel-466.convex.cloud",
        ]);
        expect(convexConnectSources("http://127.0.0.1:3210")).toEqual([
            "http://127.0.0.1:3210",
            "ws://127.0.0.1:3210",
        ]);
        expect(convexConnectSources(undefined)).toEqual([]);
        expect(convexConnectSources("not a url")).toEqual([]);
        expect(convexConnectSources("https://*.convex.cloud")).toEqual([]);
    });

    it("declares a redirect for every bot trap", () => {
        for (const trap of EXPECTED.botTraps) {
            const rules = trap.owner === "nuxt" ? config.routeRules : config.nitro?.routeRules;
            const rule = rules?.[trap.declared];
            expect(rule, `${trap.declared} must be trapped (${trap.owner})`).toBeDefined();
            expect(rule, `${trap.declared} must redirect`).toMatchObject({ redirect: trap.location });
        }
    });

    it("keeps fake server headers in the global route rule", () => {
        const headers = config.routeRules?.["/**"]?.headers ?? {};
        expect(headers["X-Powered-By"]).toBe(EXPECTED.fakeServer.poweredBy);
        expect(headers.Server).toBe(EXPECTED.fakeServer.server);
        expect(headers["X-Content-Type-Options"]).toBe("nosniff");
        expect(headers["X-Frame-Options"]).toBe("DENY");
    });

    it("relaxes a neutralizer only on the documented routes", () => {
        const relaxed: Record<string, string[]> = {};

        for (const [route, rule] of Object.entries(config.routeRules ?? {})) {
            const security = (rule as { security?: Record<string, boolean> }).security;
            if (!security) continue;
            const disabled = Object.entries(security)
                .filter(([, enabled]) => enabled === false)
                .map(([name]) => name)
                .sort();
            relaxed[route] = disabled;
        }

        const expected: Record<string, string[]> = Object.fromEntries(
            Object.entries(EXPECTED.exceptions).map(([route, names]) => [route, [...names].sort()]),
        );

        expect(relaxed).toEqual(expected);
    });

    it("never disables xssValidator where the body is not signature-verified elsewhere", () => {
        // nuxt-security's xssValidator mutates the POST body. It may only be off
        // where the route authenticates the *raw* bytes: a provider webhook
        // (Creem signature, Resend/Svix) or a QStash job (HMAC). Everything else
        // keeps it on, including the auth proxy and the public RSVP route.
        const allowed = ["/api/auth/creem/**", "/api/webhooks/resend", "/api/jobs/**", "/api/_nuxt_icon/**"];

        for (const [route, rule] of Object.entries(config.routeRules ?? {})) {
            const security = (rule as { security?: Record<string, boolean> }).security;
            if (security?.xssValidator !== false) continue;
            expect(allowed, `${route} may not disable xssValidator`).toContain(route);
        }
    });
});

// ---------------------------------------------------------------------------
// Observed (live Worker)
// ---------------------------------------------------------------------------

/** Splits a CSP header into directive → tokens. */
function parseCsp(header: string): Record<string, string[]> {
    return Object.fromEntries(
        header
            .split(";")
            .map((part) => part.trim())
            .filter(Boolean)
            .map((part) => {
                const [name, ...tokens] = part.split(/\s+/);
                return [name!, tokens];
            }),
    );
}

async function probe(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (!headers.has("user-agent")) headers.set("user-agent", BROWSER_UA);

    return await fetch(`${BASE}${path}`, { ...init, redirect: "manual", headers });
}

describe.skipIf(!LIVE)("protection matrix (observed on the Worker)", () => {
    let worker: ChildProcess;
    let workerOutput = "";

    beforeAll(async () => {
        if (!existsSync(".output/server/index.mjs")) {
            throw new Error(
                "G09 live leg needs a Cloudflare build: run " +
                    "`NODE_OPTIONS=--max-old-space-size=6144 pnpm build:cloudflare` first",
            );
        }

        worker = spawn(
            "npx",
            ["--no-install", "wrangler", "dev", "--cwd", ".output", "--port", String(PORT), "--ip", "127.0.0.1"],
            {
                cwd: process.cwd(),
                env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" },
                stdio: ["ignore", "pipe", "pipe"],
            },
        );
        worker.stdout?.on("data", (chunk: Buffer) => (workerOutput += chunk.toString()));
        worker.stderr?.on("data", (chunk: Buffer) => (workerOutput += chunk.toString()));

        const deadline = Date.now() + 120_000;
        for (;;) {
            try {
                await fetch(`${BASE}/robots.txt`, { redirect: "manual" });
                break;
            } catch {
                if (Date.now() > deadline) {
                    throw new Error(`wrangler dev did not answer on ${PORT}:\n${workerOutput.slice(-2000)}`);
                }
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
        }
    }, 180_000);

    afterAll(() => {
        worker?.kill("SIGKILL");
    });

    /**
     * The prerendered landing page is served by the Workers *Assets* layer: no
     * Nitro handler runs, so `routeRules`/`nuxt-security` headers cannot reach it.
     * `public/_headers` is what carries them, and this case is what caught the
     * gap in the first place (before it existed, `GET /` answered with only
     * `cache-control`/`content-type`/`etag`).
     */
    it("serves the transport security headers on the asset-served landing page", { timeout: 60_000 }, async () => {
        const response = await probe("/");
        expect(response.status).toBe(200);

        const hsts = response.headers.get("strict-transport-security") ?? "";
        expect(hsts, "a meta tag cannot deliver HSTS: this must be a header").toContain(
            `max-age=${EXPECTED.hstsMaxAge}`,
        );
        expect(hsts).toContain("includeSubDomains");
        expect(hsts).toContain("preload");

        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(response.headers.get("x-frame-options")).toBe("DENY");
        expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
        expect(response.headers.get("permissions-policy")).toContain("geolocation=()");
        expect(response.headers.get("x-powered-by")).toBe(EXPECTED.fakeServer.poweredBy);
        expect(response.headers.get("server")).toBe(EXPECTED.fakeServer.server);

        // The CSP on a prerendered page is a `<meta http-equiv>` generated at build
        // time (`nuxt-security` ssg), because a static file has no header phase.
        const html = await response.text();
        const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/);
        expect(meta, "prerendered HTML must carry the CSP meta tag").not.toBeNull();
        expect(meta![1]).toContain("object-src 'none'");
        expect(meta![1]).toContain("script-src-attr 'none'");
    });

    it("keeps hashed build assets immutable", { timeout: 60_000 }, async () => {
        const entry = readdirSync(".output/public/_nuxt").find((file) => file.endsWith(".js"));
        expect(entry, "the build must ship hashed assets").toBeDefined();

        const response = await probe(`/_nuxt/${entry}`);
        expect(response.status).toBe(200);
        // `/_nuxt/**` declares this in routeRules, but those URLs never reach the
        // Nitro handler either: the immutable policy only exists because
        // `public/_headers` restates it for the Assets layer.
        expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    });

    it("serves CSP and the policy headers on a server-rendered route", { timeout: 60_000 }, async () => {
        const response = await probe("/blogs");
        expect(response.status).toBe(200);

        const csp = response.headers.get("content-security-policy") ?? "";
        for (const directive of EXPECTED.csp) {
            expect(csp, `CSP must carry ${directive}`).toContain(directive);
        }
        expect(parseCsp(csp)["script-src"] ?? []).not.toContain("'unsafe-eval'");
        expect(response.headers.get("server")).toBe(EXPECTED.fakeServer.server);

        // The misdirection invariant: whatever this header ends up being, it must
        // never advertise the real stack. `nuxt-security`'s `hidePoweredBy` strips
        // the route rule's fake value on rendered responses, which is the right
        // trade: the framework header can never leak.
        const advertised = response.headers.get("x-powered-by") ?? "";
        expect(advertised, `x-powered-by leaks the stack: ${advertised}`).not.toMatch(
            /nuxt|nitro|express|fastify|vite/i,
        );
    });

    it("redirects every declared bot trap away from content", { timeout: 60_000 }, async () => {
        for (const trap of EXPECTED.botTraps) {
            const response = await probe(trap.url);
            expect([301, 302, 307, 308], `${trap.url} must redirect`).toContain(response.status);
            expect(response.headers.get("location"), `${trap.url} must redirect`).toBe(trap.location);
        }
    });

    it("refuses a scanning user agent", { timeout: 60_000 }, async () => {
        const response = await probe("/blogs", { headers: { "user-agent": "curl/8.7.1" } });
        expect(response.status).toBe(403);
    });

    it("enforces the request and upload size ceilings", { timeout: 60_000 }, async () => {
        const oversizedBody = await fetch(`${BASE}/api/contact`, {
            method: "POST",
            redirect: "manual",
            headers: { "user-agent": BROWSER_UA, "content-type": "application/json" },
            body: JSON.stringify({ message: "x".repeat(EXPECTED.bodyLimit + 1_000) }),
        });
        expect(oversizedBody.status).toBe(413);

        const form = new FormData();
        form.append("file", new Blob([new Uint8Array(EXPECTED.uploadLimit + 1_000)]), "big.png");
        const oversizedUpload = await fetch(`${BASE}/api/file/upload`, {
            method: "POST",
            redirect: "manual",
            headers: { "user-agent": BROWSER_UA },
            body: form,
        });
        expect(oversizedUpload.status).toBe(413);
    });

    it("carries the header policy on API routes, with the auth proxy as the one exception", { timeout: 60_000 }, async () => {
        // A normal Nitro API route (here the Resend webhook, which answers 401 to a
        // request with no Svix signature) is rendered by the app, so it gets the
        // headers even though it relaxes xssValidator/rateLimiter.
        const webhook = await fetch(`${BASE}/api/webhooks/resend`, {
            method: "POST",
            redirect: "manual",
            headers: { "user-agent": BROWSER_UA, "content-type": "application/json" },
            body: JSON.stringify({ type: "email.delivered" }),
        });
        expect(webhook.headers.get("content-security-policy")).toBeTruthy();
        expect(webhook.headers.get("strict-transport-security")).toContain(`max-age=${EXPECTED.hstsMaxAge}`);

        // `/api/auth/*` is a transparent proxy: it streams the upstream response, so
        // it bypasses the app's response-header phase entirely — measured, not
        // assumed. That is exactly why the plan's matrix gives this row to the edge
        // (Cloudflare rate limiting) plus Better Auth's own limiter, and why the
        // gate pins it: if the proxy ever starts emitting app headers, the "no
        // app-level protection here" premise of the auth row changes.
        const proxied = await fetch(`${BASE}/api/auth/creem/webhook`, {
            method: "POST",
            redirect: "manual",
            headers: { "user-agent": BROWSER_UA, "content-type": "application/json" },
            body: JSON.stringify({ type: "checkout.completed" }),
        });
        expect(proxied.headers.get("content-security-policy")).toBeNull();
    });
});
