import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";

/**
 * The one door from the migration scripts to the target deployment (Task 16).
 *
 * `internal*` functions are reachable only with the deployment's admin
 * credentials, which the Convex CLI holds (`convex run`, the same path the
 * Task 4/6 gates use). Two rules this module enforces for every caller:
 *
 * - **No row content in logs.** A failing call is reported by its function name
 *   and the `ConvexError` code only; the CLI's own output (which can echo error
 *   data such as an address) is never forwarded.
 * - **Staging by default.** The target is whatever `CONVEX_DEPLOYMENT` names in
 *   `.env.local`; `--prod` is not supported here. Pointing the pipeline at the
 *   production deployment is a cutover decision (Task 17), not a flag.
 */

const execFileAsync = promisify(execFile);

const CLI = resolve("node_modules/.bin/convex");

/** Deployment the CLI will talk to, read from `.env.local` (never printed with secrets). */
export function targetDeployment(): string {
    try {
        const env = readFileSync(resolve(".env.local"), "utf8");
        const match = /^CONVEX_DEPLOYMENT=([^\s#]+)/m.exec(env);
        return match?.[1] ?? "unknown";
    } catch {
        return "unknown";
    }
}

/** Refuses anything that is not a dev (staging) deployment. */
export function assertStagingTarget(): string {
    const deployment = targetDeployment();
    if (!deployment.startsWith("dev:")) {
        throw new Error(
            `Refusing to run against CONVEX_DEPLOYMENT=${deployment}: Task 16 targets the staging dev deployment only`,
        );
    }
    return deployment;
}

export class ConvexRunError extends Error {
    constructor(
        readonly functionName: string,
        readonly code: string,
    ) {
        super(`convex run ${functionName} failed: ${code}`);
    }
}

/** Extracts `ConvexError` codes (e.g. `UNRESOLVED_REFERENCE`) from CLI output. */
export function errorCodeOf(output: string): string {
    const code = /"code"\s*:\s*"([A-Z0-9_]+)"/.exec(output)?.[1];
    if (code) return code;
    if (/ArgumentValidationError/.test(output)) return "ARGUMENT_VALIDATION_ERROR";
    if (/Could not find function/.test(output)) return "FUNCTION_NOT_FOUND";
    if (/E2BIG|argument list too long/i.test(output)) return "ARGUMENTS_TOO_LARGE";
    return "UNKNOWN_ERROR";
}

/** Parses the JSON value `convex run` prints after its banner lines. */
export function parseRunOutput<T>(stdout: string): T {
    const start = stdout.search(/[[{]/);
    const end = Math.max(stdout.lastIndexOf("}"), stdout.lastIndexOf("]"));
    if (start === -1 || end < start) {
        throw new Error("convex run printed no JSON result");
    }
    return JSON.parse(stdout.slice(start, end + 1)) as T;
}

export async function runConvex<T>(functionName: string, args: Record<string, unknown>): Promise<T> {
    try {
        const { stdout } = await execFileAsync(CLI, ["run", functionName, JSON.stringify(args)], {
            encoding: "utf8",
            maxBuffer: 256 * 1024 * 1024,
        });
        return parseRunOutput<T>(stdout);
    } catch (error) {
        if (error instanceof SyntaxError) throw new ConvexRunError(functionName, "UNPARSABLE_OUTPUT");
        const output = `${(error as { stdout?: string }).stdout ?? ""}\n${(error as { stderr?: string }).stderr ?? ""}`;
        const code = (error as { code?: string }).code === "E2BIG" ? "ARGUMENTS_TOO_LARGE" : errorCodeOf(output);
        throw new ConvexRunError(functionName, code);
    }
}

/** Reads every page of a paginated internal query. */
export async function readAllPages<T>(
    functionName: string,
    args: Record<string, unknown>,
    numItems = 500,
): Promise<T[]> {
    const rows: T[] = [];
    let cursor: string | null = null;

    for (;;) {
        const page: { page: T[]; isDone: boolean; continueCursor: string } = await runConvex(functionName, {
            ...args,
            cursor,
            numItems,
        });
        rows.push(...page.page);
        if (page.isDone) return rows;
        cursor = page.continueCursor;
    }
}
