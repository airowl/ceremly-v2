# Gate G07 Evidence — Organization-scoped Creem billing

**Date:** 2026-09-21
**Deployment:** team `airowl` → project `ceremly-staging` → dev deployment `wary-spaniel-466` (eu-west-1)
**Commands:** `pnpm test:gate:g07` (live, Creem **test mode**) and `pnpm vitest run convex/billing.test.ts` (hermetic)

| Gate | Requirement (plan Task 6) | Status |
| --- | --- | --- |
| G07 | billing Creem per organizzazione: checkout, portal, webhook replay, cancel/refund e re-lock | **PASS** |

PASS is *mechanism* evidence on staging. `Approved by` stays `—`: the signature belongs to
GO/NO-GO (Tasks 17–18).

## Gate cases

**Hermetic — `convex/billing.test.ts`, 22 tests (~0.5 s, no network).** Cases: RBAC refusals happen
before the provider is read; the client cannot pass an `entityId`; reserved checkout-metadata keys
cannot be forged; celebration requires an owned, not-yet-paid event; the plan resolves free ↔ atelier
from the component's subscription; one ledger row per provider event; replay is a no-op; a refund
re-locks and keeps the order id (so a late completion cannot re-unlock); a refund that arrives before
the completion is matched by the persisted checkout id; and — new in this task — **the three HTTP
pipeline cases** below.

**Live — `pnpm test:gate:g07`, 7 tests, ~23 s, three consecutive green runs.**

| Live case | Result |
| --- | --- |
| anonymous and non-owner callers refused before the provider is needed | PASS |
| a real test-mode checkout is created for the organization, and the checkout id is persisted *before* payment (Fix 7.2) | PASS |
| the completion webhook mirrors the customer and the portal resolves for the organization | PASS |
| a signed `checkout.completed` unlocks the event exactly once; redelivery writes no second ledger row | PASS |
| a signed `refund.created` re-locks and keeps the order id; a later completion stays `already_unlocked` | PASS |
| a webhook with a wrong signature is rejected (`403`) and unlocks nothing | PASS |
| every paid tier reports a configured product (no secrets) | PASS |

## Measured constraints (findings, not assumptions)

1. **`checkouts.create` returns no `customer`.** Probed against the live test API: the response is
   `{id, mode, object, product, status, units, checkoutUrl, successUrl, metadata}` — there is no
   `customer` field, and a checkout created with `customer: { email }` does **not** create a
   retrievable customer (`customers.retrieve(undefined, email)` → `404`). Creem creates the customer
   when the payment completes, and the completion webhook is what mirrors it locally. The gate
   therefore creates a real test customer (what Creem does at payment) and then delivers the signed
   completion, which is also the production sequence: pay → webhook → customer → portal. The
   checkout-time mirror in `createCreemCheckout` is retained only as defensive parity with the
   component's own path.
2. **`customers.create` requires `name`.** Passing only an email is a validation error
   (`expected: 'string', path: ['name']`), which the first version of the gate hit.
3. **The webhook body is already parsed when it reaches the handler.** `creem.registerRoutes`
   verifies the signature and runs the SDK's `webhookEventEntityFromJSON`, which renames Creem's
   snake_case fields to camelCase and turns `created_at` into a number/`Date`. An earlier
   `normalizeCreemEvent` fed that parsed object back through the SDK's checkout parser, which still
   requires the raw `created_at` the first pass had removed; it returned `null`, so **every real
   checkout was recorded as `ignored`** (observed on staging). The normalizer now reads the parsed
   entity directly. This is pinned by a test that goes through the real route
   (`t.fetch("/creem/events", …)` → signature → SDK parser → fulfillment), and that test was verified
   to **fail** when the double-parse is reintroduced.
4. **The Creem SDK defaults to the production API.** With no server configured, a `creem_test_` key
   gets a `401` from `api.creem.io`; a production key on staging would take real money. `CREEM_SERVER`
   is therefore derived from the key's own prefix, an explicit `CREEM_SERVER` that disagrees is
   refused, and an unset one is refused too — never silently defaulted to production.
5. **`convex run` prints arrays, not just objects.** The gate's helper sliced from the first `{` to
   the last `}`, which turns `[{…},{…}]` into invalid JSON; it now scans for the first *balanced*
   JSON value.
6. **`convex codegen` does not deploy functions** (carried from G06): `convex dev --once` is what
   uploads the bundle that serves the HTTP routes.

## Delivery shape

- `convex/billing.ts` — actions `checkoutsCreate`, `customersPortalUrl`, query
  `planForActiveOrganization`; internal `billingAuthz`, `assertCelebrationPurchasable`,
  `recordCheckoutCreation`, `processWebhookEvent`, `reconcileSnapshot`, `recentWebhookEvents`,
  `syncBillingProducts`, `configuredProducts`. **The billing entity is always the caller's active
  organization, resolved server-side**; no function accepts an `entityId`, and the reserved metadata
  keys (`convexBillingEntityId`, `convexUserId`) are written after the caller's metadata, so they
  cannot be forged.
- `convex/http.ts` — Creem webhook at `/creem/events`; the handler only normalizes and delegates to
  the exactly-once `internal.billing.processWebhookEvent` (ledger check → side effect → ledger write
  in one transaction).
- `convex/schema.ts` — minimal `events` and `webhookEvents` (fields frozen for Task 10).
- `convex/lib/pricing.ts` + `shared/constants/pricing.ts` — single source for the `free` /
  `celebration` / `atelier` plan limits.
- `scripts/migration/reconcile-creem.ts` (+ `test/migration/reconcile-creem.test.ts`) — pure
  comparator, legacy is the reference, mismatch → exit `1`.
- `convex/billing.test.ts` (22 hermetic cases) and `test/migration/g07-live-billing.test.ts` (7 live).

**Deviation from the plan's snippet:** Step 2 sketched `creem.api({ resolve })` wrapping the
component's generated endpoints. That resolver returns an identity, not a role decision, and the
checkout path needs the persisted checkout id that the component's own `checkouts.create` does not
expose. The billing functions therefore call `requireRole(ctx, ["owner"])` through an internal query
(`billingAuthz`) and orchestrate the SDK call themselves — the documented SDK usage plus the two
component mutations the component itself performs.

**Correction (2026-09-24, Task 14 part b, fix round 1):** the owner-only rule above was a behaviour
change against the legacy, not a decision. The product ruling is parity: the legacy Celebration
unlock (`POST /api/events/:id/unlock`) used `requireWrite` (owner | admin | member), and Atelier
checkout plus the customer portal were Creem Better Auth plugin endpoints that checked only the
session. `checkoutsCreate` and `customersPortalUrl` now accept every role
(`CELEBRATION_CHECKOUT_ROLES`, `SUBSCRIPTION_BILLING_ROLES` in `convex/billing.ts`), and the gate row
"anonymous and non-owner callers refused" now reads "anonymous callers refused; every member reaches
the provider". The billing entity is still the organization, so a member opening the portal manages
the organization's subscription — the one difference from the user-scoped legacy plugin. Hermetic
coverage: one case per role in `convex/billing.test.ts`; the live case was updated but **not re-run**.

## Verified alongside

- `pnpm test:gate:g07` → 7 live tests passed, three consecutive runs
- `pnpm vitest run convex/billing.test.ts` → 22 passed
- `pnpm test:gate:g02` → 7 passed · `pnpm test:gate:g03-g05` → 6 passed · `pnpm test:gate:g06` → 36 passed
- `pnpm test:migration` → 98 passed / 20 skipped (gates unarmed)
- `pnpm typecheck:convex` → clean · `npx eslint convex test/migration scripts/migration shared` → 0 errors

## Staging state

Creem test mode only. `CREEM_SERVER=test`, test key, test product ids, and `CREEM_WEBHOOK_SECRET` set
on the dev deployment. The gate creates throwaway organizations, events, test-mode checkouts and
customers under `gate-g07-…@example.com`; Task 16 sweeps them.

## Gate status

| Gate | Status | Evidence |
| --- | --- | --- |
| G01 | PASS | `docs/migration/evidence/G01-cloudflare.md` |
| G02 | PASS | `docs/migration/evidence/G02-convex-vue.md` |
| G03 | PASS | `docs/migration/evidence/G03-G05-auth.md` |
| G04 | NOT_RUN | `docs/migration/evidence/G03-G05-auth.md` — OAuth round trip blocked |
| G05 | PASS | `docs/migration/evidence/G03-G05-auth.md` |
| G06 | PASS | `docs/migration/evidence/G06-org-rbac.md` |
| **G07** | **PASS** | **This document** |
| G08–G10 | NOT_RUN | — |

Next authorized work: **Task 7** (G08: R2 and observable variants with Cloudflare Images).
