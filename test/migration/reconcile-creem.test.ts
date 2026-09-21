import { describe, expect, it } from "vitest";

import {
    compareBillingStates,
    parseArgs,
    type ConvexBillingState,
    type LegacyBillingState,
} from "../../scripts/migration/reconcile-creem";

/**
 * Task 6, Step 4 — the reconciliation rules.
 *
 * The script itself is thin I/O around `compareBillingStates`; these cases pin the
 * verdicts that decide whether a billing cutover may proceed: a fact missing from
 * Convex fails, a fact added on the new stack does not.
 */

const ORG_LEGACY = "org_legacy_1";
const ORG_CONVEX = "org_convex_1";
const SUB = "sub_1";
const CUSTOMER = "cust_1";

const legacyState = (overrides: Partial<LegacyBillingState> = {}): LegacyBillingState => ({
    subscriptions: [
        {
            creemSubscriptionId: SUB,
            referenceId: ORG_LEGACY,
            productId: "prod_atelier",
            status: "active",
            creemCustomerId: CUSTOMER,
            creemOrderId: null,
            periodEnd: "2030-01-01T00:00:00.000Z",
            cancelAtPeriodEnd: false,
        },
    ],
    events: [
        {
            legacyId: "11111111-1111-1111-1111-111111111111",
            organizationLegacyId: ORG_LEGACY,
            tier: "celebration",
            creemOrderId: "order_1",
            creemCheckoutId: "checkout_1",
        },
    ],
    ...overrides,
});

const convexState = (overrides: Partial<ConvexBillingState> = {}): ConvexBillingState => ({
    configured: [{ tier: "atelier", productId: "prod_atelier" }],
    organizations: [{ id: ORG_CONVEX, legacyId: ORG_LEGACY, customerId: CUSTOMER }],
    subscriptions: [
        {
            id: SUB,
            organizationId: ORG_CONVEX,
            legacyId: ORG_LEGACY,
            customerId: CUSTOMER,
            productId: "prod_atelier",
            status: "active",
            currentPeriodEnd: "2030-01-01T00:00:00.000Z",
            cancelAtPeriodEnd: false,
        },
    ],
    events: [
        {
            id: "convex_event_1",
            legacyId: "11111111-1111-1111-1111-111111111111",
            organizationId: ORG_CONVEX,
            tier: "celebration",
            creemOrderId: "order_1",
            creemCheckoutId: "checkout_1",
            unlockedAt: 1_800_000_000_000,
        },
    ],
    ...overrides,
});

const kinds = (mismatches: Array<{ kind: string }>) => mismatches.map((entry) => entry.kind).sort();

describe("compareBillingStates", () => {
    it("reports nothing when every legacy fact exists and agrees in Convex", () => {
        const report = compareBillingStates(legacyState(), convexState());

        expect(report.mismatches).toEqual([]);
        expect(report.notes).toEqual([]);
        expect(report.counts).toMatchObject({ legacySubscriptions: 1, convexSubscriptions: 1 });
    });

    it("accepts a second of clock drift on the period end", () => {
        const report = compareBillingStates(
            legacyState(),
            convexState({
                subscriptions: [
                    {
                        ...convexState().subscriptions[0]!,
                        currentPeriodEnd: "2030-01-01T00:00:00.500Z",
                    },
                ],
            }),
        );

        expect(report.mismatches).toEqual([]);
    });

    it("fails when a legacy subscription never reached Convex", () => {
        const report = compareBillingStates(legacyState(), convexState({ subscriptions: [] }));

        expect(kinds(report.mismatches)).toEqual([ "subscription_missing_in_convex" ]);
    });

    it("fails on a legacy subscription that never got a Creem id", () => {
        const report = compareBillingStates(
            legacyState({
                subscriptions: [
                    {
                        ...legacyState().subscriptions[0]!,
                        creemSubscriptionId: null,
                        status: "pending",
                    },
                ],
            }),
            convexState(),
        );

        expect(kinds(report.mismatches)).toEqual(["subscription_missing_in_convex"]);
        expect(report.mismatches[0]?.detail).toMatchObject({ status: "pending" });
    });

    it("fails on every diverging subscription field", () => {
        const report = compareBillingStates(
            legacyState(),
            convexState({
                subscriptions: [
                    {
                        ...convexState().subscriptions[0]!,
                        status: "canceled",
                        productId: "prod_other",
                        customerId: "cust_other",
                        cancelAtPeriodEnd: true,
                        currentPeriodEnd: "2031-01-01T00:00:00.000Z",
                    },
                ],
            }),
        );

        expect(kinds(report.mismatches)).toEqual([
            "subscription_cancel_at_period_end_mismatch",
            "subscription_customer_mismatch",
            "subscription_period_end_mismatch",
            "subscription_product_mismatch",
            "subscription_status_mismatch",
        ]);
    });

    it("fails when the subscription sits under another organization", () => {
        const report = compareBillingStates(
            legacyState(),
            convexState({
                subscriptions: [{ ...convexState().subscriptions[0]!, organizationId: "org_convex_other" }],
            }),
        );

        expect(kinds(report.mismatches)).toEqual(["subscription_entity_mismatch"]);
    });

    it("fails when the legacy organization has no Convex twin", () => {
        const report = compareBillingStates(
            legacyState(),
            convexState({ organizations: [{ id: ORG_CONVEX, legacyId: "org_legacy_other", customerId: CUSTOMER }] }),
        );

        // One verdict, not four: the tenant mapping is the root cause, and the
        // per-fact entity checks are skipped when there is nothing to compare to.
        expect(kinds(report.mismatches)).toEqual(["organization_unmapped"]);
    });

    it("fails when a paid legacy event is missing or still free in Convex", () => {
        const missing = compareBillingStates(legacyState(), convexState({ events: [] }));
        expect(kinds(missing.mismatches)).toEqual(["event_missing_in_convex"]);

        const stillFree = compareBillingStates(
            legacyState(),
            convexState({
                events: [{ ...convexState().events[0]!, tier: "free", creemOrderId: null }],
            }),
        );
        expect(kinds(stillFree.mismatches)).toEqual(["event_order_id_mismatch", "event_tier_mismatch"]);
    });

    it("treats a checkout id difference as a note, not a failure", () => {
        const report = compareBillingStates(
            legacyState(),
            convexState({ events: [{ ...convexState().events[0]!, creemCheckoutId: null }] }),
        );

        expect(report.mismatches).toEqual([]);
        expect(kinds(report.notes)).toEqual(["event_checkout_id_differs"]);
    });

    it("lists growth on the new stack as notes", () => {
        const report = compareBillingStates(
            legacyState(),
            convexState({
                subscriptions: [
                    convexState().subscriptions[0]!,
                    { ...convexState().subscriptions[0]!, id: "sub_sold_after_cutover" },
                ],
                events: [
                    convexState().events[0]!,
                    {
                        id: "convex_event_new",
                        legacyId: null,
                        organizationId: ORG_CONVEX,
                        tier: "free",
                        creemOrderId: null,
                        creemCheckoutId: null,
                        unlockedAt: null,
                    },
                ],
            }),
        );

        expect(report.mismatches).toEqual([]);
        expect(kinds(report.notes)).toEqual(["event_only_in_convex", "subscription_only_in_convex"]);
    });
});

describe("parseArgs", () => {
    it("defaults to the dev deployment and stdout output", () => {
        expect(parseArgs([])).toEqual({ convexJson: null, out: null, prod: false });
    });

    it("reads a snapshot file and an output path", () => {
        expect(parseArgs(["--convex-json", "s.json", "--out", "r.json", "--prod"])).toEqual({
            convexJson: "s.json",
            out: "r.json",
            prod: true,
        });
    });

    it("refuses unknown flags instead of ignoring them", () => {
        expect(() => parseArgs(["--deployment", "prod"])).toThrow(/Unknown argument/);
    });
});
