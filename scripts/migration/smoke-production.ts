import { pathToFileURL } from "node:url";

/**
 * Migration Task 17 — production smoke test for the cutover (run in Task 18).
 *
 *   pnpm tsx scripts/migration/smoke-production.ts --read-only \
 *     --base-url https://ceremly.com \
 *     --convex-url https://<prod>.convex.cloud --convex-site-url https://<prod>.convex.site
 *
 *   pnpm tsx scripts/migration/smoke-production.ts --write-canary …   # only AFTER Convex writes are enabled
 *
 * `--read-only` runs between the DNS switch and "enable Convex writes", i.e.
 * *before* the point of no return, so it must be unable to write. That is
 * enforced by construction, not by care: every request goes through
 * `smokeFetchGuard`, which in read-only mode lets through GET/HEAD and exactly
 * one POST shape — Convex's `/api/query` endpoint, which runs a query and
 * cannot write. A mutation, an action or any other POST is refused before it
 * leaves the process (pinned by `test/migration/smoke-production.test.ts`).
 *
 * `--write-canary` sends one RSVP to a canary invitation the operator created
 * for the purpose (`SMOKE_CANARY_INVITE_TOKEN`). It is the first deliberate
 * write of the new stack and belongs after the "abilita scritture Convex" step.
 *
 * Output: a JSON report on stdout (no secrets: the canary token is not echoed),
 * exit `0` only when every check passes.
 */

export type SmokeMode = "read-only" | "write-canary";

export interface SmokeOptions {
    mode: SmokeMode;
    baseUrl: string;
    convexUrl: string;
    convexSiteUrl: string;
    /** The site mode the new stack must report (read-only phase: `maintenance-readonly`). */
    expectSiteMode: string;
}

export interface SmokeDeps {
    fetch: typeof fetch;
    env: Record<string, string | undefined>;
}

export interface SmokeCheck {
    id: string;
    status: "PASS" | "FAIL";
    detail: string;
}

export interface SmokeReport {
    mode: SmokeMode;
    baseUrl: string;
    verdict: "PASS" | "FAIL";
    checks: SmokeCheck[];
}

/**
 * The only fetch the smoke run uses. Read-only mode: GET/HEAD, plus POST to
 * `${convexUrl}/api/query`. Write-canary mode: unrestricted.
 */
export function smokeFetchGuard(mode: SmokeMode, convexUrl: string, inner: typeof fetch): typeof fetch {
    const queryEndpoint = `${convexUrl.replace(/\/+$/, "")}/api/query`;
    return (async (input: string | URL | Request, init?: RequestInit) => {
        if (mode === "read-only") {
            const url = input instanceof Request ? input.url : String(input);
            const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
            const isRead = method === "GET" || method === "HEAD";
            const isQuery = method === "POST" && url === queryEndpoint;
            if (!isRead && !isQuery) throw new Error(`smoke is read-only: refused ${method} ${url}`);
        }
        return inner(input, init);
    }) as typeof fetch;
}

/** The `<meta http-equiv="Content-Security-Policy">` of a page, or "". */
export function metaCsp(html: string): string {
    const tag = /<meta[^>]+http-equiv=["']content-security-policy["'][^>]*>/i.exec(html)?.[0];
    if (!tag) return "";
    return (/content=["']([^"']*)["']/i.exec(tag)?.[1] ?? "").replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");
}

type Check = () => Promise<Omit<SmokeCheck, "id">>;
const pass = (detail: string) => ({ status: "PASS" as const, detail });
const fail = (detail: string) => ({ status: "FAIL" as const, detail });

export async function runSmoke(options: SmokeOptions, deps: SmokeDeps): Promise<{ exitCode: 0 | 1; report: SmokeReport }> {
    const base = options.baseUrl.replace(/\/+$/, "");
    const convexUrl = options.convexUrl.replace(/\/+$/, "");
    const convexSite = options.convexSiteUrl.replace(/\/+$/, "");
    const http = smokeFetchGuard(options.mode, convexUrl, deps.fetch);
    const convexOrigin = new URL(convexUrl).origin;

    const checks: [string, Check][] = [
        [
            "home",
            async () => {
                const response = await http(`${base}/`, { method: "GET", redirect: "manual" });
                if (response.status !== 200) return fail(`GET / → ${response.status}`);
                const hsts = response.headers.get("strict-transport-security") ?? "";
                if (!/max-age=\d+/.test(hsts)) return fail("GET / has no HSTS");
                // The Convex origin is baked into the CSP at build time: a build made
                // for another deployment would load and then fail every Convex call.
                // Prerendered pages come from the Workers Assets layer and carry the
                // CSP as `<meta http-equiv>` (see `public/_headers`); SSR as a header.
                const csp = response.headers.get("content-security-policy") ?? metaCsp(await response.text());
                const connect = /connect-src([^;]*)/.exec(csp)?.[1] ?? "";
                if (!connect.split(/\s+/).includes(convexOrigin)) {
                    return fail(`CSP connect-src does not allow ${convexOrigin} (rebuild with the right NUXT_PUBLIC_CONVEX_URL)`);
                }
                return pass(`GET / 200, HSTS, CSP allows ${convexOrigin}`);
            },
        ],
        [
            "login",
            async () => {
                const response = await http(`${base}/login`, { method: "GET", redirect: "manual" });
                return response.status === 200 ? pass("GET /login 200") : fail(`GET /login → ${response.status}`);
            },
        ],
        [
            "authSession",
            async () => {
                // Anonymous session read through the same-origin auth proxy.
                const response = await http(`${base}/api/auth/get-session`, { method: "GET" });
                return response.status === 200
                    ? pass("GET /api/auth/get-session 200")
                    : fail(`GET /api/auth/get-session → ${response.status}`);
            },
        ],
        [
            "convexSiteMode",
            async () => {
                const response = await http(`${convexSite}/public/site-mode`, { method: "GET" });
                if (!response.ok) return fail(`GET ${convexSite}/public/site-mode → ${response.status}`);
                const { mode } = (await response.json()) as { mode?: string };
                return mode === options.expectSiteMode
                    ? pass(`Convex site mode ${mode}`)
                    : fail(`Convex site mode ${String(mode)}, expected ${options.expectSiteMode}`);
            },
        ],
        [
            "convexQuery",
            async () => {
                const response = await http(`${convexUrl}/api/query`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ path: "siteSettings:getPublic", args: {}, format: "json" }),
                });
                if (!response.ok) return fail(`Convex query HTTP ${response.status}`);
                const body = (await response.json()) as { status?: string; value?: { mode?: string } };
                return body.status === "success" && body.value?.mode === options.expectSiteMode
                    ? pass("Convex HTTP query siteSettings:getPublic answers")
                    : fail(`Convex query status=${String(body.status)} mode=${String(body.value?.mode)}`);
            },
        ],
    ];

    if (options.mode === "write-canary") {
        checks.push([
            "rsvpCanary",
            async () => {
                const token = deps.env.SMOKE_CANARY_INVITE_TOKEN;
                if (!token) return fail("SMOKE_CANARY_INVITE_TOKEN not set: no canary invitation to write to");
                const response = await http(`${base}/api/public/invite/${encodeURIComponent(token)}/rsvp`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ attending: "yes", companionsCount: 0, answers: {}, declineMessage: null }),
                });
                return response.ok ? pass("RSVP canary accepted") : fail(`RSVP canary → ${response.status}`);
            },
        ]);
    }

    const results: SmokeCheck[] = [];
    for (const [id, check] of checks) {
        try {
            results.push({ id, ...(await check()) });
        } catch (error) {
            results.push({ id, status: "FAIL", detail: `check could not run: ${(error as Error).message}` });
        }
    }

    const verdict = results.every((c) => c.status === "PASS") ? "PASS" : "FAIL";
    return {
        exitCode: verdict === "PASS" ? 0 : 1,
        report: { mode: options.mode, baseUrl: base, verdict, checks: results },
    };
}

function parseArgs(argv: string[]): SmokeOptions {
    const value = (flag: string) => {
        const at = argv.indexOf(flag);
        return at === -1 ? undefined : argv[at + 1];
    };
    const readOnly = argv.includes("--read-only");
    const canary = argv.includes("--write-canary");
    if (readOnly === canary) throw new Error("exactly one of --read-only / --write-canary");
    const baseUrl = value("--base-url");
    const convexUrl = value("--convex-url");
    const convexSiteUrl = value("--convex-site-url");
    if (!baseUrl || !convexUrl || !convexSiteUrl) {
        throw new Error("usage: smoke-production.ts --read-only|--write-canary --base-url … --convex-url … --convex-site-url …");
    }
    return {
        mode: readOnly ? "read-only" : "write-canary",
        baseUrl,
        convexUrl,
        convexSiteUrl,
        expectSiteMode: value("--expect-site-mode") ?? (readOnly ? "maintenance-readonly" : "active"),
    };
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));
    const { exitCode, report } = await runSmoke(options, { fetch: globalThis.fetch, env: process.env });
    console.log(JSON.stringify(report, null, 2));
    process.exit(exitCode);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error: unknown) => {
        console.error(`[smoke] ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    });
}
