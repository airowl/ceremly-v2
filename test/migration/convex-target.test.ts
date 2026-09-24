import { describe, expect, it } from "vitest";

import {
    authorizeTarget,
    createTarget,
    resolveProductionTarget,
    resolveTargetSelection,
    type ProductionGate,
    type TargetSelection,
} from "../../scripts/migration/convex-target";
import { signPreflightReport, type PreflightReport } from "../../scripts/migration/preflight";

/**
 * Task 16 fix round 1 (critical): the migration can only ever reach the dev
 * deployment named in `.env.local`, whatever else the environment says, and
 * records never travel on a command line.
 */

const ENV_LOCAL = "CONVEX_DEPLOYMENT=dev:wary-spaniel-466 # team: airowl, project: ceremly-staging\n";
const selection: TargetSelection = { deployment: "dev:wary-spaniel-466", deploymentName: "wary-spaniel-466" };

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("resolveTargetSelection", () => {
    it("accepts the dev deployment of .env.local", () => {
        expect(resolveTargetSelection(ENV_LOCAL, {})).toEqual(selection);
        expect(resolveTargetSelection(ENV_LOCAL, { CONVEX_DEPLOYMENT: "dev:wary-spaniel-466" })).toEqual(selection);
    });

    it("refuses a production or missing selection", () => {
        expect(() => resolveTargetSelection("CONVEX_DEPLOYMENT=prod:happy-otter-1\n", {})).toThrow(/dev \(staging\)/);
        expect(() => resolveTargetSelection(null, {})).toThrow(/not set/);
    });

    it("refuses an environment that selects another deployment", () => {
        expect(() => resolveTargetSelection(ENV_LOCAL, { CONVEX_DEPLOYMENT: "prod:happy-otter-1" })).toThrow(/Conflicting/);
        for (const name of ["CONVEX_DEPLOY_KEY", "CONVEX_SELF_HOSTED_URL", "CONVEX_SELF_HOSTED_ADMIN_KEY", "CONVEX_OVERRIDE_ACCESS_TOKEN", "CONVEX_PROVISION_HOST"]) {
            expect(() => resolveTargetSelection(ENV_LOCAL, { [name]: "prod:happy-otter-1|secret" }), name).toThrow(name);
        }
    });
});

describe("authorizeTarget", () => {
    const authorizeWith = (body: unknown, env: NodeJS.ProcessEnv = {}) =>
        authorizeTarget(selection, {
            env,
            accessToken: () => "token",
            fetch: async () => jsonResponse(body),
        });

    const good = {
        deploymentName: "wary-spaniel-466",
        deploymentType: "dev",
        url: "https://wary-spaniel-466.eu-west-1.convex.cloud",
        adminKey: "admin-key",
    };

    it("returns credentials only for the named dev deployment", async () => {
        await expect(authorizeWith(good)).resolves.toMatchObject({ url: good.url, adminKey: "admin-key" });
    });

    it("refuses credentials for another deployment, a prod type or a foreign host", async () => {
        await expect(authorizeWith({ ...good, deploymentName: "happy-otter-1" })).rejects.toThrow(/is not wary-spaniel-466/);
        await expect(authorizeWith({ ...good, deploymentType: "prod" })).rejects.toThrow(/dev only/);
        await expect(authorizeWith({ ...good, url: "https://happy-otter-1.eu-west-1.convex.cloud" })).rejects.toThrow(/does not belong/);
    });

    it("accepts an explicit staging key and refuses a production deploy key", async () => {
        const env = { MIGRATION_CONVEX_URL: good.url };
        await expect(authorizeWith(good, { ...env, MIGRATION_CONVEX_ADMIN_KEY: "dev:wary-spaniel-466|abc" })).resolves.toMatchObject({ url: good.url });
        await expect(authorizeWith(good, { ...env, MIGRATION_CONVEX_ADMIN_KEY: "prod:happy-otter-1|abc" })).rejects.toThrow(/does not belong/);
        await expect(
            authorizeWith(good, { MIGRATION_CONVEX_URL: "https://happy-otter-1.eu-west-1.convex.cloud", MIGRATION_CONVEX_ADMIN_KEY: "k" }),
        ).rejects.toThrow(/does not belong/);
    });
});

describe("createTarget", () => {
    const credentials = { deploymentName: "wary-spaniel-466", url: "https://wary-spaniel-466.eu-west-1.convex.cloud", adminKey: "admin-key" };

    it("sends the records in the HTTPS body with admin auth, to the verified URL", async () => {
        const calls: Array<{ url: string; init?: RequestInit }> = [];
        const target = createTarget(selection, credentials, async (url, init) => {
            calls.push({ url, init });
            return jsonResponse({ status: "success", value: { imported: 1 } });
        });

        const result = await target.run<{ imported: number }>("migrations/authImport:importBatch", {
            users: [{ id: "u1", password: "$scrypt$hash" }],
        });

        expect(result).toEqual({ imported: 1 });
        expect(calls[0]!.url).toBe(`${credentials.url}/api/function`);
        expect((calls[0]!.init!.headers as Record<string, string>).Authorization).toBe("Convex admin-key");
        expect(JSON.parse(String(calls[0]!.init!.body))).toMatchObject({ path: "migrations/authImport:importBatch" });
    });

    it("reduces a failure to its code, never the server's message", async () => {
        const target = createTarget(selection, credentials, async () =>
            jsonResponse({ status: "error", errorMessage: "user a@example.com not found", errorData: { code: "AUTH_USER_NOT_IMPORTED", email: "a@example.com" } }),
        );

        const error = (await target.run("x:y", {}).catch((caught: unknown) => caught)) as Error;
        expect(error.message).toBe("x:y failed: AUTH_USER_NOT_IMPORTED");
        expect(error.message).not.toContain("example.com");
    });
});

// ---------------------------------------------------------------------------
// Task 17 fix round 1: the guarded production mode.
// ---------------------------------------------------------------------------


describe("resolveProductionTarget (never a default, every refusal path)", () => {
    const KEY = Buffer.alloc(32, 9).toString("base64");
    const HEAD = "0123456789abcdef0123456789abcdef01234567";
    const NOW = new Date("2026-10-01T10:00:00.000Z");
    const PROD = "prod:happy-otter-123";

    const report = (overrides: Partial<Omit<PreflightReport, "signature">> = {}, key = KEY): PreflightReport => {
        const unsigned = {
            environment: "production" as const,
            partial: null,
            generatedAt: new Date(NOW.getTime() - 3_600_000).toISOString(),
            commitSha: HEAD,
            deployments: { convexProduction: PROD, workerVersion: "w", legacyVercelDeployment: "d", legacyRollbackRef: "r" },
            verdict: "PASS" as const,
            checks: [],
            ...overrides,
        };
        return { ...unsigned, signature: signPreflightReport(unsigned, key) };
    };

    const gate = (over: { argv?: string[]; env?: NodeJS.ProcessEnv; report?: unknown; head?: string } = {}): ProductionGate => ({
        argv: over.argv ?? ["--production", "--confirm-deployment", PROD, "--preflight-report", "pf.json"],
        env: over.env ?? {
            MIGRATION_ENCRYPTION_KEY: KEY,
            MIGRATION_CONVEX_ADMIN_KEY: `${PROD}|secret`,
            MIGRATION_CONVEX_URL: "https://happy-otter-123.eu-west-1.convex.cloud",
        },
        headSha: over.head ?? HEAD,
        readText: () => JSON.stringify("report" in over ? over.report : report()),
        now: () => NOW,
    });

    it("resolves the production deployment when every condition holds", () => {
        const { selection, credentials } = resolveProductionTarget(gate());
        expect(selection).toEqual({ deployment: PROD, deploymentName: "happy-otter-123" });
        expect(credentials.url).toBe("https://happy-otter-123.eu-west-1.convex.cloud");
    });

    const refusals: [string, Parameters<typeof gate>[0], RegExp][] = [
        ["without --production", { argv: ["--confirm-deployment", PROD, "--preflight-report", "pf.json"] }, /--production/],
        ["without a typed confirmation", { argv: ["--production", "--preflight-report", "pf.json"] }, /--confirm-deployment/],
        ["with a confirmation that differs", { argv: ["--production", "--confirm-deployment", "prod:other-name-1", "--preflight-report", "pf.json"] }, /does not match/],
        ["without a preflight report", { argv: ["--production", "--confirm-deployment", PROD] }, /--preflight-report/],
        ["with an unreadable report", { report: "not json at all" }, /preflight report/i],
        ["with an unsigned report", { report: { ...report(), signature: "unsigned" } }, /signature/],
        ["with a report signed by another key", { report: report({}, Buffer.alloc(32, 1).toString("base64")) }, /signature/],
        ["with a tampered report", { report: { ...report(), verdict: "FAIL" } }, /signature/],
        ["with a FAIL verdict", { report: report({ verdict: "FAIL" }) }, /verdict/],
        ["with a partial report", { report: report({ partial: ["legacyJobs"] }) }, /partial/],
        ["with a staging report", { report: report({ environment: "staging" }) }, /production/],
        ["for another commit", { head: "f".repeat(40) }, /commit/],
        ["with a stale report", { report: report({ generatedAt: new Date(NOW.getTime() - 25 * 3_600_000).toISOString() }) }, /24 h/],
        ["with a report from the future", { report: report({ generatedAt: new Date(NOW.getTime() + 60_000).toISOString() }) }, /future/],
        ["when the report names a non-prod deployment", { report: report({ deployments: { convexProduction: "dev:wary-spaniel-466" } }), argv: ["--production", "--confirm-deployment", "dev:wary-spaniel-466", "--preflight-report", "pf.json"] }, /prod:/],
        ["with a conflicting env selector", { env: { MIGRATION_ENCRYPTION_KEY: KEY, CONVEX_DEPLOY_KEY: "prod:x|y", MIGRATION_CONVEX_ADMIN_KEY: `${PROD}|s`, MIGRATION_CONVEX_URL: "https://happy-otter-123.eu-west-1.convex.cloud" } }, /CONVEX_DEPLOY_KEY/],
        ["with CONVEX_DEPLOYMENT pointing elsewhere", { env: { MIGRATION_ENCRYPTION_KEY: KEY, CONVEX_DEPLOYMENT: "dev:wary-spaniel-466", MIGRATION_CONVEX_ADMIN_KEY: `${PROD}|s`, MIGRATION_CONVEX_URL: "https://happy-otter-123.eu-west-1.convex.cloud" } }, /Conflicting/],
        ["without an explicit admin key (no CLI-login fallback)", { env: { MIGRATION_ENCRYPTION_KEY: KEY, MIGRATION_CONVEX_URL: "https://happy-otter-123.eu-west-1.convex.cloud" } }, /MIGRATION_CONVEX_ADMIN_KEY/],
        ["with an admin key of another deployment", { env: { MIGRATION_ENCRYPTION_KEY: KEY, MIGRATION_CONVEX_ADMIN_KEY: "prod:other-name-1|s", MIGRATION_CONVEX_URL: "https://happy-otter-123.eu-west-1.convex.cloud" } }, /does not belong/],
        ["with a URL of another deployment", { env: { MIGRATION_ENCRYPTION_KEY: KEY, MIGRATION_CONVEX_ADMIN_KEY: `${PROD}|s`, MIGRATION_CONVEX_URL: "https://wary-spaniel-466.eu-west-1.convex.cloud" } }, /does not belong/],
    ];

    for (const [name, over, message] of refusals) {
        it(`refuses ${name}`, () => {
            expect(() => resolveProductionTarget(gate(over))).toThrow(message);
        });
    }

    it("the staging path is unchanged and still refuses prod without the gate", () => {
        expect(() => resolveTargetSelection("CONVEX_DEPLOYMENT=prod:happy-otter-123\n", {})).toThrow(/dev \(staging\)/);
    });
});
