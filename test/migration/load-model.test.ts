import { describe, expect, it } from "vitest";
import {
    ACTIVITY_ASSUMPTIONS,
    FLOWS,
    PRICES,
    SCENARIOS,
    buildReport,
    chooseConvexPlan,
    monthlyCalls,
    monthlyLoad,
    weakest,
} from "../../scripts/migration/load-model";

/**
 * G10 — the economic model (plan Task 9).
 *
 * The point of these cases is to fail when the model drifts into the thing the
 * spec forbids: a flat "cost per planner" that ignores fan-out, or a tier chosen
 * by taste rather than by arithmetic. Everything here is pure: no deployment, no
 * network, no clock.
 */

describe("monthlyCalls", () => {
    it("counts reactive fan-out instead of flat calls per planner", () => {
        const result = monthlyCalls({
            explicitCalls: 100,
            scheduledCalls: 20,
            fileCalls: 10,
            writes: 30,
            subscribersPerWrite: 4,
        });

        expect(result.reactiveReexecutions).toBe(120);
        expect(result.total).toBe(250);
    });

    it("is linear in the fan-out, which is what makes the estimate honest", () => {
        const base = { explicitCalls: 0, scheduledCalls: 0, fileCalls: 0, writes: 10 };

        expect(monthlyCalls({ ...base, subscribersPerWrite: 0 }).total).toBe(0);
        expect(monthlyCalls({ ...base, subscribersPerWrite: 1 }).total).toBe(10);
        expect(monthlyCalls({ ...base, subscribersPerWrite: 20 }).total).toBe(200);
    });

    it("never hides a term: the total is the sum of the four", () => {
        const result = monthlyCalls({
            explicitCalls: 7,
            scheduledCalls: 3,
            fileCalls: 2,
            writes: 5,
            subscribersPerWrite: 3,
        });

        expect(result.total).toBe(
            result.explicitCalls + result.scheduledCalls + result.fileCalls + result.reactiveReexecutions,
        );
    });
});

describe("flow costs", () => {
    it("tags every flow with its provenance and a note", () => {
        for (const [id, flow] of Object.entries(FLOWS)) {
            expect(flow.note, `${id} must say where its numbers come from`).toBeTruthy();
            expect(["measured", "derived", "assumed"], `${id} provenance`).toContain(flow.provenance);
            expect(flow.explicitCalls + flow.scheduledCalls + flow.fileCalls + flow.writes, `${id} cost`).toBeGreaterThan(
                0,
            );
        }
    });

    it("keeps the flows the plan names, and no flat per-planner constant", () => {
        expect(Object.keys(FLOWS).sort()).toEqual(
            ["admin", "checkout", "dashboard", "eventEditor", "guestImport", "reminders", "rsvp", "signIn", "upload"].sort(),
        );
    });

    it("reports the weakest provenance in the chain", () => {
        expect(weakest("measured", "measured")).toBe("measured");
        expect(weakest("measured", "derived")).toBe("derived");
        expect(weakest("derived", "assumed")).toBe("assumed");
        expect(weakest("assumed", "measured")).toBe("assumed");
    });
});

describe("monthlyLoad", () => {
    it("scales with the tier and keeps every total auditable per flow", () => {
        const twenty = monthlyLoad({ ...ACTIVITY_ASSUMPTIONS, planners: 20 });
        const thousand = monthlyLoad({ ...ACTIVITY_ASSUMPTIONS, planners: 1000 });

        expect(twenty.calls.total).toBeGreaterThan(0);
        // 50× the planners, 50× the volume: neither more (hidden fixed costs) nor
        // less (hidden economies) at this stage of the model. (The totals are
        // integers, so the ratio carries the rounding of two terms.)
        expect(thousand.calls.total / twenty.calls.total).toBeCloseTo(50, 0);
        expect(Math.abs(thousand.calls.total - twenty.calls.total * 50)).toBeLessThan(100);

        // Every euro and every call is attributable to a flow: the per-flow totals
        // are the same number as the aggregate (the identity the global formula
        // could hide).
        const summed = twenty.perFlow.reduce((total, entry) => total + entry.calls, 0);
        expect(summed).toBeCloseTo(twenty.calls.total, 6);
    });

    it("counts fan-out where the flow declares subscribers", () => {
        const single = monthlyLoad({ ...ACTIVITY_ASSUMPTIONS, planners: 50, concurrentSubscribers: 1 });
        const many = monthlyLoad({ ...ACTIVITY_ASSUMPTIONS, planners: 50, concurrentSubscribers: 5 });

        const writes = single.calls.writes;
        expect(writes).toBeGreaterThan(0);
        expect(many.calls.reactiveReexecutions).toBe(writes * 5);
        expect(many.calls.total - single.calls.total).toBe(many.calls.reactiveReexecutions - writes * 1);
    });

    it("sends one reminder email per guest, not one per batch", () => {
        const report = monthlyLoad({ ...ACTIVITY_ASSUMPTIONS, planners: 20 });
        const events = 20 * ACTIVITY_ASSUMPTIONS.eventsPerPlanner;
        const reminders = events * ACTIVITY_ASSUMPTIONS.remindersPerEvent;
        const checkoutConfirmations = events * ACTIVITY_ASSUMPTIONS.paidEventRate;

        expect(report.units.reminders).toBeCloseTo(reminders, 6);
        // Reminders dominate by two orders of magnitude; the only other email is
        // the checkout confirmation.
        expect(report.usage.emails).toBeCloseTo(
            reminders * ACTIVITY_ASSUMPTIONS.guestsPerEvent + checkoutConfirmations,
            6,
        );
    });

    it("charges static asset requests at zero on Workers", () => {
        const report = monthlyLoad({ ...ACTIVITY_ASSUMPTIONS, planners: 1000 });
        const priced = buildReport({ planners: 1000 });

        expect(report.usage.publicStaticRequests).toBeGreaterThan(0);
        const staticLine = priced.cost.lines.find((line) => line.label === "static asset requests");
        expect(staticLine?.cost).toBe(0);
    });
});

describe("plan choice", () => {
    it("keeps every modelled tier inside the included allowances", () => {
        // The measured finding the document leads with: even at 1.000 planners the
        // Convex bill is inside Starter's monthly allowances, because the volume is
        // per-organization activity and not per-guest fan-out.
        for (const planners of SCENARIOS) {
            const report = monthlyLoad({ ...ACTIVITY_ASSUMPTIONS, planners });
            expect(report.usage.functionCalls).toBeLessThan(PRICES.convex.starter.includedCalls);
            expect(chooseConvexPlan(report.usage, 1).plan).toBe("starter");
        }
    });

    it("switches to Professional once the volume outgrows the free allowance", () => {
        const base = monthlyLoad({ ...ACTIVITY_ASSUMPTIONS, planners: 1000 }).usage;
        const crosses = (calls: number) => chooseConvexPlan({ ...base, functionCalls: calls }, 1);

        expect(crosses(500_000).plan).toBe("starter");
        expect(crosses(30_000_000).plan).toBe("professional");

        // Monotonic: once the seat is worth it, more volume never makes Starter
        // cheaper again.
        let seenProfessional = false;
        for (let calls = 500_000; calls <= 40_000_000; calls += 500_000) {
            const plan = crosses(calls).plan;
            if (plan === "professional") seenProfessional = true;
            else expect(seenProfessional, `Starter reappears at ${calls} calls`).toBe(false);
        }
        expect(seenProfessional).toBe(true);

        // The plan price is per seat, so the crossover depends on the team size.
        expect(crosses(30_000_000).monthly).toBeLessThan(chooseConvexPlan({ ...base, functionCalls: 30_000_000 }, 10).monthly);
    });

    it("prices every tier the spec names, with a 30% margin", () => {
        for (const planners of SCENARIOS) {
            const report = buildReport({ planners });

            expect(report.calls.total).toBeGreaterThan(0);
            expect(report.cost.total).toBeGreaterThanOrEqual(0);
            expect(report.cost.withMargin).toBeCloseTo(report.cost.total * 1.3, 6);
            expect(report.cost.byProvider.convex).toBeGreaterThanOrEqual(0);
            expect(Object.keys(report.cost.byProvider).sort()).toEqual(
                ["convex", "images", "r2", "resend", "workers"].sort(),
            );
        }
    });

    it("is monotonic in the tier size", () => {
        const totals = SCENARIOS.map((planners) => buildReport({ planners }).cost.withMargin);

        for (let index = 1; index < totals.length; index += 1) {
            expect(totals[index]!).toBeGreaterThanOrEqual(totals[index - 1]!);
        }
    });

    it("dates its prices instead of quoting them as timeless", () => {
        expect(PRICES.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(PRICES.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(Object.keys(PRICES.sources).sort()).toEqual(["convex", "images", "r2", "resend", "workers"]);
    });

    it("drops the plan subscription when an allowance covers the usage", () => {
        const tiny = buildReport({ planners: 20, mix: { eventsPerPlanner: 0, uploadsPerEvent: 0, dashboardSessionsPerPlanner: 0, signInsPerPlanner: 0, adminActionsPerPlanner: 0 } });

        expect(tiny.calls.total).toBe(0);
        expect(tiny.cost.total).toBe(0);
        expect(tiny.cost.warnings).toHaveLength(0);
    });

    it("warns when the free tiers stop covering the load", () => {
        const report = buildReport({ planners: 1000 });

        expect(report.usage.imageTransformations).toBeGreaterThan(PRICES.images.freeTransformations);
        expect(report.cost.warnings.join(" ")).toContain("Images");
        expect(report.cost.plans.resend.plan).toBe("pro");
    });
});
