import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ConvexHttpClient } from "convex/browser";
import { Creem } from "creem";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { BillingReconcileSnapshot } from "../../convex/billing";
import { gatePrivateKeyPem, signGateToken } from "./gate-jwt";

/**
 * G07 (plan Task 6, Step 5) — organization-scoped Creem billing, live on the
 * staging deployment in Creem **test mode**.
 *
 * What is proven here, and what is not:
 * - **Proven**: the deployment's configuration actually reaches Creem (a test key
 *   pointed at the live API returns 401 — measured while arming this gate), the
 *   billing entity is the caller's active organization, a real checkout is
 *   created, the portal resolves for that organization, RBAC refusals happen
 *   before the provider is touched, and a signature-verified webhook delivered to
 *   the deployed HTTP route unlocks an event exactly once and re-locks it on
 *   refund without losing the order id.
 * - **Not proven**: that Creem's own delivery reaches us. Completing a hosted
 *   test payment needs a browser, and the payloads below are therefore signed by
 *   this gate rather than by Creem. The fulfillment rules themselves are pinned
 *   hermetically in `convex/billing.test.ts`, which is the suite that repeats.
 *
 * Armed by `pnpm test:gate:g07`; writes no fixtures into git.
 */

const armed = process.env.G07_GATE === "live";

const convexUrl = process.env.CONVEX_GATE_URL || process.env.NUXT_PUBLIC_CONVEX_URL || "";
const siteUrl = process.env.NUXT_PUBLIC_CONVEX_SITE_URL || "";
const webhookSecret = process.env.CREEM_WEBHOOK_SECRET || process.env.NUXT_CREEM_WEBHOOK_SECRET || "";
const atelierProductId =
    process.env.CREEM_PRODUCT_ID_ATELIER || process.env.NUXT_CREEM_PRODUCT_ID_ATELIER || "";
const celebrationProductId =
    process.env.CREEM_PRODUCT_ID_CELEBRATION || process.env.NUXT_CREEM_PRODUCT_ID_CELEBRATION || "";

const creemApiKey = process.env.CREEM_API_KEY || process.env.NUXT_CREEM_API_KEY || "";

const privateKey = gatePrivateKeyPem();
const runId = `${Date.now().toString(36)}`;
const ownerSubject = `gate-g07-owner-${runId}`;
const ownerEmail = `gate-g07-owner-${runId}@example.com`;
const memberEmail = `gate-g07-member-${runId}@example.com`;

/**
 * A real Creem test-mode customer, created in `beforeAll`.
 *
 * Measured: `checkouts.create` returns no `customer` — Creem creates it when the
 * payment completes. Test mode cannot complete a hosted payment, so the gate does
 * what Creem would do at that moment (create the customer) and then delivers the
 * signed completion webhook that mirrors it. The portal can only resolve against a
 * customer Creem actually knows, so a fabricated id would prove nothing.
 */
let gateCustomerId = "";

const ownerToken = privateKey
    ? signGateToken({
        privateKeyPem: privateKey,
        subject: ownerSubject,
        email: ownerEmail,
        name: "Gate Owner",
        expiresInSeconds: 1800,
    })
    : "";
const memberToken = privateKey
    ? signGateToken({
        privateKeyPem: privateKey,
        subject: `gate-g07-member-${runId}`,
        email: memberEmail,
        name: "Gate Member",
        expiresInSeconds: 1800,
    })
    : "";

const asClient = (token?: string) => {
    const client = new ConvexHttpClient(convexUrl);
    if (token) client.setAuth(token);
    return client;
};

/**
 * Extracts the first balanced JSON value from CLI output.
 *
 * `convex run` may print banner lines before the result, and the result can be an
 * array (`recentWebhookEvents`). Slicing from the first `{` to the last `}` — the
 * obvious shortcut — turns `[{a},{b}]` into `{a},{b}`, which is not JSON; hence the
 * bracket/string scanner.
 */
function extractJson(text: string): unknown {
    const trimmed = text.trim();
    try {
        return JSON.parse(trimmed);
    } catch {
        // fall through to the scanner
    }

    const start = trimmed.search(/[[{]/);
    if (start === -1) throw new Error("no JSON value found in output");

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < trimmed.length; i += 1) {
        const char = trimmed[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (char === "\\") escaped = true;
            else if (char === '"') inString = false;
            continue;
        }
        if (char === '"') inString = true;
        else if (char === "{" || char === "[") depth += 1;
        else if (char === "}" || char === "]") {
            depth -= 1;
            if (depth === 0) return JSON.parse(trimmed.slice(start, i + 1));
        }
    }

    throw new Error("unterminated JSON value in output");
}

/** `convex run` output is JSON, possibly after CLI chatter. */
function convexRun<T>(name: string, args = "{}"): T {
    const stdout = execFileSync(
        "npx",
        ["--no-install", "convex", "run", name, args],
        { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], maxBuffer: 32 * 1024 * 1024 },
    );

    try {
        return extractJson(stdout) as T;
    } catch (error) {
        throw new Error(`No JSON in \`convex run ${name}\` output: ${(error as Error).message}`);
    }
}

const snapshot = () => convexRun<BillingReconcileSnapshot>("billing:reconcileSnapshot");
const eventById = (state: BillingReconcileSnapshot, eventId: string) =>
    state.events.find((event) => event.id === eventId);

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
    let caught: unknown;
    try {
        await promise;
    } catch (error) {
        caught = error;
    }
    expect(caught, `expected rejection with ${code}`).toBeDefined();
    const message = JSON.stringify(caught);
    expect(message, `expected ${code} in ${message}`).toContain(code);
}

/** Seeds an event through the CLI: no public mutation creates events yet (Task 10). */
function seedEvent(organizationId: string): Id<"events"> {
    const dir = resolve(".gate");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `g07-events-${runId}.jsonl`);
    writeFileSync(file, `${JSON.stringify({ organizationId, tier: "free" })}\n`, "utf8");

    // `--append`, not plain import: the table exists after the first gate run and
    // the CLI refuses to create it twice.
    execFileSync(
        "npx",
        [
            "--no-install",
            "convex",
            "import",
            "--table",
            "events",
            "--append",
            file,
            "--format",
            "jsonLines",
            "-y",
        ],
        { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" },
    );

    const created = snapshot().events.find(
        (event) => event.organizationId === organizationId && event.tier === "free",
    );
    if (!created) throw new Error("seeded event not visible in the deployment snapshot");
    return created.id as Id<"events">;
}

async function postWebhook(payload: unknown): Promise<Response> {
    const body = JSON.stringify(payload);
    const signature = createHmac("sha256", webhookSecret).update(body).digest("hex");

    return await fetch(`${siteUrl}/creem/events`, {
        method: "POST",
        headers: { "content-type": "application/json", "creem-signature": signature },
        body,
    });
}

const iso = (date = new Date()) => date.toISOString();

function checkoutCompleted(args: {
    eventId: string;
    organizationId: string;
    authUserId: string;
    providerEventId: string;
    orderId: string;
    checkoutId: string;
}) {
    return {
        id: args.providerEventId,
        eventType: "checkout.completed",
        created_at: Math.floor(Date.now() / 1000),
        object: {
            id: args.checkoutId,
            mode: "test",
            object: "checkout",
            status: "completed",
            product: celebrationProductId,
            units: 1,
            order: {
                id: args.orderId,
                mode: "test",
                object: "order",
                product: celebrationProductId,
                amount: 4900,
                currency: "EUR",
                status: "paid",
                type: "onetime",
                created_at: iso(),
                updated_at: iso(),
            },
            customer: gateCustomerId,
            metadata: {
                convexUserId: args.authUserId,
                convexBillingEntityId: args.organizationId,
                eventId: args.eventId,
            },
        },
    };
}

function refundCreated(args: { providerEventId: string; orderId: string }) {
    return {
        id: args.providerEventId,
        eventType: "refund.created",
        created_at: Math.floor(Date.now() / 1000),
        object: {
            id: `refund_gate_${runId}`,
            mode: "test",
            object: "refund",
            status: "succeeded",
            refund_amount: 4900,
            refund_currency: "EUR",
            reason: "requested_by_customer",
            transaction: {
                id: `txn_gate_${runId}`,
                mode: "test",
                object: "transaction",
                amount: 4900,
                currency: "EUR",
                type: "payment",
                status: "refunded",
                order: args.orderId,
                created_at: Math.floor(Date.now() / 1000),
            },
            order: args.orderId,
            created_at: Math.floor(Date.now() / 1000),
        },
    };
}

describe.skipIf(!armed)("G07 live · Creem test mode", () => {
    let organizationId = "";
    let owner: ConvexHttpClient;
    let eventId: Id<"events"> = "" as Id<"events">;

    beforeAll(async () => {
        expect(gatePrivateKeyPem(), "GATE_AUTH_PRIVATE_KEY_B64 must be set").toBeTruthy();
        expect(convexUrl).toBeTruthy();
        expect(siteUrl).toBeTruthy();
        expect(webhookSecret).toBeTruthy();
        expect(celebrationProductId).toBeTruthy();
        expect(creemApiKey).toBeTruthy();

        owner = asClient(ownerToken);
        const provisioned = await owner.mutation(api.organizations.ensureProvisioned, {});
        organizationId = provisioned.organizationId;
        eventId = seedEvent(organizationId);

        // The customer Creem would create when the payment completes. `name` is
        // required by the API — passing only an email is a validation error.
        const creem = new Creem({
            apiKey: creemApiKey,
            server: creemApiKey.startsWith("creem_test_") ? "test" : "prod",
        });
        const customer = await creem.customers.create({ email: ownerEmail, name: "Gate Owner" });
        gateCustomerId = customer.id;
    }, 120000);

    it("refuses anonymous callers, and non-owners for Atelier and the portal", async () => {
        const anonymous = asClient();
        await expectCode(
            anonymous.action(api.billing.checkoutsCreate, { tier: "atelier" }),
            "UNAUTHENTICATED",
        );

        const invitation = await owner.mutation(api.organizations.inviteMember, {
            email: memberEmail,
            role: "member",
        });

        const member = asClient(memberToken);
        await member.mutation(api.organizations.ensureProvisioned, {});
        await member.mutation(api.organizations.acceptInvitation, { token: invitation.token });

        // Controller ruling (Task 14 part b, fix round 2): Atelier and the portal
        // act on the organization's subscription and are owner only; the
        // Celebration unlock stays open to every write role (covered hermetically
        // in `convex/billing.test.ts`, not here, to avoid a second live checkout).
        await expectCode(
            member.action(api.billing.checkoutsCreate, { tier: "atelier" }),
            "INSUFFICIENT_ROLE",
        );
        await expectCode(member.action(api.billing.customersPortalUrl, {}), "INSUFFICIENT_ROLE");
        const plan = await member.query(api.billing.planForActiveOrganization, {});
        expect(plan.organizationId).toBe(organizationId);
        expect(plan.canManageBilling).toBe(false);
        expect(plan.canUnlockEvents).toBe(true);
    }, 60000);

    it("charges the organization, not the browser: a real test-mode checkout", async () => {
        const state = eventById(snapshot(), eventId);
        expect(state?.tier).toBe("free");

        const checkout = await owner.action(api.billing.checkoutsCreate, {
            tier: "celebration",
            eventId,
            successUrl: "https://example.com/gate/success",
        });

        expect(checkout.checkoutId).toBeTruthy();
        expect(checkout.url).toMatch(/^https:\/\//);

        // Fix 7.2, live: the checkout id is persisted *before* payment, which is
        // the only link that survives a refund arriving first.
        const after = eventById(snapshot(), eventId);
        expect(after?.creemCheckoutId).toBe(checkout.checkoutId);

        const plan = await owner.query(api.billing.planForActiveOrganization, {});
        expect(plan.organizationId).toBe(organizationId);
        expect(plan.plan).toBe("free");
        expect(plan.canManageBilling).toBe(true);
        // Measured, not assumed: `checkouts.create` returns no `customer` field —
        // Creem creates the customer when the payment completes, and the completion
        // webhook is what mirrors it (asserted further down, after the signed
        // completion). Creating one here would litter Creem with abandoned carts.
        expect(plan.customer).toBeNull();
    }, 60000);

    it("unlocks the event on a signed webhook, exactly once", async () => {
        const providerEventId = `evt_gate_checkout_${runId}`;
        const orderId = `order_gate_${runId}`;
        const payload = checkoutCompleted({
            eventId,
            organizationId,
            authUserId: ownerSubject,
            providerEventId,
            orderId,
            checkoutId: `checkout_gate_${runId}`,
        });

        // 202 is the component's "accepted and processed" answer on this route.
        const first = await postWebhook(payload);
        expect(first.status).toBe(202);

        const unlocked = eventById(snapshot(), eventId);
        expect(unlocked?.tier).toBe("celebration");
        expect(unlocked?.creemOrderId).toBe(orderId);
        expect(unlocked?.unlockedAt).toBeTypeOf("number");

        // A redelivery must not run the fulfillment again.
        const replay = await postWebhook(payload);
        expect(replay.status).toBe(202);

        const ledger = convexRun<Array<{ providerEventId: string; type: string; outcome: string }>>(
            "billing:recentWebhookEvents",
            JSON.stringify({ limit: 20 }),
        );
        const rows = ledger.filter((row) => row.providerEventId === providerEventId);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.outcome).toBe("unlocked");
    }, 60000);

    it("mirrors the customer from the completion and resolves its portal", async () => {
        // The completion webhook above is what creates the local customer, which is
        // the production sequence too (pay → webhook → customer → portal).
        const plan = await owner.query(api.billing.planForActiveOrganization, {});
        expect(plan.customer?.id).toBe(gateCustomerId);

        const portal = await owner.action(api.billing.customersPortalUrl, {});
        expect(portal.url).toMatch(/^https:\/\//);
    }, 60000);

    it("re-locks on a signed refund and keeps the order id, so a late completion cannot re-unlock", async () => {
        const refundEventId = `evt_gate_refund_${runId}`;

        const refund = await postWebhook(
            refundCreated({ providerEventId: refundEventId, orderId: `order_gate_${runId}` }),
        );
        expect(refund.status).toBe(202);

        const relocked = eventById(snapshot(), eventId);
        expect(relocked?.tier).toBe("free");
        expect(relocked?.creemOrderId).toBe(`order_gate_${runId}`);
        expect(relocked?.unlockedAt).toBeNull();

        // Fix 7.2, the other half: a *new* completion for the refunded order finds
        // `creemOrderId` set and must refuse to unlock again.
        const late = await postWebhook(
            checkoutCompleted({
                eventId,
                organizationId,
                authUserId: ownerSubject,
                providerEventId: `evt_gate_late_${runId}`,
                orderId: `order_gate_${runId}`,
                checkoutId: `checkout_gate_${runId}`,
            }),
        );
        expect(late.status).toBe(202);

        const stillFree = eventById(snapshot(), eventId);
        expect(stillFree?.tier).toBe("free");

        const ledger = convexRun<Array<{ providerEventId: string; outcome: string }>>(
            "billing:recentWebhookEvents",
            JSON.stringify({ limit: 20 }),
        );
        expect(ledger.find((row) => row.providerEventId === `evt_gate_refund_${runId}`)?.outcome).toBe(
            "relocked",
        );
        expect(ledger.find((row) => row.providerEventId === `evt_gate_late_${runId}`)?.outcome).toBe(
            "already_unlocked",
        );
    }, 60000);

    it("rejects a webhook whose signature does not match", async () => {
        const body = JSON.stringify(
            checkoutCompleted({
                eventId,
                organizationId,
                authUserId: ownerSubject,
                providerEventId: `evt_gate_forged_${runId}`,
                orderId: `order_gate_forged_${runId}`,
                checkoutId: `checkout_gate_forged_${runId}`,
            }),
        );

        const response = await fetch(`${siteUrl}/creem/events`, {
            method: "POST",
            headers: { "content-type": "application/json", "creem-signature": "00".repeat(32) },
            body,
        });

        expect(response.status).not.toBe(200);
        expect(eventById(snapshot(), eventId)?.creemOrderId).not.toBe(`order_gate_forged_${runId}`);
    }, 60000);

    it("reports a configured product for every paid tier", () => {
        const configured = snapshot().configured;
        expect(configured.map((entry) => entry.tier).sort()).toEqual(["atelier", "celebration"]);
        expect(configured.find((entry) => entry.tier === "atelier")?.productId).toBe(atelierProductId);
    }, 60000);
});
