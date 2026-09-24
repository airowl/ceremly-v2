import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
    PREFLIGHT_CHECK_IDS,
    parseGateLedger,
    readMarkedJson,
    readOnlyFetch,
    runPreflight,
    type PreflightDeps,
} from "../../scripts/migration/preflight";

/**
 * Task 17, Step 2 — the preflight is the last automated "no" before a human
 * says GO. Two properties matter more than any single check:
 *
 * - **fail closed**: every check that cannot *prove* its condition fails, and
 *   one failure is exit `1`;
 * - **no side effects**: it reads, it never writes. The deps it gets are read
 *   primitives only, the network goes through `readOnlyFetch`, and the test
 *   records every call to prove it.
 *
 * Hermetic: every dependency is a fixture; nothing leaves the process.
 */

const NOW = new Date("2026-10-01T10:00:00.000Z");
const HEAD = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0";
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const KEY = Buffer.alloc(32, 7).toString("base64");
const SITE = "https://ceremly.com";
const STAGING = "https://dev.ceremly.com";

function gatesMd(overrides: Record<string, string> = {}): string {
    const rows = Array.from({ length: 10 }, (_, i) => {
        const id = `G${String(i + 1).padStart(2, "0")}`;
        return `| ${id} | Name ${id} | ${overrides[id] ?? "PASS"} | \`cmd\` | evidence | — | — |`;
    });
    return [
        "# Migration Gates Ledger",
        "",
        "| Gate | Name | Status | Command | Evidence | Approved by | Approved at |",
        "|------|------|--------|---------|----------|-------------|-------------|",
        ...rows,
        "",
        "**Notes:** G04 was NOT_RUN once; prose must not confuse the parser. | G04 | x | FAIL |",
    ].join("\n");
}

function block(marker: string, value: unknown): string {
    return `Prose before.\n\n<!-- preflight:${marker} -->\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n\nProse after.\n`;
}

const goodRehearsal = { status: "PASS", completedAt: hoursAgo(3), commitSha: HEAD.slice(0, 12), convexDeployment: "dev:x" };

const goodEvidence = {
    environment: "production",
    siteOrigin: SITE,
    neonBackup: { projectId: "proj-1", branchId: "br-backup" },
    dns: { host: "ceremly.com", approvedTtlSeconds: 300, approvedBy: "ops", approvedAt: hoursAgo(2) },
    google: {
        productionOrigin: SITE,
        stagingOrigin: STAGING,
        redirectUris: [`${SITE}/api/auth/callback/google`, `${STAGING}/api/auth/callback/google`],
        verifiedBy: "ops",
        verifiedAt: hoursAgo(2),
    },
    costAlerts: { convex: true, cloudflare: true, resend: true, verifiedBy: "ops", verifiedAt: hoursAgo(2) },
    deployments: {
        convexProduction: "prod:happy-otter-123",
        workerVersion: "worker-version-1",
        legacyVercelDeployment: "dpl_legacy",
        legacyRollbackRef: "legacy-final",
    },
};

type Call = { url: string; method: string };

interface Fixture {
    gates?: string;
    rehearsal?: unknown;
    evidence?: unknown;
    env?: Record<string, string | undefined>;
    changedSince?: string[];
    neonBranch?: unknown;
    neonStatus?: number;
    qstashEvents?: unknown[];
    dlq?: unknown[];
    convexEnv?: Record<string, string>;
    ttls?: number[];
    corsXml?: string;
}

const goodCors = `<CORSConfiguration><CORSRule><AllowedOrigin>${SITE}</AllowedOrigin><AllowedMethod>GET</AllowedMethod><AllowedMethod>PUT</AllowedMethod></CORSRule></CORSConfiguration>`;

function makeDeps(fixture: Fixture = {}) {
    const calls: Call[] = [];
    const fileReads: string[] = [];
    const docs: Record<string, string> = {
        "docs/migration/gates.md": fixture.gates ?? gatesMd(),
        "docs/migration/rehearsal.md": block("rehearsal", fixture.rehearsal ?? goodRehearsal),
        "docs/migration/cutover.md": block("evidence", fixture.evidence ?? goodEvidence),
    };

    const rawFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        calls.push({ url, method: (init?.method ?? "GET").toUpperCase() });
        if (url.startsWith("https://console.neon.tech/")) {
            return new Response(
                JSON.stringify({
                    branch: fixture.neonBranch ?? { id: "br-backup", created_at: hoursAgo(5), default: false, parent_id: "br-main" },
                }),
                { status: fixture.neonStatus ?? 200 },
            );
        }
        if (url.includes("/v2/events")) {
            return new Response(JSON.stringify({ events: fixture.qstashEvents ?? [] }), { status: 200 });
        }
        if (url.includes("/v2/dlq")) {
            return new Response(JSON.stringify({ messages: fixture.dlq ?? [] }), { status: 200 });
        }
        return new Response("not found", { status: 404 });
    };

    const deps: PreflightDeps = {
        now: () => NOW,
        readText: (path) => {
            fileReads.push(path);
            const text = docs[path];
            if (text === undefined) throw new Error(`fixture: no ${path}`);
            return text;
        },
        gitHead: () => HEAD,
        changedFilesSince: () => fixture.changedSince ?? ["docs/migration/rehearsal.md", "graphify-out/graph.json"],
        env: {
            MIGRATION_ENCRYPTION_KEY: KEY,
            NEON_API_KEY: "neon-key",
            NUXT_QSTASH_TOKEN: "qstash-token",
            NUXT_BETTER_AUTH_SECRET: "same-secret",
            ...fixture.env,
        },
        fetch: readOnlyFetch(rawFetch as typeof fetch),
        resolveTtls: async () => fixture.ttls ?? [300, 120],
        convexEnv: async () =>
            fixture.convexEnv ?? {
                BETTER_AUTH_SECRET: "same-secret",
                CREEM_WEBHOOK_SECRET: "whsec_creem",
                RESEND_WEBHOOK_SECRET: "whsec_resend",
            },
        r2Cors: async () => fixture.corsXml ?? goodCors,
    };
    return { deps, calls, fileReads };
}

async function run(fixture: Fixture = {}) {
    const { deps, calls } = makeDeps(fixture);
    const result = await runPreflight({ environment: "production" }, deps);
    const failed = result.report.checks.filter((c) => c.status !== "PASS").map((c) => c.id);
    return { ...result, failed, calls };
}

describe("preflight: all green", () => {
    it("exits 0 when every check proves its condition, and covers every check id", async () => {
        const { exitCode, report, failed, calls } = await run();
        expect(failed).toEqual([]);
        expect(exitCode).toBe(0);
        expect(report.checks.map((c) => c.id).sort()).toEqual([...PREFLIGHT_CHECK_IDS].sort());
        expect(report.commitSha).toBe(HEAD);
        expect(report.deployments).toMatchObject({ convexProduction: "prod:happy-otter-123" });
        // Signed with a key derived from the migration key, so the pasted report
        // in the cutover log can be checked against the run that produced it.
        expect(report.signature).toMatch(/^hmac-sha256:[0-9a-f]{64}$/);
        // Read-only: every network call was a GET.
        expect(calls.length).toBeGreaterThan(0);
        expect(calls.every((c) => c.method === "GET")).toBe(true);
    });

    it("never echoes a secret into the report", async () => {
        const { report } = await run();
        const text = JSON.stringify(report);
        for (const secret of [KEY, "neon-key", "qstash-token", "same-secret", "whsec_creem", "whsec_resend"]) {
            expect(text).not.toContain(secret);
        }
    });
});

describe("preflight: each failing check is exit 1", () => {
    const cases: [string, Fixture, string][] = [
        ["a gate NOT_RUN", { gates: gatesMd({ G04: "NOT_RUN" }) }, "gates"],
        ["a gate missing", { gates: gatesMd().replace(/^\| G10 .*$/m, "") }, "gates"],
        ["a gate duplicated", { gates: gatesMd().replace(/^\| G09 /m, "| G08 ") }, "gates"],
        ["G10 not PASS also fails the cost check", { gates: gatesMd({ G10: "NOT_RUN" }) }, "costAlerts"],
        ["rehearsal NOT_RUN", { rehearsal: { ...goodRehearsal, status: "NOT_RUN" } }, "rehearsal"],
        ["rehearsal older than 24h", { rehearsal: { ...goodRehearsal, completedAt: hoursAgo(25) } }, "rehearsal"],
        ["rehearsal in the future", { rehearsal: { ...goodRehearsal, completedAt: hoursAgo(-1) } }, "rehearsal"],
        ["rehearsal on another commit (code changed since)", { changedSince: ["server/middleware/0.site-mode.ts"] }, "rehearsal"],
        ["rehearsal commit unknown", { rehearsal: { ...goodRehearsal, commitSha: null } }, "rehearsal"],
        ["rehearsal block missing", { rehearsal: "not-an-object" }, "rehearsal"],
        ["Neon backup older than 24h", { neonBranch: { id: "br-backup", created_at: hoursAgo(30), default: false, parent_id: "br-main" } }, "neonBackup"],
        ["Neon backup is the default branch", { neonBranch: { id: "br-backup", created_at: hoursAgo(1), default: true, parent_id: null } }, "neonBackup"],
        ["Neon API refuses", { neonStatus: 404 }, "neonBackup"],
        ["no Neon API key", { env: { NEON_API_KEY: undefined } }, "neonBackup"],
        ["export key missing", { env: { MIGRATION_ENCRYPTION_KEY: undefined } }, "exportKey"],
        ["export key is the hex passphrase gotcha", { env: { MIGRATION_ENCRYPTION_KEY: "ab".repeat(32) } }, "exportKey"],
        [
            "a legacy job still in flight",
            {
                qstashEvents: [
                    { messageId: "m1", state: "DELIVERED", time: NOW.getTime() - 60_000, url: `${SITE}/api/jobs/send-invite-email` },
                    { messageId: "m2", state: "RETRY", time: NOW.getTime() - 30_000, url: `${SITE}/api/jobs/process-image-variants` },
                ],
            },
            "legacyJobs",
        ],
        ["a legacy job in the DLQ", { dlq: [{ messageId: "d1", url: `${SITE}/api/jobs/x` }] }, "legacyJobs"],
        ["no QStash token", { env: { NUXT_QSTASH_TOKEN: undefined } }, "legacyJobs"],
        ["Creem webhook secret not set on Convex", { convexEnv: { BETTER_AUTH_SECRET: "same-secret", RESEND_WEBHOOK_SECRET: "x" } }, "webhookSecrets"],
        [
            "BETTER_AUTH_SECRET differs between Convex and the Worker",
            { convexEnv: { BETTER_AUTH_SECRET: "other", CREEM_WEBHOOK_SECRET: "x", RESEND_WEBHOOK_SECRET: "y" } },
            "authSecretParity",
        ],
        ["DNS TTL above the approved value", { ttls: [3600] }, "dnsTtl"],
        ["DNS TTL not approved", { evidence: { ...goodEvidence, dns: { ...goodEvidence.dns, approvedBy: null } } }, "dnsTtl"],
        [
            "Google production callback missing",
            { evidence: { ...goodEvidence, google: { ...goodEvidence.google, redirectUris: [`${STAGING}/api/auth/callback/google`] } } },
            "googleCallbacks",
        ],
        [
            "cost alerts not attested",
            { evidence: { ...goodEvidence, costAlerts: { ...goodEvidence.costAlerts, cloudflare: false } } },
            "costAlerts",
        ],
        ["R2 CORS does not allow PUT from the site", { corsXml: goodCors.replace("<AllowedMethod>PUT</AllowedMethod>", "") }, "r2Cors"],
        ["R2 CORS for another origin", { corsXml: goodCors.replace(SITE, "https://other.example") }, "r2Cors"],
        [
            "deployment ids missing",
            { evidence: { ...goodEvidence, deployments: { ...goodEvidence.deployments, legacyRollbackRef: "" } } },
            "deploymentIds",
        ],
        ["evidence for another environment", { evidence: { ...goodEvidence, environment: "staging" } }, "deploymentIds"],
    ];

    for (const [name, fixture, check] of cases) {
        it(name, async () => {
            const { exitCode, failed, calls } = await run(fixture);
            expect(exitCode).toBe(1);
            expect(failed).toContain(check);
            // Still read-only on the failure path.
            expect(calls.every((c) => c.method === "GET")).toBe(true);
        });
    }

    it("a dependency that throws is a FAIL, not a crash", async () => {
        const { deps } = makeDeps();
        deps.convexEnv = async () => {
            throw new Error("convex CLI not logged in");
        };
        const { exitCode, report } = await runPreflight({ environment: "production" }, deps);
        expect(exitCode).toBe(1);
        expect(report.checks.find((c) => c.id === "webhookSecrets")?.status).toBe("FAIL");
    });
});

describe("preflight: read-only by construction", () => {
    it("readOnlyFetch refuses every write method before it reaches the network", async () => {
        const seen: string[] = [];
        const guarded = readOnlyFetch((async (url: string) => {
            seen.push(url);
            return new Response("ok");
        }) as unknown as typeof fetch);
        for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
            await expect(guarded("https://example.test/x", { method })).rejects.toThrow(/read-only/i);
        }
        await expect(guarded(new Request("https://example.test/y", { method: "POST" }))).rejects.toThrow(/read-only/i);
        expect(seen).toEqual([]);
        await guarded("https://example.test/z");
        expect(seen).toEqual(["https://example.test/z"]);
    });

    it("the module has no write primitive in its source", () => {
        const source = readFileSync("scripts/migration/preflight.ts", "utf8");
        expect(source).not.toMatch(/writeFile|appendFile|mkdir|rmSync|unlink|createWriteStream/);
        // The only subprocesses are read commands: `git rev-parse`, `git diff --name-only`, `convex env list`.
        const execCalls = source.match(/execFileSync\([^)]*\)/g) ?? [];
        for (const call of execCalls) {
            expect(call).toMatch(/"git"|"npx"/);
        }
        expect(source).not.toMatch(/"env",\s*"set"|"env",\s*"remove"|"deploy"|"import"/);
    });

    it("the current repository state fails honestly (G04/G10 NOT_RUN, rehearsal not completed)", async () => {
        const { deps } = makeDeps();
        deps.readText = (path) => readFileSync(path, "utf8");
        const { exitCode, report } = await runPreflight({ environment: "production" }, deps);
        expect(exitCode).toBe(1);
        const byId = Object.fromEntries(report.checks.map((c) => [c.id, c]));
        expect(byId.gates?.status).toBe("FAIL");
        expect(byId.gates?.detail).toMatch(/G04.*NOT_RUN/);
        expect(byId.gates?.detail).toMatch(/G10.*NOT_RUN/);
        expect(byId.rehearsal?.status).toBe("FAIL");
    });
});

describe("preflight: --only", () => {
    it("runs a subset and marks the report partial", async () => {
        const { deps } = makeDeps();
        const { exitCode, report } = await runPreflight({ environment: "production", only: ["legacyJobs"] }, deps);
        expect(exitCode).toBe(0);
        expect(report.checks.map((c) => c.id)).toEqual(["legacyJobs"]);
        expect(report.partial).toEqual(["legacyJobs"]);
        const full = await runPreflight({ environment: "production" }, makeDeps().deps);
        expect(full.report.partial).toBeNull();
    });
});

describe("preflight: parsers", () => {
    it("parses the gate table and ignores prose", () => {
        const gates = parseGateLedger(gatesMd({ G04: "NOT_RUN" }));
        expect(gates).toHaveLength(10);
        expect(gates.find((g) => g.id === "G04")?.status).toBe("NOT_RUN");
    });

    it("reads the JSON block after its marker, and refuses a missing or malformed one", () => {
        expect(readMarkedJson(block("rehearsal", { a: 1 }), "rehearsal")).toEqual({ a: 1 });
        expect(() => readMarkedJson("no block here", "rehearsal")).toThrow(/preflight:rehearsal/);
        expect(() => readMarkedJson("<!-- preflight:rehearsal -->\n```json\n{oops\n```", "rehearsal")).toThrow();
    });
});
