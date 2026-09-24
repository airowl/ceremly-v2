import { describe, expect, it } from "vitest";

import {
    authorizeTarget,
    createTarget,
    resolveTargetSelection,
    type TargetSelection,
} from "../../scripts/migration/convex-target";

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
