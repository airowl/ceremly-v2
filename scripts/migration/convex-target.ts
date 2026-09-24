import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { convexToJson, jsonToConvex, type Value } from "convex/values";

import { verifyPreflightReport } from "./preflight";

/**
 * The one door from the migration scripts to the target deployment (Task 16).
 *
 * Fix round 1 replaced the `convex run` child process with a direct HTTPS call,
 * for two reasons found in review:
 *
 * - **Target selection.** A child process inherits `process.env`, so an
 *   exported `CONVEX_DEPLOYMENT` or `CONVEX_DEPLOY_KEY` could point the CLI at
 *   production after the script had validated `.env.local`. Here there is no
 *   child and no implicit selection: the deployment is named once
 *   (`.env.local`), every conflicting source in the environment is refused, and
 *   the credentials returned for that name are checked (`dev`, same name, same
 *   host) before the first call.
 * - **No plaintext in argv.** Records (password hashes, 2FA secrets, tokens)
 *   travel in the TLS request body, never on a command line `ps` can read.
 *
 * Admin credentials come from `MIGRATION_CONVEX_ADMIN_KEY` + `MIGRATION_CONVEX_URL`
 * when set (a staging deploy key), otherwise from the Convex CLI login
 * (`~/.convex/config.json`), authorized for exactly the named deployment.
 * Output of a failed call is reduced to its `ConvexError` code: the server's
 * message can echo record data and is never printed.
 */

/** Environment variables that select a deployment behind the script's back. */
export const CONFLICTING_ENV = [
    "CONVEX_DEPLOY_KEY",
    "CONVEX_SELF_HOSTED_URL",
    "CONVEX_SELF_HOSTED_ADMIN_KEY",
    "CONVEX_OVERRIDE_ACCESS_TOKEN",
    "CONVEX_PROVISION_HOST",
] as const;

export interface TargetSelection {
    deployment: string;
    deploymentName: string;
}

/**
 * Resolves the target from `.env.local`, refusing anything but a dev
 * deployment and any environment variable that could select another one.
 */
export function resolveTargetSelection(envLocal: string | null, env: NodeJS.ProcessEnv): TargetSelection {
    const fromFile = envLocal ? /^CONVEX_DEPLOYMENT=([^\s#]+)/m.exec(envLocal)?.[1] : undefined;
    if (!fromFile) throw new Error("CONVEX_DEPLOYMENT is not set in .env.local");

    const match = /^dev:([a-z]+-[a-z]+-\d+)$/.exec(fromFile);
    if (!match) {
        throw new Error(`Refusing CONVEX_DEPLOYMENT=${fromFile}: Task 16 targets a dev (staging) deployment only`);
    }

    if (env.CONVEX_DEPLOYMENT !== undefined && env.CONVEX_DEPLOYMENT !== fromFile) {
        throw new Error(
            `Conflicting deployment selection: CONVEX_DEPLOYMENT=${env.CONVEX_DEPLOYMENT} in the environment, ${fromFile} in .env.local`,
        );
    }
    for (const name of CONFLICTING_ENV) {
        if (env[name]) throw new Error(`Refusing to run with ${name} set: it selects a deployment outside .env.local`);
    }

    return { deployment: fromFile, deploymentName: match[1]! };
}

export interface TargetCredentials {
    deploymentName: string;
    url: string;
    adminKey: string;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** `https://<name>.<region>.convex.cloud` exactly — nothing else is accepted. */
export function assertDeploymentUrl(url: string, deploymentName: string): void {
    let host: string;
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:") throw new Error("not https");
        host = parsed.hostname;
    } catch {
        throw new Error("Deployment URL is not a valid https URL");
    }
    if (!host.startsWith(`${deploymentName}.`) || !host.endsWith(".convex.cloud")) {
        throw new Error(`Deployment URL ${host} does not belong to ${deploymentName}`);
    }
}

/** Admin credentials for exactly `selection`, verified before use. */
export async function authorizeTarget(
    selection: TargetSelection,
    options: { env: NodeJS.ProcessEnv; fetch: FetchLike; accessToken: () => string | null },
): Promise<TargetCredentials> {
    const explicitKey = options.env.MIGRATION_CONVEX_ADMIN_KEY;
    if (explicitKey) {
        const url = options.env.MIGRATION_CONVEX_URL ?? "";
        assertDeploymentUrl(url, selection.deploymentName);
        // A deploy key names its deployment (`dev:<name>|…`): a prod key is refused.
        if (explicitKey.includes("|") && !explicitKey.startsWith(`dev:${selection.deploymentName}|`)) {
            throw new Error("MIGRATION_CONVEX_ADMIN_KEY does not belong to the selected dev deployment");
        }
        return { deploymentName: selection.deploymentName, url, adminKey: explicitKey };
    }

    const token = options.accessToken();
    if (!token) throw new Error("No Convex login (~/.convex/config.json) and no MIGRATION_CONVEX_ADMIN_KEY");

    const response = await options.fetch("https://api.convex.dev/api/deployment/authorize_within_current_project", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Convex-Client": "npm-cli-1.45.0" },
        body: JSON.stringify({
            selectedDeploymentName: selection.deploymentName,
            projectSelection: { kind: "deploymentName", deploymentName: selection.deploymentName, deploymentType: null },
        }),
    });
    if (!response.ok) throw new Error(`Convex refused to authorize ${selection.deploymentName} (HTTP ${response.status})`);

    const body = (await response.json()) as {
        deploymentName?: string;
        deploymentType?: string;
        url?: string;
        adminKey?: string;
    };
    if (body.deploymentName !== selection.deploymentName) {
        throw new Error(`Authorized deployment ${String(body.deploymentName)} is not ${selection.deploymentName}`);
    }
    if (body.deploymentType !== "dev") {
        throw new Error(`Refusing deployment type ${String(body.deploymentType)}: dev only`);
    }
    if (!body.adminKey) throw new Error("Convex returned no admin key");
    assertDeploymentUrl(body.url ?? "", selection.deploymentName);

    return { deploymentName: selection.deploymentName, url: body.url!, adminKey: body.adminKey };
}

export class ConvexRunError extends Error {
    constructor(
        readonly functionName: string,
        readonly code: string,
    ) {
        super(`${functionName} failed: ${code}`);
    }
}

/** `ConvexError` code of a failed call; a bare message is reduced to a class. */
export function errorCodeOf(errorData: unknown, errorMessage: string): string {
    const code = (errorData as { code?: unknown } | null | undefined)?.code;
    if (typeof code === "string" && /^[A-Z0-9_]+$/.test(code)) return code;
    if (/ArgumentValidationError/.test(errorMessage)) return "ARGUMENT_VALIDATION_ERROR";
    if (/Could not find (public )?function/.test(errorMessage)) return "FUNCTION_NOT_FOUND";
    return "UNKNOWN_ERROR";
}

export interface ConvexTarget {
    deployment: string;
    deploymentName: string;
    run<T>(functionName: string, args: Record<string, unknown>): Promise<T>;
    readAllPages<T>(functionName: string, args: Record<string, unknown>, numItems?: number): Promise<T[]>;
}

/** HTTP client over `/api/function` with admin auth (the endpoint `convex run` uses). */
export function createTarget(selection: TargetSelection, credentials: TargetCredentials, fetchImpl: FetchLike): ConvexTarget {
    const run = async <T>(functionName: string, args: Record<string, unknown>): Promise<T> => {
        const response = await fetchImpl(`${credentials.url}/api/function`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Convex ${credentials.adminKey}`,
                "Convex-Client": "npm-1.45.0",
            },
            body: JSON.stringify({
                path: functionName,
                format: "convex_encoded_json",
                args: convexToJson(args as Value),
            }),
        });
        const body = (await response.json().catch(() => null)) as
            | { status: "success"; value: unknown }
            | { status: "error"; errorMessage?: string; errorData?: unknown }
            | null;

        if (body?.status === "success") return jsonToConvex(body.value as never) as T;
        if (body?.status === "error") {
            throw new ConvexRunError(functionName, errorCodeOf(body.errorData, body.errorMessage ?? ""));
        }
        throw new ConvexRunError(functionName, `HTTP_${response.status}`);
    };

    const readAllPages = async <T>(functionName: string, args: Record<string, unknown>, numItems = 500): Promise<T[]> => {
        const rows: T[] = [];
        let cursor: string | null = null;
        for (;;) {
            const page: { page: T[]; isDone: boolean; continueCursor: string } = await run(functionName, {
                ...args,
                cursor,
                numItems,
            });
            rows.push(...page.page);
            if (page.isDone) return rows;
            cursor = page.continueCursor;
        }
    };

    return { deployment: selection.deployment, deploymentName: selection.deploymentName, run, readAllPages };
}

function readCliAccessToken(): string | null {
    try {
        const config = JSON.parse(readFileSync(join(homedir(), ".convex", "config.json"), "utf8")) as { accessToken?: string };
        return config.accessToken ?? null;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Production mode (migration Task 17, fix round 1)
// ---------------------------------------------------------------------------
//
// The cutover's delta import must write to the production deployment, and the
// dev-only guard above rightly refuses it. This is the one reviewed way in —
// not a bypass: it is never the default, and every condition is independent.
//
// 1. `--production` on the command line (nothing in the environment can select it);
// 2. `--confirm-deployment <prod:name>`, typed by the operator, equal to…
// 3. …the `deployments.convexProduction` of a **passing** preflight report
//    (`--preflight-report <path>`) whose HMAC verifies with the migration key,
//    for `production`, not `partial`, for the same commit as HEAD, < 24 h old;
// 4. the Task 16 environment sanitization (no deploy key, no self-hosted or
//    provisioning override; `CONVEX_DEPLOYMENT`, if set, must agree);
// 5. explicit credentials only: `MIGRATION_CONVEX_ADMIN_KEY` of exactly that
//    `prod:` deployment and its `https://<name>.<region>.convex.cloud` URL —
//    no fallback to the CLI login.

export const PRODUCTION_FLAG = "--production";
const REPORT_MAX_AGE_MS = 24 * 3_600_000;

export interface ProductionGate {
    argv: string[];
    env: NodeJS.ProcessEnv;
    headSha: string;
    readText: (path: string) => string;
    now: () => Date;
}

function argValue(argv: string[], flag: string): string | undefined {
    const at = argv.indexOf(flag);
    return at === -1 ? undefined : argv[at + 1];
}

export function resolveProductionTarget(gate: ProductionGate): { selection: TargetSelection; credentials: TargetCredentials } {
    if (!gate.argv.includes(PRODUCTION_FLAG)) throw new Error(`${PRODUCTION_FLAG} is required to target production`);

    const confirm = argValue(gate.argv, "--confirm-deployment");
    if (!confirm) throw new Error("--confirm-deployment <prod:name> is required (typed by the operator)");
    const reportPath = argValue(gate.argv, "--preflight-report");
    if (!reportPath) throw new Error("--preflight-report <path> is required");

    let raw: unknown;
    try {
        raw = JSON.parse(gate.readText(reportPath));
    } catch {
        throw new Error("Preflight report is not readable JSON");
    }
    const report = verifyPreflightReport(raw, gate.env.MIGRATION_ENCRYPTION_KEY);
    if (report.verdict !== "PASS") throw new Error(`Preflight verdict is ${report.verdict}`);
    if (report.partial) throw new Error("Preflight report is partial (--only): not a GO preflight");
    if (report.environment !== "production") throw new Error("Preflight report is not for production");
    if (report.commitSha !== gate.headSha) {
        throw new Error(`Preflight report is for commit ${report.commitSha}, HEAD is ${gate.headSha}`);
    }
    const age = gate.now().getTime() - Date.parse(report.generatedAt);
    if (Number.isNaN(age) || age < 0) throw new Error("Preflight report is dated in the future");
    if (age > REPORT_MAX_AGE_MS) throw new Error("Preflight report is older than 24 h");

    const deployment = report.deployments?.convexProduction ?? "";
    const match = /^prod:([a-z]+-[a-z]+-\d+)$/.exec(deployment);
    if (!match) throw new Error(`Preflight names ${deployment || "no deployment"}, expected prod:<name>`);
    if (confirm !== deployment) throw new Error(`--confirm-deployment ${confirm} does not match the preflight's ${deployment}`);
    const deploymentName = match[1]!;

    if (gate.env.CONVEX_DEPLOYMENT !== undefined && gate.env.CONVEX_DEPLOYMENT !== deployment) {
        throw new Error(`Conflicting deployment selection: CONVEX_DEPLOYMENT=${gate.env.CONVEX_DEPLOYMENT}, confirmed ${deployment}`);
    }
    for (const name of CONFLICTING_ENV) {
        if (gate.env[name]) throw new Error(`Refusing to run with ${name} set: it selects a deployment outside the confirmed one`);
    }

    const adminKey = gate.env.MIGRATION_CONVEX_ADMIN_KEY;
    if (!adminKey) throw new Error("MIGRATION_CONVEX_ADMIN_KEY (the production deploy key) is required: no CLI-login fallback in production");
    if (!adminKey.startsWith(`${deployment}|`)) throw new Error("MIGRATION_CONVEX_ADMIN_KEY does not belong to the confirmed deployment");
    const url = gate.env.MIGRATION_CONVEX_URL ?? "";
    assertDeploymentUrl(url, deploymentName);

    return {
        selection: { deployment, deploymentName },
        credentials: { deploymentName, url, adminKey },
    };
}

/**
 * The constructor the scripts use: production only behind `--production` and
 * the gate above; otherwise the Task 16 staging path, unchanged.
 */
export async function connectTarget(argv: string[]): Promise<ConvexTarget> {
    if (!argv.includes(PRODUCTION_FLAG)) return connectStagingTarget();
    const { selection, credentials } = resolveProductionTarget({
        argv,
        env: process.env,
        headSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
        readText: (path) => readFileSync(resolve(path), "utf8"),
        now: () => new Date(),
    });
    return createTarget(selection, credentials, fetch);
}

/** Selection → verified credentials → client (staging: the dev deployment of `.env.local`). */
export async function connectStagingTarget(): Promise<ConvexTarget> {
    let envLocal: string | null = null;
    try {
        envLocal = readFileSync(resolve(".env.local"), "utf8");
    } catch {
        envLocal = null;
    }
    const selection = resolveTargetSelection(envLocal, process.env);
    const credentials = await authorizeTarget(selection, { env: process.env, fetch, accessToken: readCliAccessToken });
    return createTarget(selection, credentials, fetch);
}
