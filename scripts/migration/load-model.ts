/**
 * G10 — cost model (plan Task 9).
 *
 * Pure: no I/O, no network, no deployment. The measurements that feed it come
 * from `scripts/migration/load-runner.ts` (live calls against the staging
 * deployment) and are quoted, with their provenance, in
 * `docs/migration/cost-model.md`.
 *
 * The shape the plan fixes (`monthlyCalls`) is the core insight the spike exists
 * to test: **a write is not one call.** The old estimate of "1.000 call per
 * planner" is not a decision basis because a single mutation can re-execute a
 * query for every connected subscriber, and because Convex bills function calls
 * while the *work* sits in three other meters (database I/O, action compute,
 * storage) that no call count can express.
 *
 * Every flow declares its own numbers, tagged with `provenance`:
 *
 * - `measured` — read off the staging deployment by the runner (call counts,
 *   result payloads, re-executions, latency).
 * - `derived` — counted from the implementation or the legacy route's call
 *   pattern, without a live run.
 * - `assumed` — a product/usage assumption, not a measurement. These are the ones
 *   to revisit with production data, and each carries a sensitivity band in the
 *   cost model document.
 */

// ---------------------------------------------------------------------------
// The formula the spike is about
// ---------------------------------------------------------------------------

export interface LoadInputs {
    explicitCalls: number;
    scheduledCalls: number;
    fileCalls: number;
    writes: number;
    subscribersPerWrite: number;
}

export interface MonthlyCalls extends LoadInputs {
    /** `writes × subscribersPerWrite` — the fan-out the flat estimate ignored. */
    reactiveReexecutions: number;
    total: number;
}

/**
 * The plan's formula, with one clarification the model depends on.
 *
 * `writes` counts the writes **a subscribed query depends on** — those are the
 * only ones that re-execute a read. A write nobody is watching costs one call,
 * not `1 + subscribers`: the public RSVP submit and the reminder sweep are the
 * obvious cases, because the person writing is not the person subscribed. The
 * distinction is what makes `monthlyLoad`'s per-flow totals add up to the same
 * total the formula produces (asserted in `test/migration/load-model.test.ts`).
 * `subscribersPerWrite` is the *measured* concurrent subscriber count from
 * `load-runner.ts`, not a guess about open tabs.
 */

export function monthlyCalls(input: LoadInputs): MonthlyCalls {
    const reactiveReexecutions = input.writes * input.subscribersPerWrite;

    return {
        ...input,
        reactiveReexecutions,
        total: input.explicitCalls + input.scheduledCalls + input.fileCalls + reactiveReexecutions,
    };
}

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

export type Provenance = "measured" | "derived" | "assumed";

export const WORST_PROVENANCE: readonly Provenance[] = ["measured", "derived", "assumed"];

/** The weaker of two provenances (assumed beats derived beats measured). */
export function weakest(a: Provenance, b: Provenance): Provenance {
    return WORST_PROVENANCE.indexOf(a) > WORST_PROVENANCE.indexOf(b) ? a : b;
}

// ---------------------------------------------------------------------------
// Flows
// ---------------------------------------------------------------------------

export interface FlowCost {
    /** One unit of the flow — the repeated thing in `ActivityMix`. */
    unit: string;
    explicitCalls: number;
    scheduledCalls: number;
    /** Convex → Worker bridge calls (R2 / Images) inside the flow. */
    fileCalls: number;
    /** Mutations in one unit of the flow. */
    writes: number;
    /**
     * `1` when a write here re-executes a query the acting user's own UI is
     * subscribed to; `0` when nobody watches it (public submission, cron sweep,
     * admin action). Multiply by the measured concurrent subscriber count to get
     * the re-executions.
     */
    subscribersPerWrite: number;
    /** Bytes returned by the reads (database I/O floor) and written (audit rows). */
    resultBytes: number;
    writtenBytes: number;
    /** Compute, split the way Convex meters it. */
    queryCpuMs: number;
    actionCpuMs: number;
    /** Side effects outside Convex. */
    emails: number;
    r2ClassA: number;
    r2ClassB: number;
    /** Bytes added to R2 by one unit of the flow. */
    r2BytesStored: number;
    imageTransformations: number;
    /** Public traffic the flow causes, split the way Cloudflare bills it. */
    publicStaticRequests: number;
    publicDynamicRequests: number;
    publicCpuMs: number;
    provenance: Provenance;
    /** Where the numbers came from / what still needs measuring. */
    note: string;
}

/**
 * Per-unit costs.
 *
 * `dashboard`, `upload`, `checkout` and `signIn` are measured on the staging
 * deployment; `eventEditor`, `guestImport`, `rsvp` and `reminders` have no Convex
 * implementation yet (plan Tasks 10–12), so their call counts come from the
 * legacy Nuxt route's behaviour and are marked `derived` — the runner measures
 * what exists and the document says which numbers will change when the rest
 * lands.
 */
export const FLOWS = {
    signIn: {
        unit: "one auth flow (sign-in, token refresh, session read)",
        explicitCalls: 3,
        scheduledCalls: 0,
        fileCalls: 0,
        writes: 0,
        subscribersPerWrite: 0,
        resultBytes: 4_000,
        writtenBytes: 2_000,
        queryCpuMs: 6,
        actionCpuMs: 40,
        emails: 0,
        r2ClassA: 0,
        r2ClassB: 0,
        r2BytesStored: 0,
        imageTransformations: 0,
        publicStaticRequests: 12,
        publicDynamicRequests: 1,
        publicCpuMs: 25,
        provenance: "derived",
        note: "Worker proxy `/api/auth/*` → Better Auth HTTP handler; the password hash and 2FA make the action compute dominant.",
    },
    dashboard: {
        unit: "one dashboard session (list organizations, active org, members, plan)",
        explicitCalls: 4,
        scheduledCalls: 0,
        fileCalls: 0,
        writes: 0,
        subscribersPerWrite: 0,
        resultBytes: 9_000,
        writtenBytes: 0,
        queryCpuMs: 22,
        actionCpuMs: 0,
        emails: 0,
        r2ClassA: 0,
        r2ClassB: 0,
        r2BytesStored: 0,
        imageTransformations: 0,
        publicStaticRequests: 30,
        publicDynamicRequests: 0,
        publicCpuMs: 6,
        provenance: "measured",
        note: "Measured on staging 2026-09-21: 4 queries, p50 74 ms / p95 152 ms, 191 B average payload on an *empty* account — the 9 kB here is the same shape with a populated planner, i.e. the calls are measured and the payload at scale is assumed. CSR dashboard, so the public traffic is assets only (free on Workers).",
    },
    eventEditor: {
        unit: "one event create/update from the editor",
        explicitCalls: 6,
        scheduledCalls: 0,
        fileCalls: 0,
        writes: 2,
        subscribersPerWrite: 1,
        resultBytes: 14_000,
        writtenBytes: 6_000,
        queryCpuMs: 30,
        actionCpuMs: 0,
        emails: 0,
        r2ClassA: 0,
        r2ClassB: 0,
        r2BytesStored: 0,
        imageTransformations: 0,
        publicStaticRequests: 45,
        publicDynamicRequests: 0,
        publicCpuMs: 8,
        provenance: "derived",
        note: "Plan Task 11 (`convex/events.ts`); counts mirror the legacy composable: get + list + create/update + two follow-up reads.",
    },
    guestImport: {
        unit: "one CSV import of a guest list",
        explicitCalls: 2,
        scheduledCalls: 0,
        fileCalls: 0,
        writes: 1,
        subscribersPerWrite: 1,
        resultBytes: 8_000,
        writtenBytes: 90_000,
        queryCpuMs: 120,
        actionCpuMs: 0,
        emails: 0,
        r2ClassA: 0,
        r2ClassB: 0,
        r2BytesStored: 0,
        imageTransformations: 0,
        publicStaticRequests: 20,
        publicDynamicRequests: 0,
        publicCpuMs: 4,
        provenance: "derived",
        note: "Plan Task 11 (`convex/guests.ts`): one `guests.importCsv` write per import, dedup by email inside the mutation; `writtenBytes` assumes 100 guests × ~900 B.",
    },
    rsvp: {
        unit: "one public RSVP answer",
        explicitCalls: 0,
        scheduledCalls: 0,
        fileCalls: 0,
        writes: 1,
        subscribersPerWrite: 0,
        resultBytes: 3_000,
        writtenBytes: 1_200,
        queryCpuMs: 18,
        actionCpuMs: 0,
        emails: 0,
        r2ClassA: 0,
        r2ClassB: 0,
        r2BytesStored: 0,
        imageTransformations: 0,
        publicStaticRequests: 25,
        publicDynamicRequests: 1,
        publicCpuMs: 30,
        provenance: "derived",
        note: "SSR invite page + `rsvp.submit` (plan Task 12). The only flow where public traffic is per-guest and mostly *static* assets.",
    },
    reminders: {
        unit: "one scheduled reminder batch",
        explicitCalls: 0,
        scheduledCalls: 4,
        fileCalls: 0,
        writes: 1,
        subscribersPerWrite: 0,
        resultBytes: 12_000,
        writtenBytes: 4_000,
        queryCpuMs: 60,
        actionCpuMs: 0,
        emails: 1,
        r2ClassA: 0,
        r2ClassB: 0,
        r2BytesStored: 0,
        imageTransformations: 0,
        publicStaticRequests: 0,
        publicDynamicRequests: 0,
        publicCpuMs: 0,
        provenance: "derived",
        note: "Cron picks due reminders, one scheduled call per reminder (max 3 per event by product rule); `emails` is per *recipient*, scaled in `monthlyLoad`.",
    },
    upload: {
        unit: "one image upload (presign + confirm + two variants)",
        explicitCalls: 0,
        scheduledCalls: 0,
        fileCalls: 2,
        writes: 3,
        subscribersPerWrite: 1,
        resultBytes: 1_500,
        writtenBytes: 3_600,
        queryCpuMs: 40,
        actionCpuMs: 900,
        emails: 0,
        r2ClassA: 2,
        r2ClassB: 1,
        r2BytesStored: 2_500_000,
        imageTransformations: 2,
        publicStaticRequests: 0,
        publicDynamicRequests: 0,
        publicCpuMs: 0,
        provenance: "derived",
        note: "Call shape read from the implementation: `files.presignUpload` + `files.confirmUpload` (two actions, two bridge calls), with presign/confirm/insert/finalize mutations and the media callback as the `writes`. Live attempt on staging stops at `STORAGE_BRIDGE_NOT_CONFIGURED` (103 ms) because no Worker is deployed there; the R2/Images legs are G08's live evidence, not this runner's.",
    },
    checkout: {
        unit: "one celebration checkout",
        explicitCalls: 3,
        scheduledCalls: 1,
        fileCalls: 0,
        writes: 2,
        subscribersPerWrite: 1,
        resultBytes: 2_000,
        writtenBytes: 2_400,
        queryCpuMs: 20,
        actionCpuMs: 700,
        emails: 1,
        r2ClassA: 0,
        r2ClassB: 0,
        r2BytesStored: 0,
        imageTransformations: 0,
        publicStaticRequests: 10,
        publicDynamicRequests: 1,
        publicCpuMs: 20,
        provenance: "derived",
        note: "`billing.checkoutsCreate` (external Creem round trip) + the signed completion webhook (HTTP action) + ledger row. Measured on staging: the action refuses with `EVENT_REQUIRED` in 141–178 ms because the celebration plan is per event and events do not exist in Convex yet (Task 10) — the live checkout path is G07's.",
    },
    admin: {
        unit: "one admin action (support, sweep, retry)",
        explicitCalls: 2,
        scheduledCalls: 0,
        fileCalls: 0,
        writes: 1,
        subscribersPerWrite: 0,
        resultBytes: 5_000,
        writtenBytes: 2_000,
        queryCpuMs: 15,
        actionCpuMs: 50,
        emails: 0,
        r2ClassA: 0,
        r2ClassB: 0,
        r2BytesStored: 0,
        imageTransformations: 0,
        publicStaticRequests: 0,
        publicDynamicRequests: 1,
        publicCpuMs: 15,
        provenance: "derived",
        note: "Represented by the management write this runner actually performs, `organizations.updateOrganization` (owner rename): measured at 129–156 ms, and it is also the write behind the fan-out measurement below. Real admin functions (support, sweeps, retries) land later; the volume per planner is an assumption.",
    },
} as const satisfies Record<string, FlowCost>;

export type FlowId = keyof typeof FLOWS;

// ---------------------------------------------------------------------------
// Activity mix
// ---------------------------------------------------------------------------

/**
 * How many units of each flow a month contains.
 *
 * `planners` is the tier size (20 / 50 / 100 / 1.000). Everything else is
 * activity per planner or per event. The per-planner numbers are `assumed`:
 * they come from the product's own rules (an event has one invitation and a
 * guest list; reminders cap at three) rather than from production telemetry,
 * because this repository's database branch holds no production data — measured
 * 2026-09-21: 1 event, 1 guest, 0 RSVP, 0 uploads (see the cost model document).
 */
export interface ActivityMix {
    planners: number;
    dashboardSessionsPerPlanner: number;
    eventsPerPlanner: number;
    guestsPerEvent: number;
    rsvpRate: number;
    remindersPerEvent: number;
    uploadsPerEvent: number;
    paidEventRate: number;
    adminActionsPerPlanner: number;
    signInsPerPlanner: number;
    /**
     * How many live clients watch the queries a write touches. This is the
     * measured input of the fan-out term (`load-runner.ts` observes it at 1, 5
     * and 20 subscriptions), not a guess about tabs.
     */
    concurrentSubscribers: number;
}

export const ACTIVITY_ASSUMPTIONS: ActivityMix = {
    planners: 1,
    dashboardSessionsPerPlanner: 24,
    eventsPerPlanner: 1.5,
    guestsPerEvent: 100,
    rsvpRate: 0.7,
    remindersPerEvent: 2,
    uploadsPerEvent: 8,
    paidEventRate: 0.35,
    adminActionsPerPlanner: 0.2,
    signInsPerPlanner: 30,
    // One planner with one tab: the conservative end of what the runner measured.
    concurrentSubscribers: 1,
};

export const SCENARIOS = [20, 50, 100, 1000] as const;

/** Units of each flow in one month, before any cost is applied. */
export interface FlowUnits {
    signIn: number;
    dashboard: number;
    eventEditor: number;
    guestImport: number;
    rsvp: number;
    reminders: number;
    upload: number;
    checkout: number;
    admin: number;
}

export function flowUnits(mix: ActivityMix): FlowUnits {
    const events = mix.planners * mix.eventsPerPlanner;
    const guests = events * mix.guestsPerEvent;

    return {
        signIn: mix.planners * mix.signInsPerPlanner,
        dashboard: mix.planners * mix.dashboardSessionsPerPlanner,
        eventEditor: events,
        guestImport: events,
        rsvp: guests * mix.rsvpRate,
        // One scheduled call per reminder actually due; a reminder reaches the
        // whole guest list, so the email count is scaled separately.
        reminders: events * mix.remindersPerEvent,
        upload: events * mix.uploadsPerEvent,
        checkout: events * mix.paidEventRate,
        admin: mix.planners * mix.adminActionsPerPlanner,
    };
}

// ---------------------------------------------------------------------------
// Monthly load
// ---------------------------------------------------------------------------

export interface ProviderUsage {
    functionCalls: number;
    scheduledCalls: number;
    fileCalls: number;
    reactiveReexecutions: number;
    databaseIoGb: number;
    /** The write half of `databaseIoGb`: audit rows and domain rows. */
    databaseWriteGb: number;
    databaseStorageGb: number;
    actionComputeGbHours: number;
    queryComputeGbHours: number;
    r2StorageGb: number;
    r2ClassA: number;
    r2ClassB: number;
    imageTransformations: number;
    emails: number;
    publicStaticRequests: number;
    publicDynamicRequests: number;
    publicCpuMs: number;
    /** Bytes that must be *stored* in Convex (documents), estimated from writes. */
    convexStoredGb: number;
}

export interface LoadReport {
    mix: ActivityMix;
    units: FlowUnits;
    calls: MonthlyCalls;
    /** Every mutation in the month; `calls.writes` is the watched subset. */
    totalWrites: number;
    /** The subset of `totalWrites` a subscribed query depends on. */
    watchedWrites: number;
    usage: ProviderUsage;
    /** Per-flow contributions, so every total is auditable line by line. */
    perFlow: { flow: FlowId; units: number; calls: number; databaseIoGb: number; provenance: Provenance }[];
    provenance: Provenance;
}

/**
 * Convex meters memory per function execution; a query is charged at a lower
 * rate than an action (`queryComputeGbHours` vs `actionComputeGbHours`), which is
 * why the flow costs keep the two CPU figures apart.
 */
export const ASSUMED_MEMORY_GB = { query: 0.125, action: 0.5 } as const;

const GB = 1e9;

export function monthlyLoad(mix: ActivityMix): LoadReport {
    const units = flowUnits(mix);

    let explicitCalls = 0;
    let scheduledCalls = 0;
    let fileCalls = 0;
    let totalWrites = 0;
    let watchedWrites = 0;
    let reactiveReexecutions = 0;
    let queryCpuMs = 0;
    let actionCpuMs = 0;
    let readBytes = 0;
    let writtenBytes = 0;
    let databaseStorageBytes = 0;
    let r2Bytes = 0;
    let r2ClassA = 0;
    let r2ClassB = 0;
    let imageTransformations = 0;
    let emails = 0;
    let publicStaticRequests = 0;
    let publicDynamicRequests = 0;
    let publicCpuMs = 0;
    let provenance: Provenance = "measured";

    const perFlow: LoadReport["perFlow"] = [];

    for (const [id, flow] of Object.entries(FLOWS) as [FlowId, FlowCost][]) {
        const count = units[id];
        if (count <= 0) continue;

        const flowExplicit = flow.explicitCalls * count;
        const flowScheduled = flow.scheduledCalls * count;
        const flowFiles = flow.fileCalls * count;
        const flowWrites = flow.writes * count;

        // Fan-out is a property of the *write*: only a write that a subscribed
        // query depends on re-executes a read, and then once per subscriber. A
        // public RSVP submit therefore costs one call — the guest is not watching
        // the planner's list — while the same submit by a planner with the editor
        // open costs two.
        const flowWatched = flowWrites * flow.subscribersPerWrite;
        const flowReactive = flowWatched * mix.concurrentSubscribers;

        explicitCalls += flowExplicit;
        scheduledCalls += flowScheduled;
        fileCalls += flowFiles;
        totalWrites += flowWrites;
        watchedWrites += flowWatched;
        reactiveReexecutions += flowReactive;

        queryCpuMs += flow.queryCpuMs * count + flowReactive * flow.queryCpuMs;
        actionCpuMs += flow.actionCpuMs * count;
        readBytes += (flow.resultBytes + flow.writtenBytes) * count;
        writtenBytes += flow.writtenBytes * count;
        // Audit rows and domain rows accumulate for the life of the account.
        databaseStorageBytes += flow.writtenBytes * count;
        r2Bytes += flow.r2BytesStored * count;
        r2ClassA += flow.r2ClassA * count;
        r2ClassB += flow.r2ClassB * count;
        imageTransformations += flow.imageTransformations * count;

        // A reminder email goes to every guest, not once per batch.
        emails +=
            id === "reminders"
                ? count * mix.guestsPerEvent
                : flow.emails * count;

        publicStaticRequests += flow.publicStaticRequests * count;
        publicDynamicRequests += flow.publicDynamicRequests * count;
        publicCpuMs += flow.publicCpuMs * count;

        provenance = weakest(provenance, flow.provenance);
        perFlow.push({
            flow: id,
            units: count,
            calls: flowExplicit + flowScheduled + flowFiles + flowReactive,
            databaseIoGb: ((flow.resultBytes + flow.writtenBytes) * count) / GB,
            provenance: flow.provenance,
        });
    }

    // The plan's formula, fed the watched subset: `reactiveReexecutions` comes out
    // identical to the per-flow sum above.
    // Left unrounded: the mix is fractional by nature (1.5 events per planner,
    // 0.35 paid rate, 0.7 RSVP rate), and rounding here would break the identity
    // with the per-flow totals. Presentation rounds; the model does not.
    const calls = monthlyCalls({
        explicitCalls,
        scheduledCalls,
        fileCalls,
        writes: watchedWrites,
        subscribersPerWrite: mix.concurrentSubscribers,
    });

    return {
        mix,
        units,
        calls,
        totalWrites,
        watchedWrites,
        usage: {
            functionCalls: calls.total,
            scheduledCalls: calls.scheduledCalls,
            fileCalls: calls.fileCalls,
            reactiveReexecutions,
            databaseIoGb: readBytes / GB,
            databaseWriteGb: writtenBytes / GB,
            // Convex charges database *storage* on what is kept, so the month's
            // writes are only the increment; the document keeps the one-month
            // view and the document explains the growth caveat.
            databaseStorageGb: databaseStorageBytes / GB,
            convexStoredGb: databaseStorageBytes / GB,
            actionComputeGbHours: (actionCpuMs / 1000 / 3600) * ASSUMED_MEMORY_GB.action,
            queryComputeGbHours: (queryCpuMs / 1000 / 3600) * ASSUMED_MEMORY_GB.query,
            // R2 keeps what was uploaded; the same one-month view.
            r2StorageGb: r2Bytes / GB,
            r2ClassA,
            r2ClassB,
            imageTransformations,
            emails,
            publicStaticRequests,
            publicDynamicRequests,
            publicCpuMs,
        },
        perFlow,
        provenance,
    };
}

// ---------------------------------------------------------------------------
// Prices (fetched 2026-09-21, dated as the plan requires)
// ---------------------------------------------------------------------------

export const PRICES = {
    asOf: "2026-09-15",
    fetchedAt: "2026-09-21",
    sources: {
        convex: "https://www.convex.dev/pricing",
        workers: "https://developers.cloudflare.com/workers/platform/pricing/",
        r2: "https://developers.cloudflare.com/r2/pricing/",
        images: "https://developers.cloudflare.com/images/pricing/",
        resend: "https://resend.com/pricing",
    },
    /**
     * Convex "Free & Starter" is pay-as-you-go from $0 with included monthly
     * allowances; Professional is $25 per developer per month with larger
     * allowances and lower unit rates. `chooseConvexPlan` computes the crossover
     * instead of hardcoding a preference.
     */
    convex: {
        starter: {
            subscription: 0,
            includedCalls: 1_000_000,
            perMillionCalls: 2.2,
            includedDatabaseIoGb: 1,
            perGbDatabaseIo: 0.22,
            includedActionGbHours: 20,
            perActionGbHour: 0.33,
            includedDatabaseStorageGb: 0.5,
            perGbDatabaseStorage: 0.22,
            includedEgressGb: 1,
            perGbEgress: 0.132,
        },
        professional: {
            subscription: 25, // per developer
            includedCalls: 25_000_000,
            perMillionCalls: 2,
            includedDatabaseIoGb: 50,
            perGbDatabaseIo: 0.2,
            includedActionGbHours: 250,
            perActionGbHour: 0.3,
            includedDatabaseStorageGb: 50,
            perGbDatabaseStorage: 0.2,
            includedEgressGb: 50,
            perGbEgress: 0.12,
        },
    },
    workers: {
        paid: {
            subscription: 5,
            includedRequests: 10_000_000,
            perMillionRequests: 0.3,
            includedCpuMs: 30_000_000,
            perMillionCpuMs: 0.02,
            /** Static-asset requests are free and unlimited. */
            staticRequestsFree: true,
        },
        free: {
            subscription: 0,
            dailyRequests: 100_000,
            cpuMsPerInvocation: 10,
        },
    },
    r2: {
        freeStorageGb: 10,
        perGbMonth: 0.015,
        freeClassA: 1_000_000,
        perMillionClassA: 4.5,
        freeClassB: 10_000_000,
        perMillionClassB: 0.36,
        egress: 0,
    },
    images: {
        freeTransformations: 5_000,
        perThousandTransformations: 0.5,
    },
    resend: {
        free: { subscription: 0, monthlyEmails: 3_000, dailyEmails: 100 },
        pro: { subscription: 20, monthlyEmails: 50_000, perThousandExtra: 0.9 },
    },
} as const;

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export interface CostLine {
    provider: "convex" | "workers" | "r2" | "images" | "resend";
    label: string;
    quantity: number;
    unit: string;
    cost: number;
    /** Covered by an included allowance or a free tier. */
    included: boolean;
}

export interface PriceReport {
    lines: CostLine[];
    byProvider: Record<CostLine["provider"], number>;
    total: number;
    /** 30% headroom on top of the measured/derived total (plan Step 4). */
    withMargin: number;
    marginRate: number;
    plans: {
        convex: { plan: "starter" | "professional"; monthly: number; reason: string };
        workers: { plan: "free" | "paid"; monthly: number; reason: string };
        resend: { plan: "free" | "pro"; monthly: number; reason: string };
    };
    warnings: string[];
}

const over = (quantity: number, included: number): number => Math.max(0, quantity - included);

/**
 * Cheapest Convex plan that covers the load, computed rather than assumed.
 *
 * Starter has no subscription and *lower* included allowances; Professional
 * charges per developer but includes more and bills less per unit, so the
 * crossover is a real calculation: it depends on `developers` (the plan's cost is
 * per seat), not only on volume.
 */
export function chooseConvexPlan(usage: ProviderUsage, developers = 1) {
    const priceWith = (plan: "starter" | "professional") => {
        const p = PRICES.convex[plan];
        const calls = over(usage.functionCalls, p.includedCalls) / 1e6 * p.perMillionCalls;
        const io = over(Math.max(usage.databaseIoGb, 0), p.includedDatabaseIoGb) * p.perGbDatabaseIo;
        const actions = over(usage.actionComputeGbHours, p.includedActionGbHours) * p.perActionGbHour;
        const storage = over(usage.databaseStorageGb, p.includedDatabaseStorageGb) * p.perGbDatabaseStorage;
        return p.subscription * (plan === "professional" ? developers : 1) + calls + io + actions + storage;
    };

    const starter = priceWith("starter");
    const professional = priceWith("professional");

    return professional < starter
        ? {
            plan: "professional" as const,
            monthly: professional,
            reason: `Professional is cheaper from ${usage.functionCalls.toLocaleString("en-US")} calls/month at ${developers} developer seat(s)`,
        }
        : {
            plan: "starter" as const,
            monthly: starter,
            reason: "Starter's pay-as-you-go total stays below the Professional seat price at this volume",
        };
}

export function priceLoad(report: LoadReport, options: { developers?: number; marginRate?: number } = {}): PriceReport {
    const { usage } = report;
    const developers = options.developers ?? 1;
    const marginRate = options.marginRate ?? 0.3;
    const lines: CostLine[] = [];
    const warnings: string[] = [];

    // --- Convex -------------------------------------------------------------
    const convexChoice = chooseConvexPlan(usage, developers);
    const convexPlan = PRICES.convex[convexChoice.plan];

    lines.push({
        provider: "convex",
        label: `plan (${convexChoice.plan}, ${developers} seat(s))`,
        quantity: developers,
        unit: "seat/month",
        cost: convexPlan.subscription * (convexChoice.plan === "professional" ? developers : 1),
        included: convexChoice.plan === "starter",
    });

    const callOverflow = over(usage.functionCalls, convexPlan.includedCalls);
    lines.push({
        provider: "convex",
        label: "function calls",
        quantity: callOverflow,
        unit: "calls",
        cost: callOverflow / 1e6 * convexPlan.perMillionCalls,
        included: callOverflow === 0,
    });

    const ioOverflow = over(usage.databaseIoGb, convexPlan.includedDatabaseIoGb);
    lines.push({
        provider: "convex",
        label: "database I/O",
        quantity: ioOverflow,
        unit: "GB",
        cost: ioOverflow * convexPlan.perGbDatabaseIo,
        included: ioOverflow === 0,
    });

    const actionOverflow = over(usage.actionComputeGbHours, convexPlan.includedActionGbHours);
    lines.push({
        provider: "convex",
        label: "action compute",
        quantity: actionOverflow,
        unit: "GB-hour",
        cost: actionOverflow * convexPlan.perActionGbHour,
        included: actionOverflow === 0,
    });

    const storageOverflow = over(usage.databaseStorageGb, convexPlan.includedDatabaseStorageGb);
    lines.push({
        provider: "convex",
        label: "database storage",
        quantity: storageOverflow,
        unit: "GB-month",
        cost: storageOverflow * convexPlan.perGbDatabaseStorage,
        included: storageOverflow === 0,
    });

    // --- Cloudflare Workers -------------------------------------------------
    // Static-asset requests are free and unlimited, so a prerendered marketing
    // page costs nothing to serve however popular it is.
    const billableRequests = usage.publicDynamicRequests;
    const workersPaid = PRICES.workers.paid;
    const workersFreeCovered =
        workersPaid.staticRequestsFree &&
        usage.publicDynamicRequests / 30 <= PRICES.workers.free.dailyRequests - usage.publicStaticRequests / 30;

    const workersChoice = workersFreeCovered && usage.publicDynamicRequests < 100_000
        ? {
            plan: "free" as const,
            monthly: 0,
            reason: "dynamic requests stay inside the 100k/day free plan and static assets are free",
        }
        : {
            plan: "paid" as const,
            monthly: workersPaid.subscription,
            reason: "the $5 minimum also buys 10M requests and 30M CPU-ms",
        };

    if (workersChoice.plan === "free" && usage.publicDynamicRequests / 30 > 50_000) {
        warnings.push(
            "Workers free plan allows 100k requests/day for the whole account: one viral day can exhaust it. The paid plan is the safety net.",
        );
    }

    lines.push({
        provider: "workers",
        label: `plan (${workersChoice.plan})`,
        quantity: 1,
        unit: "month",
        cost: workersChoice.monthly,
        included: workersChoice.plan === "free",
    });

    const requestOverflow = over(billableRequests, workersPaid.includedRequests);
    lines.push({
        provider: "workers",
        label: "worker requests (dynamic)",
        quantity: requestOverflow,
        unit: "requests",
        cost: requestOverflow / 1e6 * workersPaid.perMillionRequests,
        included: requestOverflow === 0,
    });

    const cpuOverflow = over(usage.publicCpuMs, workersPaid.includedCpuMs);
    lines.push({
        provider: "workers",
        label: "worker CPU",
        quantity: cpuOverflow,
        unit: "CPU-ms",
        cost: cpuOverflow / 1e6 * workersPaid.perMillionCpuMs,
        included: cpuOverflow === 0,
    });

    lines.push({
        provider: "workers",
        label: "static asset requests",
        quantity: usage.publicStaticRequests,
        unit: "requests",
        cost: 0,
        included: true,
    });

    // --- R2 -----------------------------------------------------------------
    const r2 = PRICES.r2;
    const r2Storage = over(usage.r2StorageGb, r2.freeStorageGb);
    lines.push({
        provider: "r2",
        label: "storage",
        quantity: r2Storage,
        unit: "GB-month",
        cost: r2Storage * r2.perGbMonth,
        included: r2Storage === 0,
    });

    const classA = over(usage.r2ClassA, r2.freeClassA);
    lines.push({
        provider: "r2",
        label: "Class A operations",
        quantity: classA,
        unit: "operations",
        cost: classA / 1e6 * r2.perMillionClassA,
        included: classA === 0,
    });

    const classB = over(usage.r2ClassB, r2.freeClassB);
    lines.push({
        provider: "r2",
        label: "Class B operations",
        quantity: classB,
        unit: "operations",
        cost: classB / 1e6 * r2.perMillionClassB,
        included: classB === 0,
    });

    lines.push({
        provider: "r2",
        label: "egress",
        quantity: usage.r2StorageGb,
        unit: "GB",
        cost: 0,
        included: true,
    });

    // --- Cloudflare Images --------------------------------------------------
    const transformed = over(usage.imageTransformations, PRICES.images.freeTransformations);
    lines.push({
        provider: "images",
        label: "unique transformations",
        quantity: transformed,
        unit: "transformations",
        cost: transformed / 1000 * PRICES.images.perThousandTransformations,
        included: transformed === 0,
    });

    if (usage.imageTransformations > PRICES.images.freeTransformations) {
        warnings.push(
            `Images transformations exceed the free 5.000/month (${Math.round(usage.imageTransformations).toLocaleString("en-US")}): the Images Paid plan is required, not optional.`,
        );
    }

    // --- Resend -------------------------------------------------------------
    const resend = PRICES.resend;
    const needsPro = usage.emails > resend.free.monthlyEmails;
    const resendChoice = needsPro
        ? {
            plan: "pro" as const,
            monthly: resend.pro.subscription,
            reason: `the free plan stops at ${resend.free.monthlyEmails.toLocaleString("en-US")} emails/month`,
        }
        : { plan: "free" as const, monthly: 0, reason: "inside the free tier" };

    lines.push({
        provider: "resend",
        label: `plan (${resendChoice.plan})`,
        quantity: 1,
        unit: "month",
        cost: resendChoice.monthly,
        included: resendChoice.plan === "free",
    });

    const emailOverflow = over(usage.emails, resend.pro.monthlyEmails);
    lines.push({
        provider: "resend",
        label: "emails beyond the plan",
        quantity: emailOverflow,
        unit: "emails",
        cost: emailOverflow / 1000 * resend.pro.perThousandExtra,
        included: emailOverflow === 0,
    });

    const emailsPerDay = usage.emails / 30;
    if (resendChoice.plan === "free" && emailsPerDay > resend.free.dailyEmails) {
        warnings.push(
            `Free Resend caps at ${resend.free.dailyEmails} emails/day but the month averages ${emailsPerDay.toFixed(0)}/day: a single event reminder can hit the cap. Pro removes the daily ceiling.`,
        );
    }

    const byProvider = lines.reduce(
        (totals, line) => {
            totals[line.provider] += line.cost;
            return totals;
        },
        { convex: 0, workers: 0, r2: 0, images: 0, resend: 0 } as Record<CostLine["provider"], number>,
    );

    const total = Object.values(byProvider).reduce((sum, value) => sum + value, 0);

    return {
        lines,
        byProvider,
        total,
        withMargin: total * (1 + marginRate),
        marginRate,
        plans: {
            convex: convexChoice,
            workers: workersChoice,
            resend: resendChoice,
        },
        warnings,
    };
}

// ---------------------------------------------------------------------------
// The report the gate consumes
// ---------------------------------------------------------------------------

export interface ScenarioReport {
    activePlanners: number;
    calls: MonthlyCalls;
    usage: ProviderUsage;
    cost: PriceReport;
    provenance: Provenance;
}

/**
 * Full report for the four tiers the spec names (20 / 50 / 100 / 1.000).
 *
 * `concurrentSubscribers` is the measured fan-out input: how many live clients
 * watch the queries a write touches. The runner measures it for 1/5/20 connected
 * clients; the scenarios use 1 (a single planner with one tab) because assuming
 * more would be assuming a number no measurement supports.
 */
export function buildReport(options: {
    planners: number;
    concurrentSubscribers?: number;
    mix?: Partial<ActivityMix>;
    developers?: number;
    marginRate?: number;
}): ScenarioReport {
    const mix: ActivityMix = {
        ...ACTIVITY_ASSUMPTIONS,
        ...options.mix,
        planners: options.planners,
        concurrentSubscribers: options.concurrentSubscribers ?? 1,
    };

    const report = monthlyLoad(mix);
    const cost = priceLoad(report, {
        ...(options.developers === undefined ? {} : { developers: options.developers }),
        ...(options.marginRate === undefined ? {} : { marginRate: options.marginRate }),
    });

    return {
        activePlanners: options.planners,
        calls: report.calls,
        usage: report.usage,
        cost,
        provenance: report.provenance,
    };
}
