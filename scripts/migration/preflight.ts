import { config } from "dotenv";
import { execFileSync } from "node:child_process";
import { createHmac, createHash, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { createSocket } from "node:dgram";
import { resolve4, resolveNs } from "node:dns/promises";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { AwsClient } from "aws4fetch";
import { z } from "zod";

import { parseMigrationKey } from "./crypto";

/**
 * Migration Task 17, Step 2 — cutover preflight.
 *
 * The last automated "no" before a human says GO (Task 18, Step 1):
 *
 *   pnpm tsx scripts/migration/preflight.ts --environment production
 *
 * Two properties are the point of this file, more than any single check:
 *
 * - **Fail closed.** A check passes only when it *proves* its condition. Missing
 *   credentials, an unreachable API, an unparsable document, a dependency that
 *   throws: all `FAIL`. One `FAIL` is exit `1`.
 * - **Read-only by construction.** The checks receive read primitives only
 *   (`PreflightDeps`): network through `readOnlyFetch` (anything but GET/HEAD is
 *   refused before it leaves the process), subprocesses limited to
 *   `git rev-parse`, `git diff --name-only`, `git merge-base --is-ancestor` and
 *   `convex env list`, and the report
 *   goes to stdout — the file writes nothing, not even locally. The test pins all
 *   three (`test/migration/preflight.test.ts`).
 *
 * What is proven live and what is attested: the repository cannot see the
 * Google Cloud console or the cost dashboards, so those two checks read an
 * operator attestation (who, when, what) from the machine-readable evidence
 * block in `docs/migration/cutover.md`, and fail when it is missing, stale
 * (> 24 h) or incomplete. Everything else is measured.
 *
 * The report never contains a secret: secrets are compared by digest and only
 * their presence or equality is reported.
 */

export const PREFLIGHT_CHECK_IDS = [
    "gates",
    "rehearsal",
    "neonBackup",
    "exportKey",
    "legacyJobs",
    "webhookSecrets",
    "authSecretParity",
    "dnsTtl",
    "googleCallbacks",
    "costAlerts",
    "r2Cors",
    "deploymentIds",
    "convexReadOnly",
] as const;
export type PreflightCheckId = (typeof PREFLIGHT_CHECK_IDS)[number];

export type Environment = "production" | "staging";

export interface CheckResult {
    id: PreflightCheckId;
    status: "PASS" | "FAIL";
    /** Measured or attested facts. Never a secret. */
    detail: string;
    /** `measured`: read live. `attested`: from the operator evidence block. */
    source: "measured" | "attested" | "document";
}

export interface PreflightReport {
    environment: Environment;
    /** Set when `--only` ran a subset: such a report never stands for the full preflight. */
    partial: PreflightCheckId[] | null;
    generatedAt: string;
    commitSha: string;
    deployments: Record<string, string> | null;
    verdict: "PASS" | "FAIL";
    checks: CheckResult[];
    /** `hmac-sha256:<hex>` over the canonical report, or `unsigned` without a valid key. */
    signature: string;
}

/** Read primitives only. There is no write primitive to misuse. */
export interface PreflightDeps {
    now: () => Date;
    /** Reads a repository file (relative path). */
    readText: (path: string) => string;
    gitHead: () => string;
    /** Files changed between `sha` and HEAD (`git diff --name-only`). */
    changedFilesSince: (sha: string) => string[];
    /** Full SHA of a ref/tag/short SHA (`git rev-parse --verify`), or `null`. */
    resolveCommit: (ref: string) => string | null;
    /**
     * `git merge-base --is-ancestor ancestor descendant`: `true`/`false`, or
     * `null` when git cannot answer (unknown commit, shallow clone) — callers
     * treat `null` as "not proven" (fail closed).
     */
    isAncestor: (ancestor: string, descendant: string) => boolean | null;
    /** Uncommitted paths in the working tree (`git status --porcelain`). */
    dirtyFiles: () => string[];
    env: Record<string, string | undefined>;
    /** Must be wrapped in `readOnlyFetch`. */
    fetch: typeof fetch;
    /**
     * Authoritative DNS, never the recursive resolver: a resolver answers with
     * the *remaining* cache TTL, so a 3600 s record cached with 200 s left would
     * pass a 300 s check (review fix round 1).
     */
    dns: {
        /** IP addresses of the zone's authoritative name servers. */
        nameservers: (host: string) => Promise<string[]>;
        /** TTLs of `type` records for `host` as answered by `server` directly. */
        query: (server: string, host: string, type: "A" | "CNAME") => Promise<number[]>;
    };
    /** Environment variables of the target Convex deployment (read). */
    convexEnv: () => Promise<Record<string, string>>;
    /** The R2 bucket CORS configuration XML (signed GET `?cors`). */
    r2Cors: () => Promise<string>;
}

// ---------------------------------------------------------------------------
// Read-only primitives
// ---------------------------------------------------------------------------

const READ_METHODS = new Set(["GET", "HEAD"]);

/** Wraps `fetch` so that anything but GET/HEAD throws before touching the network. */
export function readOnlyFetch(inner: typeof fetch): typeof fetch {
    return (async (input: string | URL | Request, init?: RequestInit) => {
        const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        if (!READ_METHODS.has(method)) {
            throw new Error(`preflight is read-only: refused ${method} ${input instanceof Request ? input.url : String(input)}`);
        }
        return inner(input, init);
    }) as typeof fetch;
}

// ---------------------------------------------------------------------------
// Document parsers
// ---------------------------------------------------------------------------

const GATE_STATUSES = ["PASS", "FAIL", "NOT_RUN"] as const;

/**
 * Rows of the gate table in `docs/migration/gates.md`. Only table rows whose
 * first cell is a gate id count — the notes below the table mention gates and
 * statuses in prose, and prose is not a source of truth.
 */
export function parseGateLedger(markdown: string): { id: string; status: string }[] {
    const rows: { id: string; status: string }[] = [];
    for (const line of markdown.split("\n")) {
        const match = /^\|\s*(G\d{2})\s*\|[^|]*\|\s*([A-Z_]+)\s*\|/.exec(line);
        if (match) rows.push({ id: match[1]!, status: match[2]! });
    }
    return rows;
}

/**
 * The JSON block that follows `<!-- preflight:<marker> -->`. A document may carry
 * prose around it; only the block is machine-readable.
 */
export function readMarkedJson(markdown: string, marker: string): unknown {
    const tag = `<!-- preflight:${marker} -->`;
    const at = markdown.indexOf(tag);
    if (at === -1) throw new Error(`missing machine-readable block ${tag}`);
    const match = /^\s*```json\s*\n([\s\S]*?)\n```/.exec(markdown.slice(at + tag.length));
    if (!match) throw new Error(`${tag} is not followed by a \`\`\`json block`);
    return JSON.parse(match[1]!);
}

const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "not an ISO date");

const rehearsalSchema = z.object({
    status: z.enum(["PASS", "FAIL", "NOT_RUN", "BLOCKED"]),
    completedAt: isoDate.nullable(),
    commitSha: z.string().regex(/^[0-9a-f]{7,40}$/).nullable(),
    convexDeployment: z.string().nullable(),
});

const attestation = { verifiedBy: z.string().min(1), verifiedAt: isoDate };

const evidenceSchema = z.object({
    environment: z.enum(["production", "staging"]),
    siteOrigin: z.string().url(),
    /** `https://<prod>.convex.site`: where the target's site mode is read. */
    convexSiteUrl: z.string().url(),
    neonBackup: z.object({ projectId: z.string().min(1), branchId: z.string().min(1) }),
    dns: z.object({
        host: z.string().min(1),
        approvedTtlSeconds: z.number().int().positive(),
        approvedBy: z.string().min(1),
        approvedAt: isoDate,
    }),
    google: z.object({
        productionOrigin: z.string().url(),
        stagingOrigin: z.string().url(),
        redirectUris: z.array(z.string()),
        ...attestation,
    }),
    costAlerts: z.object({ convex: z.boolean(), cloudflare: z.boolean(), resend: z.boolean(), ...attestation }),
    deployments: z.object({
        /** Commit the deployed Worker and Convex builds were made from (`main`). */
        builtFromCommit: z.string().regex(/^[0-9a-f]{7,40}$/),
        /**
         * Commit the production Vercel (blue) build was made from: the
         * `legacy-vercel` branch, never `main` (final review C1).
         */
        legacyBuiltFromCommit: z.string().regex(/^[0-9a-f]{7,40}$/),
        convexProduction: z.string().min(1),
        workerVersion: z.string().min(1),
        legacyVercelDeployment: z.string().min(1),
        legacyRollbackRef: z.string().min(1),
    }),
});
type Evidence = z.infer<typeof evidenceSchema>;
type EvidenceKey = keyof Evidence;

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 3_600_000;
const REQUIRED_GATES = Array.from({ length: 10 }, (_, i) => `G${String(i + 1).padStart(2, "0")}`);

/**
 * Final review C1. From this commit on, `main` ships a Convex-only frontend that
 * cannot run on Vercel (no `/api/auth/convex/token` there): a blue build that
 * contains it is an outage and a rollback target that does not work.
 */
export const CONVEX_FRONTEND_COMMIT = "e6bfe5d3c3754d3859902a9e324d987fc58b7b43";
/** The `legacy-vercel` commit that ports the Task 17 read-only mode to the blue stack. */
export const LEGACY_READONLY_PORT_COMMIT = "c4c0b568cea3fc7f24dd39e70ada1bb7de07358f";

/** Paths a docs-only commit may touch after the rehearsal without invalidating it. */
const NON_CODE_PREFIXES = ["docs/", "graphify-out/", ".superpowers/"];

/** Legacy QStash states that are not terminal: the message will still be delivered. */
const IN_FLIGHT_STATES = new Set(["CREATED", "ACTIVE", "RETRY", "ERROR", "IN_PROGRESS"]);
const QSTASH_LOOKBACK_MS = 3 * DAY_MS;
const QSTASH_MAX_PAGES = 50;

function withinLastDay(iso: string, now: Date): string | null {
    const age = now.getTime() - Date.parse(iso);
    if (age < 0) return `${iso} is in the future`;
    if (age > DAY_MS) return `${iso} is older than 24 h`;
    return null;
}

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

type Context = {
    deps: PreflightDeps;
    environment: Environment;
    /** One section of the evidence block, validated on its own (so one gap fails one check). */
    evidence: <K extends EvidenceKey>(key: K) => Evidence[K];
    gates: () => { id: string; status: string }[];
};

type Check = (ctx: Context) => Promise<Omit<CheckResult, "id">>;

const pass = (detail: string, source: CheckResult["source"]) => ({ status: "PASS" as const, detail, source });
const fail = (detail: string, source: CheckResult["source"]) => ({ status: "FAIL" as const, detail, source });

const CHECKS: Record<PreflightCheckId, Check> = {
    async gates(ctx) {
        const rows = ctx.gates();
        const problems: string[] = [];
        for (const id of REQUIRED_GATES) {
            const found = rows.filter((row) => row.id === id);
            if (found.length === 0) problems.push(`${id} missing`);
            else if (found.length > 1) problems.push(`${id} listed ${found.length} times`);
            else if (found[0]!.status !== "PASS") problems.push(`${id}=${found[0]!.status}`);
        }
        const unknown = rows.filter((row) => !(GATE_STATUSES as readonly string[]).includes(row.status));
        if (unknown.length) problems.push(`unknown status: ${unknown.map((r) => `${r.id}=${r.status}`).join(", ")}`);
        return problems.length ? fail(problems.join("; "), "document") : pass("G01–G10 PASS", "document");
    },

    async rehearsal(ctx) {
        const parsed = rehearsalSchema.safeParse(
            readMarkedJson(ctx.deps.readText("docs/migration/rehearsal.md"), "rehearsal"),
        );
        if (!parsed.success) return fail(`rehearsal block invalid: ${parsed.error.issues[0]?.message}`, "document");
        const r = parsed.data;
        if (r.status !== "PASS") return fail(`rehearsal status=${r.status}`, "document");
        if (!r.completedAt) return fail("rehearsal completedAt missing", "document");
        const age = withinLastDay(r.completedAt, ctx.deps.now());
        if (age) return fail(`rehearsal ${age}`, "document");
        if (!r.commitSha) return fail("rehearsal commitSha missing", "document");
        // "Same commit": the rehearsal record is itself committed afterwards, so
        // HEAD differs by construction. What must not differ is the code.
        // Deviation from a literal "same SHA", stated: commits touching only
        // docs/graph/process files after the rehearsal are allowed; uncommitted
        // code in the working tree is not.
        const changed = [...ctx.deps.changedFilesSince(r.commitSha), ...ctx.deps.dirtyFiles()];
        const code = changed.filter((file) => !NON_CODE_PREFIXES.some((prefix) => file.startsWith(prefix)));
        if (code.length) {
            return fail(
                `code changed since the rehearsal commit ${r.commitSha}: ${code.slice(0, 5).join(", ")}${code.length > 5 ? ", …" : ""}`,
                "document",
            );
        }
        return pass(`rehearsal PASS at ${r.completedAt} on ${r.commitSha} (no code change since)`, "document");
    },

    async neonBackup(ctx) {
        const { projectId, branchId } = ctx.evidence("neonBackup");
        const apiKey = ctx.deps.env.NEON_API_KEY;
        if (!apiKey) return fail("NEON_API_KEY not set: the backup cannot be verified", "measured");
        const response = await ctx.deps.fetch(
            `https://console.neon.tech/api/v2/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branchId)}`,
            { method: "GET", headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" } },
        );
        if (!response.ok) return fail(`Neon API HTTP ${response.status} for branch ${branchId}`, "measured");
        const body = (await response.json()) as { branch?: { created_at?: string; default?: boolean; parent_id?: string | null } };
        const branch = body.branch;
        if (!branch?.created_at) return fail(`Neon branch ${branchId} has no created_at`, "measured");
        if (branch.default) return fail(`Neon branch ${branchId} is the default branch, not a backup`, "measured");
        if (!branch.parent_id) return fail(`Neon branch ${branchId} has no parent: not a copy of production`, "measured");
        const age = withinLastDay(branch.created_at, ctx.deps.now());
        if (age) return fail(`Neon backup ${branchId}: ${age}`, "measured");
        return pass(`Neon backup branch ${branchId} created ${branch.created_at} from ${branch.parent_id}`, "measured");
    },

    async exportKey(ctx) {
        try {
            parseMigrationKey(ctx.deps.env.MIGRATION_ENCRYPTION_KEY);
            return pass("MIGRATION_ENCRYPTION_KEY present, base64, 32 bytes", "measured");
        } catch (error) {
            return fail((error as Error).message, "measured");
        }
    },

    async legacyJobs(ctx) {
        const token = ctx.deps.env.NUXT_QSTASH_TOKEN;
        if (!token) return fail("NUXT_QSTASH_TOKEN not set: legacy queue cannot be inspected", "measured");
        const base = (ctx.deps.env.NUXT_QSTASH_URL || "https://qstash.upstash.io").replace(/\/+$/, "");
        const headers = { authorization: `Bearer ${token}`, accept: "application/json" };
        const since = ctx.deps.now().getTime() - QSTASH_LOOKBACK_MS;

        // Latest state per message over the lookback window (the log is newest first).
        const latest = new Map<string, { state: string; time: number; url: string }>();
        let cursor: string | undefined;
        let pages = 0;
        let reachedWindowStart = false;
        do {
            const query = new URLSearchParams({ count: "100" });
            if (cursor) query.set("cursor", cursor);
            const response = await ctx.deps.fetch(`${base}/v2/events?${query.toString()}`, { method: "GET", headers });
            if (!response.ok) return fail(`QStash events HTTP ${response.status}`, "measured");
            const body = (await response.json()) as {
                cursor?: string;
                events?: { messageId: string; state: string; time: number; url?: string }[];
            };
            for (const event of body.events ?? []) {
                if (event.time < since) {
                    reachedWindowStart = true;
                    continue;
                }
                const seen = latest.get(event.messageId);
                if (!seen || event.time > seen.time) {
                    latest.set(event.messageId, { state: event.state, time: event.time, url: event.url ?? "" });
                }
            }
            cursor = body.cursor ? String(body.cursor) : undefined;
            pages += 1;
        } while (cursor && !reachedWindowStart && pages < QSTASH_MAX_PAGES);
        if (cursor && !reachedWindowStart) {
            return fail(`QStash log longer than ${QSTASH_MAX_PAGES} pages in the window: cannot prove zero in flight`, "measured");
        }

        const inFlight = [...latest.entries()].filter(([, e]) => IN_FLIGHT_STATES.has(e.state));
        const dlqResponse = await ctx.deps.fetch(`${base}/v2/dlq`, { method: "GET", headers });
        if (!dlqResponse.ok) return fail(`QStash DLQ HTTP ${dlqResponse.status}`, "measured");
        const dlq = ((await dlqResponse.json()) as { messages?: unknown[] }).messages ?? [];

        const problems: string[] = [];
        if (inFlight.length) {
            problems.push(
                `${inFlight.length} legacy message(s) in flight: ${inFlight
                    .slice(0, 5)
                    .map(([id, e]) => `${id}=${e.state} ${new URL(e.url || "http://x/").pathname}`)
                    .join(", ")}`,
            );
        }
        // A dead-lettered message would be replayed to the public URL — which,
        // after the DNS switch, is the new stack. It must be resolved first.
        if (dlq.length) problems.push(`${dlq.length} message(s) in the QStash DLQ`);
        return problems.length
            ? fail(problems.join("; "), "measured")
            : pass(`0 in flight over ${latest.size} message(s) in the last 72 h, DLQ empty`, "measured");
    },

    async webhookSecrets(ctx) {
        const env = await ctx.deps.convexEnv();
        const missing = ["CREEM_WEBHOOK_SECRET", "RESEND_WEBHOOK_SECRET"].filter((name) => !env[name]?.trim());
        return missing.length
            ? fail(`not set on the Convex ${ctx.environment} deployment: ${missing.join(", ")}`, "measured")
            : pass("CREEM_WEBHOOK_SECRET and RESEND_WEBHOOK_SECRET set on Convex", "measured");
    },

    async authSecretParity(ctx) {
        // Preview links and org-invite tokens are HMACs keyed by this secret on
        // both sides; 2FA payloads are encrypted with it (G05 handoff).
        const env = await ctx.deps.convexEnv();
        const convex = env.BETTER_AUTH_SECRET;
        const worker = ctx.deps.env.NUXT_BETTER_AUTH_SECRET;
        if (!convex) return fail("BETTER_AUTH_SECRET not set on Convex", "measured");
        if (!worker) return fail("NUXT_BETTER_AUTH_SECRET not provided to the preflight", "measured");
        return timingSafeEqual(digest(convex), digest(worker))
            ? pass("Convex BETTER_AUTH_SECRET equals NUXT_BETTER_AUTH_SECRET (compared by digest)", "measured")
            : fail("Convex BETTER_AUTH_SECRET differs from NUXT_BETTER_AUTH_SECRET", "measured");
    },

    async dnsTtl(ctx) {
        const dns = ctx.evidence("dns");
        const stale = withinLastDay(dns.approvedAt, ctx.deps.now());
        if (stale) return fail(`DNS TTL approval ${stale}`, "measured");
        const servers = await ctx.deps.dns.nameservers(dns.host);
        if (!servers.length) return fail(`no authoritative name server found for ${dns.host}`, "measured");
        const errors: string[] = [];
        for (const server of servers) {
            try {
                // A and CNAME: with a CNAME/ALIAS chain the record the operator
                // changes is the CNAME, whose TTL is not the final A's.
                const ttls = [
                    ...(await ctx.deps.dns.query(server, dns.host, "A")),
                    ...(await ctx.deps.dns.query(server, dns.host, "CNAME")),
                ];
                if (!ttls.length) return fail(`${server} has no A/CNAME record for ${dns.host}`, "measured");
                const max = Math.max(...ttls);
                return max > dns.approvedTtlSeconds
                    ? fail(`${dns.host} authoritative TTL ${max}s (${server}) > approved ${dns.approvedTtlSeconds}s`, "measured")
                    : pass(`${dns.host} authoritative TTL ${max}s at ${server} (approved ${dns.approvedTtlSeconds}s by ${dns.approvedBy})`, "measured");
            } catch (error) {
                errors.push(`${server}: ${(error as Error).message}`);
            }
        }
        return fail(`no authoritative server answered: ${errors.join("; ")}`, "measured");
    },

    async googleCallbacks(ctx) {
        const google = ctx.evidence("google");
        const stale = withinLastDay(google.verifiedAt, ctx.deps.now());
        if (stale) return fail(`Google callback attestation ${stale}`, "attested");
        const required = [google.productionOrigin, google.stagingOrigin].map(
            (origin) => `${origin.replace(/\/+$/, "")}/api/auth/callback/google`,
        );
        const missing = required.filter((uri) => !google.redirectUris.includes(uri));
        return missing.length
            ? fail(`Google OAuth client lacks redirect URI(s): ${missing.join(", ")}`, "attested")
            : pass(`production + staging callbacks registered (verified by ${google.verifiedBy})`, "attested");
    },

    async costAlerts(ctx) {
        const costAlerts = ctx.evidence("costAlerts");
        const problems: string[] = [];
        const g10 = ctx.gates().find((row) => row.id === "G10");
        if (g10?.status !== "PASS") problems.push(`G10=${g10?.status ?? "missing"}`);
        for (const provider of ["convex", "cloudflare", "resend"] as const) {
            if (!costAlerts[provider]) problems.push(`${provider} alert not attested`);
        }
        const stale = withinLastDay(costAlerts.verifiedAt, ctx.deps.now());
        if (stale) problems.push(`attestation ${stale}`);
        return problems.length
            ? fail(problems.join("; "), "attested")
            : pass(`G10 PASS, Convex/Cloudflare/Resend alerts active (verified by ${costAlerts.verifiedBy})`, "attested");
    },

    async r2Cors(ctx) {
        const origin = ctx.evidence("siteOrigin").replace(/\/+$/, "");
        const xml = await ctx.deps.r2Cors();
        const rules = [...xml.matchAll(/<CORSRule>([\s\S]*?)<\/CORSRule>/g)].map((m) => m[1]!);
        const ok = rules.some((rule) => {
            const origins = [...rule.matchAll(/<AllowedOrigin>([\s\S]*?)<\/AllowedOrigin>/g)].map((m) => m[1]!.trim());
            const methods = [...rule.matchAll(/<AllowedMethod>([\s\S]*?)<\/AllowedMethod>/g)].map((m) => m[1]!.trim().toUpperCase());
            return (origins.includes(origin) || origins.includes("*")) && methods.includes("PUT");
        });
        return ok
            ? pass(`R2 CORS allows PUT from ${origin}`, "measured")
            : fail(`R2 CORS has no rule allowing PUT from ${origin} (${rules.length} rule(s))`, "measured");
    },

    async convexReadOnly(ctx) {
        // The target must already refuse writes before Google/Creem/DNS move to it
        // (runbook step 8.0): otherwise the first user on the new DNS writes to
        // Convex and the pre-write rollback is gone before the smoke even runs.
        const base = ctx.evidence("convexSiteUrl").replace(/\/+$/, "");
        // Bound to the deployment the import gate will confirm (fix round 2, N3):
        // a staging or mistyped `.convex.site` must not stand in for production.
        const name = /^prod:([a-z]+-[a-z]+-\d+)$/.exec(ctx.evidence("deployments").convexProduction)?.[1];
        if (!name) return fail("deployments.convexProduction is not prod:<name>", "attested");
        const url = new URL(base);
        if (url.protocol !== "https:" || !url.hostname.startsWith(`${name}.`) || !url.hostname.endsWith(".convex.site")) {
            return fail(`convexSiteUrl ${url.hostname} is not the .convex.site of ${name}`, "attested");
        }
        const response = await ctx.deps.fetch(`${base}/public/site-mode`, { method: "GET", headers: { accept: "application/json" } });
        if (!response.ok) return fail(`GET ${base}/public/site-mode → ${response.status}`, "measured");
        const { mode } = (await response.json()) as { mode?: unknown };
        return mode === "maintenance-readonly"
            ? pass(`Convex target site mode maintenance-readonly (${base})`, "measured")
            : fail(`Convex target site mode is ${String(mode)}, must be maintenance-readonly before the switch`, "measured");
    },

    async deploymentIds(ctx) {
        const environment = ctx.evidence("environment");
        if (environment !== ctx.environment) {
            return fail(`evidence block is for ${environment}, preflight run for ${ctx.environment}`, "attested");
        }
        const d = ctx.evidence("deployments");
        // Green (Worker + Convex): the rehearsed code, no code change between the
        // commit they were built from and HEAD (`main`).
        const code = ctx.deps
            .changedFilesSince(d.builtFromCommit)
            .filter((file) => !NON_CODE_PREFIXES.some((prefix) => file.startsWith(prefix)));
        if (code.length) {
            return fail(`deployed builds (${d.builtFromCommit}) differ from HEAD in code: ${code.slice(0, 5).join(", ")}`, "attested");
        }

        // Blue (Vercel production), final review C1: built from `legacy-vercel`,
        // checked against its own expected commit, never against HEAD.
        const legacyBuilt = ctx.deps.resolveCommit(d.legacyBuiltFromCommit);
        if (!legacyBuilt) return fail(`legacyBuiltFromCommit ${d.legacyBuiltFromCommit} is not a known commit`, "attested");
        const rollback = ctx.deps.resolveCommit(d.legacyRollbackRef);
        if (!rollback) return fail(`legacyRollbackRef ${d.legacyRollbackRef} does not resolve to a commit`, "attested");
        if (rollback !== legacyBuilt) {
            return fail(
                `the rollback ref ${d.legacyRollbackRef} (${rollback.slice(0, 12)}) is not the commit Vercel production was built from (${legacyBuilt.slice(0, 12)})`,
                "attested",
            );
        }
        if (ctx.deps.isAncestor(CONVEX_FRONTEND_COMMIT, legacyBuilt) !== false) {
            return fail(
                `Vercel production (${legacyBuilt.slice(0, 12)}) contains (or cannot be proven free of) the Convex-only frontend (${CONVEX_FRONTEND_COMMIT.slice(0, 7)}): build it from the legacy-vercel branch, never from main`,
                "attested",
            );
        }
        if (ctx.deps.isAncestor(LEGACY_READONLY_PORT_COMMIT, legacyBuilt) !== true) {
            return fail(
                `Vercel production (${legacyBuilt.slice(0, 12)}) lacks the read-only port (${LEGACY_READONLY_PORT_COMMIT.slice(0, 7)}): step 1 would not close writes`,
                "attested",
            );
        }
        const green = ctx.deps.resolveCommit(d.builtFromCommit);
        if (green && green === legacyBuilt) {
            return fail("Worker/Convex and Vercel production are built from the same commit", "attested");
        }
        return pass(
            `convex=${d.convexProduction} worker=${d.workerVersion} (${d.builtFromCommit}) legacy=${d.legacyVercelDeployment} (${legacyBuilt.slice(0, 12)}) rollbackRef=${d.legacyRollbackRef}`,
            "attested",
        );
    },
};

// ---------------------------------------------------------------------------
// Minimal DNS over UDP (one question, read-only)
// ---------------------------------------------------------------------------

const DNS_TYPES = { A: 1, CNAME: 5 } as const;

export function encodeDnsQuery(id: number, host: string, type: "A" | "CNAME"): Buffer {
    const header = Buffer.alloc(12);
    header.writeUInt16BE(id, 0);
    header.writeUInt16BE(0x0000, 2); // standard query, RD=0: ask the authority, no recursion
    header.writeUInt16BE(1, 4); // QDCOUNT
    const labels = host.replace(/\.$/, "").split(".").map((label) => {
        const bytes = Buffer.from(label, "ascii");
        return Buffer.concat([Buffer.from([bytes.length]), bytes]);
    });
    const tail = Buffer.alloc(4);
    tail.writeUInt16BE(DNS_TYPES[type], 0);
    tail.writeUInt16BE(1, 2); // IN
    return Buffer.concat([header, ...labels, Buffer.from([0]), tail]);
}

function skipName(buf: Buffer, offset: number): number {
    let at = offset;
    for (;;) {
        const len = buf[at];
        if (len === undefined) throw new Error("truncated DNS name");
        if ((len & 0xc0) === 0xc0) return at + 2; // compression pointer
        if (len === 0) return at + 1;
        at += len + 1;
    }
}

/** TTLs of the answer records of `type` in a DNS response. */
export function parseDnsAnswerTtls(buf: Buffer, type: "A" | "CNAME"): number[] {
    if (buf.length < 12) throw new Error("short DNS response");
    const rcode = buf.readUInt16BE(2) & 0x000f;
    if (rcode !== 0 && rcode !== 3) throw new Error(`DNS rcode ${rcode}`);
    const qd = buf.readUInt16BE(4);
    const an = buf.readUInt16BE(6);
    let at = 12;
    for (let i = 0; i < qd; i += 1) at = skipName(buf, at) + 4;
    const ttls: number[] = [];
    for (let i = 0; i < an; i += 1) {
        at = skipName(buf, at);
        const recordType = buf.readUInt16BE(at);
        const ttl = buf.readUInt32BE(at + 4);
        const rdlength = buf.readUInt16BE(at + 8);
        if (recordType === DNS_TYPES[type]) ttls.push(ttl);
        at += 10 + rdlength;
    }
    return ttls;
}

function udpDnsQuery(server: string, host: string, type: "A" | "CNAME"): Promise<number[]> {
    return new Promise((resolvePromise, reject) => {
        const id = randomBytes(2).readUInt16BE(0);
        const socket = createSocket(server.includes(":") ? "udp6" : "udp4");
        const timer = setTimeout(() => {
            socket.close();
            reject(new Error("DNS timeout"));
        }, 3000);
        socket.once("message", (message) => {
            clearTimeout(timer);
            socket.close();
            try {
                if (message.readUInt16BE(0) !== id) throw new Error("DNS id mismatch");
                resolvePromise(parseDnsAnswerTtls(message, type));
            } catch (error) {
                reject(error);
            }
        });
        socket.once("error", (error) => {
            clearTimeout(timer);
            socket.close();
            reject(error);
        });
        socket.send(encodeDnsQuery(id, host, type), 53, server);
    });
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.keys(value as Record<string, unknown>)
            .sort()
            .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}

/** Signs a report (exported so the production import gate can verify it). */
export function signPreflightReport(report: Omit<PreflightReport, "signature">, encodedKey: string | undefined): string {
    return sign(report, encodedKey);
}

/**
 * Verifies a report's signature with the migration key. Returns the report or
 * throws: an `unsigned` report, another key, or any edited byte is refused.
 */
export function verifyPreflightReport(value: unknown, encodedKey: string | undefined): PreflightReport {
    if (!value || typeof value !== "object") throw new Error("preflight report is not an object");
    const { signature, ...unsigned } = value as PreflightReport;
    if (typeof signature !== "string" || !signature.startsWith("hmac-sha256:")) {
        throw new Error("preflight report has no valid signature");
    }
    const expected = sign(unsigned, encodedKey);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (expected === "unsigned" || a.length !== b.length || !timingSafeEqual(a, b)) {
        throw new Error("preflight report signature does not verify with MIGRATION_ENCRYPTION_KEY");
    }
    return value as PreflightReport;
}

function sign(report: Omit<PreflightReport, "signature">, encodedKey: string | undefined): string {
    let key: Buffer;
    try {
        key = parseMigrationKey(encodedKey);
    } catch {
        return "unsigned";
    }
    const macKey = Buffer.from(hkdfSync("sha256", key, Buffer.alloc(0), "ceremly-preflight-report-v1", 32));
    return `hmac-sha256:${createHmac("sha256", macKey).update(canonical(report)).digest("hex")}`;
}

export async function runPreflight(
    options: { environment: Environment; only?: PreflightCheckId[] },
    deps: PreflightDeps,
): Promise<{ exitCode: 0 | 1; report: PreflightReport }> {
    let evidenceRaw: Record<string, unknown> | undefined;
    let gatesCache: { id: string; status: string }[] | undefined;
    const ctx: Context = {
        deps,
        environment: options.environment,
        evidence: (key) => {
            if (!evidenceRaw) {
                const raw = readMarkedJson(deps.readText("docs/migration/cutover.md"), "evidence");
                if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("evidence block is not an object");
                evidenceRaw = raw as Record<string, unknown>;
            }
            const parsed = evidenceSchema.shape[key].safeParse(evidenceRaw[key]);
            if (!parsed.success) {
                const issue = parsed.error.issues[0];
                const at = [key, ...(issue?.path ?? [])].join(".");
                throw new Error(`evidence ${at} not filled in: ${issue?.message}`);
            }
            return parsed.data as Evidence[typeof key];
        },
        gates: () => (gatesCache ??= parseGateLedger(deps.readText("docs/migration/gates.md"))),
    };

    const selected = options.only?.length ? PREFLIGHT_CHECK_IDS.filter((id) => options.only!.includes(id)) : PREFLIGHT_CHECK_IDS;
    const checks: CheckResult[] = [];
    for (const id of selected) {
        try {
            checks.push({ id, ...(await CHECKS[id](ctx)) });
        } catch (error) {
            checks.push({ id, status: "FAIL", detail: `check could not run: ${(error as Error).message}`, source: "measured" });
        }
    }

    let deployments: Record<string, string> | null = null;
    try {
        deployments = { ...ctx.evidence("deployments") };
    } catch {
        deployments = null;
    }

    const verdict = checks.every((c) => c.status === "PASS") ? "PASS" : "FAIL";
    const unsigned = {
        environment: options.environment,
        partial: options.only?.length ? [...selected] : null,
        generatedAt: deps.now().toISOString(),
        commitSha: deps.gitHead(),
        deployments,
        verdict,
        checks,
    } as const;
    const report: PreflightReport = { ...unsigned, signature: sign(unsigned, deps.env.MIGRATION_ENCRYPTION_KEY) };
    return { exitCode: verdict === "PASS" ? 0 : 1, report };
}

// ---------------------------------------------------------------------------
// CLI (real read-only dependencies)
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { environment: Environment; only?: PreflightCheckId[] } {
    const at = argv.indexOf("--environment");
    const value = at === -1 ? undefined : argv[at + 1];
    if (value !== "production" && value !== "staging") {
        throw new Error("usage: preflight.ts --environment production|staging [--only legacyJobs,…]");
    }
    // `--only` re-runs a subset during the window (e.g. `legacyJobs` while the
    // queue drains). The report is marked `partial` and is not the GO preflight.
    const onlyAt = argv.indexOf("--only");
    const only = onlyAt === -1 ? undefined : (argv[onlyAt + 1] ?? "").split(",").filter(Boolean);
    const unknown = only?.filter((id) => !(PREFLIGHT_CHECK_IDS as readonly string[]).includes(id)) ?? [];
    if (unknown.length || (only && !only.length)) throw new Error(`--only: unknown check(s) ${unknown.join(", ")}`);
    return { environment: value, only: only as PreflightCheckId[] | undefined };
}

function parseConvexEnvList(stdout: string): Record<string, string> {
    const env: Record<string, string> = {};
    for (const line of stdout.split("\n")) {
        const at = line.indexOf("=");
        if (at > 0) env[line.slice(0, at).trim()] = line.slice(at + 1);
    }
    return env;
}

function realDeps(environment: Environment): PreflightDeps {
    const env = process.env;
    let convexCache: Promise<Record<string, string>> | undefined;
    return {
        now: () => new Date(),
        readText: (path) => readFileSync(path, "utf8"),
        gitHead: () => execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
        changedFilesSince: (sha) =>
            execFileSync("git", ["diff", "--name-only", `${sha}..HEAD`], { encoding: "utf8" })
                .split("\n")
                .filter(Boolean),
        resolveCommit: (ref) => {
            try {
                return execFileSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { encoding: "utf8" }).trim() || null;
            } catch {
                return null;
            }
        },
        isAncestor: (ancestor, descendant) => {
            try {
                execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], { stdio: "ignore" });
                return true;
            } catch (error) {
                // Exit 1 is git's "no"; anything else is "cannot tell".
                return (error as { status?: number }).status === 1 ? false : null;
            }
        },
        dirtyFiles: () =>
            execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" })
                .split("\n")
                .filter(Boolean)
                .map((line) => line.slice(3)),
        env,
        fetch: readOnlyFetch(globalThis.fetch),
        dns: {
            nameservers: async (host) => {
                // Walk up the labels to the zone apex that has NS records.
                const labels = host.split(".");
                for (let i = 0; i < labels.length - 1; i += 1) {
                    try {
                        const names = await resolveNs(labels.slice(i).join("."));
                        if (names.length) {
                            const ips = await Promise.all(names.map((name) => resolve4(name).catch(() => [] as string[])));
                            return ips.flat();
                        }
                    } catch {
                        // not a zone apex: go up one label
                    }
                }
                return [];
            },
            query: (server, host, type) => udpDnsQuery(server, host, type),
        },
        // `convex env list` reads; stdout stays in memory and is never printed.
        convexEnv: () =>
            (convexCache ??= Promise.resolve(
                parseConvexEnvList(
                    execFileSync("npx", ["convex", "env", "list", ...(environment === "production" ? ["--prod"] : [])], {
                        encoding: "utf8",
                        stdio: ["ignore", "pipe", "ignore"],
                    }),
                ),
            )),
        r2Cors: async () => {
            const { NUXT_CF_ACCOUNT_ID: account, NUXT_CF_ACCESS_KEY_ID: id, NUXT_CF_SECRET_ACCESS_KEY: secret, NUXT_CF_R2_BUCKET_NAME: bucket } = env;
            if (!account || !id || !secret || !bucket) throw new Error("R2 credentials (NUXT_CF_*) not set");
            const client = new AwsClient({ accessKeyId: id, secretAccessKey: secret, service: "s3", region: "auto" });
            const signed = await client.sign(`https://${account}.r2.cloudflarestorage.com/${encodeURIComponent(bucket)}?cors`, {
                method: "GET",
            });
            const response = await readOnlyFetch(globalThis.fetch)(signed);
            if (!response.ok) throw new Error(`R2 GetBucketCors HTTP ${response.status}`);
            return response.text();
        },
    };
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));
    // Staging reads `.env` (dev values). Production reads **no file**: `.env`
    // holds dev values that would silently answer for the wrong queue/secret,
    // and `.env.prod` is never read by tooling. The operator exports the
    // production values in the shell of the cutover.
    if (options.environment === "staging") config({ path: ".env", override: false, quiet: true });
    const { exitCode, report } = await runPreflight(options, realDeps(options.environment));
    console.log(JSON.stringify(report, null, 2));
    for (const check of report.checks) {
        console.error(`${check.status === "PASS" ? "PASS" : "FAIL"}  ${check.id.padEnd(17)} ${check.detail}`);
    }
    if (report.partial) {
        console.error(`PARTIAL (${report.partial.join(",")}) — not a GO preflight; the import gate refuses it`);
    }
    console.error(`verdict=${report.verdict} exit=${exitCode}${report.partial ? " (partial)" : ""}`);
    process.exit(exitCode);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error: unknown) => {
        console.error(`[preflight] ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    });
}
