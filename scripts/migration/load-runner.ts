/**
 * G10 — synthetic load runner (plan Task 9, Step 3).
 *
 * Measures, against the **staging** Convex deployment, the four things the cost
 * model needs and cannot invent:
 *
 * 1. **call counts per flow** — the real functions each flow invokes;
 * 2. **result payload bytes** — the database I/O floor per call;
 * 3. **reactive fan-out** — how many times a subscribed query re-executes per
 *    write when 1, 5 or 20 clients are connected (`subscribersPerWrite`);
 * 4. **latency** — p50/p95 per flow, which is what tells tiers apart in practice.
 *
 * What it deliberately does *not* claim: the Convex and Cloudflare dashboards are
 * the source of truth for billed usage, and they are not reachable from a script
 * (no dashboard API, no account access in this repository). The runner therefore
 * reports the *client-observable* side — calls it made, bytes it received,
 * re-executions it counted — and `docs/migration/cost-model.md` says plainly that
 * the dashboard comparison is owed before the economic go/no-go.
 *
 * Usage:
 *   npx tsx scripts/migration/load-runner.ts                 # 1,5,20 subscribers
 *   npx tsx scripts/migration/load-runner.ts --subscribers 1,5
 *   npx tsx scripts/migration/load-runner.ts --json .gate/load-measurements.json
 *
 * Requires `NUXT_PUBLIC_CONVEX_URL` (staging) and `GATE_AUTH_PRIVATE_KEY_B64`
 * (the gate's RS256 key, whose public half the deployment trusts).
 */
import { config } from "dotenv";
import { writeFileSync } from "node:fs";
import { ConvexClient, ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { gatePrivateKeyPem, signGateToken } from "../../test/migration/gate-jwt";
import type { FlowId } from "./load-model";

config();

const convexUrl = (process.env.CONVEX_GATE_URL ?? process.env.NUXT_PUBLIC_CONVEX_URL ?? "").replace(/\/+$/, "");
const privateKey = gatePrivateKeyPem();

if (!convexUrl) throw new Error("NUXT_PUBLIC_CONVEX_URL (or CONVEX_GATE_URL) is required");
if (!privateKey) throw new Error("GATE_AUTH_PRIVATE_KEY_B64 is required");

const runId = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
const owner = {
    subject: `gate-g10-owner-${runId}`,
    email: `gate-g10-owner-${runId}@example.com`,
    name: "G10 Owner",
};

const token = signGateToken({ privateKeyPem: privateKey, ...owner, expiresInSeconds: 1800 });

const client = () => {
    const http = new ConvexHttpClient(convexUrl);
    http.setAuth(token);
    return http;
};

// ---------------------------------------------------------------------------
// Measurement primitives
// ---------------------------------------------------------------------------

export interface CallSample {
    /** Which flow this call belongs to. */
    flow: FlowId;
    /** Convex function path, e.g. `organizations.listMembers`. */
    fn: string;
    ms: number;
    /** Bytes of the JSON result (`0` for mutations/actions that return void). */
    resultBytes: number;
    ok: boolean;
    error?: string;
}

const samples: CallSample[] = [];

async function measure<T>(
    flow: FlowId,
    fn: string,
    call: () => Promise<T>,
): Promise<{ ok: boolean; value?: T; error?: string }> {
    const started = performance.now();
    try {
        const value = await call();
        const resultBytes = value === undefined ? 0 : Buffer.byteLength(JSON.stringify(value), "utf8");
        samples.push({ flow, fn, ms: performance.now() - started, resultBytes, ok: true });
        return { ok: true, value };
    } catch (error) {
        samples.push({
            flow,
            fn,
            ms: performance.now() - started,
            resultBytes: 0,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        });
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
}

const percentile = (values: number[], fraction: number): number => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.floor(fraction * sorted.length));
    return Math.round(sorted[index]! * 10) / 10;
};

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

/**
 * Dashboard: the four queries the CSR dashboard issues when a planner opens it.
 *
 * `planForActiveOrganization` is included because the pricing banner is part of
 * the first paint; it is also the query a completed checkout re-executes.
 */
async function dashboardScenario(): Promise<{ organizationId: string }> {
    const http = client();

    const provisioned = await measure("signIn", "organizations.ensureProvisioned", () =>
        http.mutation(api.organizations.ensureProvisioned, {}),
    );

    await measure("dashboard", "organizations.listMyOrganizations", () =>
        http.query(api.organizations.listMyOrganizations, {}),
    );
    await measure("dashboard", "organizations.getActiveOrganization", () =>
        http.query(api.organizations.getActiveOrganization, {}),
    );
    await measure("dashboard", "organizations.listMembers", () =>
        http.query(api.organizations.listMembers, {}),
    );
    await measure("dashboard", "billing.planForActiveOrganization", () =>
        http.query(api.billing.planForActiveOrganization, {}),
    );

    return { organizationId: provisioned.value?.organizationId ?? "" };
}

/**
 * Fan-out: how many re-executions one write causes per connected subscriber.
 *
 * The scenario subscribes `subscribers` clients to the same query the dashboard
 * uses, performs one write that changes what that query reads (a rename), and
 * counts how many times each subscriber's callback fires *after* the initial
 * value. That count is `subscribersPerWrite` — the number the whole cost model
 * turns on, and the one the flat "call per planner" estimate assumed was zero.
 */
async function fanOutScenario(subscribers: number, label: string): Promise<FanOutResult> {
    const ws = new ConvexClient(convexUrl);
    ws.setAuth(async () => token);

    const counted: number[] = Array.from({ length: subscribers }, () => 0);
    const ready = new Set<number>();

    for (let index = 0; index < subscribers; index += 1) {
        ws.onUpdate(
            api.organizations.getActiveOrganization,
            {},
            () => {
                if (!ready.has(index)) {
                    ready.add(index);
                    return;
                }
                counted[index] = (counted[index] ?? 0) + 1;
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (error: any) => {
                console.error(`subscriber ${index} error:`, error?.message ?? error);
            },
        );
    }

    // Wait for every subscriber to receive its first value: a write sent before
    // the subscription is established would be missed by that client, and the
    // measurement would under-report the fan-out.
    const deadline = Date.now() + 20_000;
    while (ready.size < subscribers && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (ready.size < subscribers) {
        console.error(`only ${ready.size}/${subscribers} subscribers connected`);
    }

    // Let the last subscription settle before writing: a write applied while a
    // subscription is still being registered server-side is not delivered to it,
    // and the measurement would under-report the fan-out.
    await new Promise((resolve) => setTimeout(resolve, 500));

    const http = client();

    const write = async (name: string) => {
        const before = [...counted];
        // No `organizationId` argument — measured: the validator rejects it, because
        // the tenant always comes from the caller's active organization.
        const result = await measure("admin", "organizations.updateOrganization", () =>
            http.mutation(api.organizations.updateOrganization, { name }),
        );
        await new Promise((resolve) => setTimeout(resolve, 1_500));

        return {
            applied: result.ok,
            ...(result.error ? { error: result.error } : {}),
            reexecutions: counted.map((value, index) => value - (before[index] ?? 0)),
        };
    };

    // A write that changes what the subscriber reads...
    const changed = await write(`G10 ${label} ${runId}`);
    // ...and the same write with the same value. Measured (this is how the
    // scenario was debugged): a mutation that leaves the subscribed result
    // identical re-executes nothing — the fan-out term counts *effective* writes.
    const unchanged = await write(`G10 ${label} ${runId}`);

    await ws.close();

    const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

    return {
        subscribers,
        connected: ready.size,
        changedWrite: { ...changed, total: sum(changed.reexecutions) },
        unchangedWrite: { ...unchanged, total: sum(unchanged.reexecutions) },
        callsPerWrite: changed.reexecutions.map((value) => 1 + value),
    };
}

interface FanOutResult {
    subscribers: number;
    connected: number;
    /** A write that changes the subscribed value. */
    changedWrite: { applied: boolean; error?: string; reexecutions: number[]; total: number };
    /** The same write with an identical value — a no-op for the subscribed read. */
    unchangedWrite: { applied: boolean; error?: string; reexecutions: number[]; total: number };
    /** Total calls one *effective* write caused: the write plus one read per subscriber. */
    callsPerWrite: number[];
}

/**
 * Upload: the two actions the media flow runs.
 *
 * On staging the storage bridge is not deployed, so `presignUpload` stops at
 * `STORAGE_BRIDGE_NOT_CONFIGURED` — after authorization and the rate limit, i.e.
 * after the calls the model cares about. The result is reported as a *partial*
 * measurement, not as a success.
 */
async function uploadScenario(): Promise<{ presignOutcome: string }> {
    const http = client();

    const presign = await measure("upload", "files.presignUpload", () =>
        http.action(api.files.presignUpload, {
            originalName: "gate-g10.png",
            mimeType: "image/png",
            fileSize: 1024,
        }),
    );

    return { presignOutcome: presign.ok ? "granted" : (presign.error ?? "failed") };
}

/**
 * Checkout: the action that creates a Creem checkout for the active organization.
 *
 * Left opt-in (`--checkout`) because it talks to the Creem test API; G07 owns that
 * path and this runner only needs its call shape.
 */
async function checkoutScenario(): Promise<{ outcome: string }> {
    const http = client();
    const result = await measure("checkout", "billing.checkoutsCreate", () =>
        http.action(api.billing.checkoutsCreate, { tier: "celebration" }),
    );

    return { outcome: result.ok ? "created" : (result.error ?? "failed") };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export interface LoadMeasurementReport {
    deployment: string;
    ranAt: string;
    subscribers: number[];
    flows: Record<string, { calls: number; failed: number; resultBytes: number; p50Ms: number; p95Ms: number }>;
    fanOut: FanOutResult[];
    notes: string[];
}

function summarize(): LoadMeasurementReport["flows"] {
    const byFlow: LoadMeasurementReport["flows"] = {};

    for (const sample of samples) {
        const entry = (byFlow[sample.flow] ??= { calls: 0, failed: 0, resultBytes: 0, p50Ms: 0, p95Ms: 0 });
        entry.calls += 1;
        entry.failed += sample.ok ? 0 : 1;
        entry.resultBytes += sample.resultBytes;
    }

    for (const [flow, entry] of Object.entries(byFlow)) {
        const durations = samples.filter((sample) => sample.flow === flow).map((sample) => sample.ms);
        entry.p50Ms = percentile(durations, 0.5);
        entry.p95Ms = percentile(durations, 0.95);
        entry.resultBytes = Math.round(entry.resultBytes / Math.max(1, entry.calls));
    }

    return byFlow;
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const subscribersArg = args[args.indexOf("--subscribers") + 1];
    const subscribers = (args.includes("--subscribers") ? subscribersArg : "1,5,20")
        .split(",")
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isFinite(value) && value > 0);
    const jsonPath = args.includes("--json") ? args[args.indexOf("--json") + 1] : undefined;

    console.log(`G10 load runner → ${convexUrl} (subscribers: ${subscribers.join(", ")})`);

    const { organizationId } = await dashboardScenario();
    if (!organizationId) throw new Error("provisioning did not return an organization id");
    console.log(`organization: ${organizationId}`);

    const fanOut: FanOutResult[] = [];
    for (const count of subscribers) {
        const result = await fanOutScenario(count, `fanout-${count}`);
        fanOut.push(result);
        console.log(
            `  fan-out: ${result.connected}/${count} subscriber(s) → ` +
                `${result.changedWrite.total} re-execution(s) after a changing write ` +
                `(${result.changedWrite.reexecutions.join("|")}), ` +
                `${result.unchangedWrite.total} after an identical write ` +
                `(${result.unchangedWrite.reexecutions.join("|")})` +
                (result.changedWrite.error ? ` [WRITE FAILED: ${result.changedWrite.error}]` : ""),
        );
    }

    const upload = await uploadScenario();
    console.log(`  upload: ${upload.presignOutcome}`);

    let checkout: { outcome: string } | undefined;
    if (args.includes("--checkout")) {
        checkout = await checkoutScenario();
        console.log(`  checkout: ${checkout.outcome}`);
    }

    const report: LoadMeasurementReport = {
        deployment: convexUrl,
        ranAt: new Date().toISOString(),
        subscribers,
        flows: summarize(),
        fanOut,
        notes: [
            "Call counts and payload bytes are client-observable: what the runner invoked and received.",
            "Billed usage lives in the Convex and Cloudflare dashboards, which no script in this repository can read.",
            "The upload flow stops at the storage bridge on staging (STORAGE_BRIDGE_URL unset): partial by construction.",
            "Flows with no Convex implementation yet (events, guests, RSVP, reminders) cannot be measured here at all.",
        ],
    };

    console.log("\nflow summary:");
    for (const [flow, entry] of Object.entries(report.flows)) {
        console.log(
            `  ${flow.padEnd(12)} calls=${String(entry.calls).padStart(2)} failed=${entry.failed} ` +
                `avgBytes=${entry.resultBytes} p50=${entry.p50Ms}ms p95=${entry.p95Ms}ms`,
        );
    }

    if (jsonPath) {
        writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
        console.log(`\nwrote ${jsonPath}`);
    }
}

await main();
