# Cost model (plan Task 9, spike G10)

**Date:** 2026-09-21 · **Deployment measured:** Convex dev `wary-spaniel-466` · **Prices dated:** 2026-09-15 (fetched 2026-09-21)

The migration's economic risk is not "will the app run"; it is that **a function
call count is not a cost**. Convex bills four meters (function calls, database
I/O, action compute, storage) and Cloudflare three more (Worker requests, CPU,
R2 operations), while the call count itself grows with something the old estimate
ignored entirely: a write re-executes a query for **every connected subscriber**.

This document is the report of `scripts/migration/load-model.ts` (pure, tested)
fed by `scripts/migration/load-runner.ts` (measured on the staging deployment).

## The formula

```
monthly calls = explicit + scheduled + file + (watched writes × subscribers per write)
```

The last term is the one that matters. It is **not** a constant: it is the number
of clients holding a subscription to a query the write touches, and it is
measured — not assumed — by the runner (see below).

`watched writes` is not "all writes". A write nobody is subscribed to costs one
call, not `1 + subscribers`: the public RSVP submit and the nightly reminder sweep
are exactly that case, because the person writing is not the person watching. The
model keeps the distinction explicit per flow, which is what makes the per-flow
totals add up to the aggregate total (asserted in `test/migration/load-model.test.ts`).

## Measured inputs (staging, 2026-09-21)

From `npx tsx scripts/migration/load-runner.ts --subscribers 1,5,20`:

| Measurement | Result |
| --- | --- |
| Reactive fan-out, write that changes the subscribed value | **exactly 1 re-execution per subscriber**, at 1, 5 and 20 connected clients |
| Reactive fan-out, identical write (no change to the result) | **0 re-executions** at every subscriber count |
| Calls caused by one effective write | 2 (1 write + 1 read) at 1 subscriber, 6 at 5, 21 at 20 |
| Dashboard session (4 queries: organizations, active org, members, plan) | p50 74–94 ms / p95 152–165 ms over three runs |
| Sign-in (Better Auth through the component) | 167–200 ms |
| Provisioning mutation (`organizations.ensureProvisioned`) | 158 ms |
| Management write (`organizations.updateOrganization`, owner) | 129–156 ms |
| Payload per call, empty account | 191 B average (119 B for the provisioning mutation) |
| Upload flow (`files.presignUpload`) | refused at `STORAGE_BRIDGE_NOT_CONFIGURED` in 97–103 ms — after authorization and the rate limit, i.e. the calls the model counts; the R2/Images legs are G08's live evidence |
| Checkout flow (`billing.checkoutsCreate`) | refused with `EVENT_REQUIRED` in 141–178 ms — correct, since the celebration plan is per event and events do not exist in Convex yet (Task 10) |

Latencies are quoted as the range across three runs of the runner, not a single
sample: these are round trips to `eu-west-1` from a laptop over the public internet,
and a single number would claim a precision the measurement does not have. Call
counts and re-executions *are* exact and identical across runs — those are what the
model consumes.

Two of those are worth stating plainly. **The fan-out is linear and exact**: one
effective write, one read per subscriber, measured at three concurrency levels.
And **an ineffective write is free**: Convex compares results, so a mutation that
leaves the subscribed value identical re-executes nothing. The fan-out term counts
*effective* writes, which is why the model says `watched writes` and not
`mutations`.

## Assumptions (and their provenance)

The activity mix is **assumed**, and this repository cannot do better today:
measured 2026-09-21, the database branch holds **1 event, 1 guest, 0 RSVP,
0 uploads, 0 files** (audit rows are test noise). There is no production data here
to derive a mix from, so the mix comes from the product's own rules and the
`ACTIVITY_ASSUMPTIONS` block is the single place to change it:

| Assumption | Value | Basis |
| --- | --- | --- |
| Dashboard sessions per planner per month | 24 | assumed |
| Events per planner per month | 1.5 | assumed (product: a planner runs a few events a month) |
| Guests per event | 100 | assumed (product: the invitation product is aimed at 50–200 guest events) |
| RSVP response rate | 70 % | assumed |
| Reminders per event | 2 | the product rule caps reminders at 3 |
| Uploads per event | 8 | assumed |
| Paid event rate | 35 % | assumed |
| Concurrent subscribers | 1 | **the conservative end of what the runner measured** (1/5/20) |

Per-flow call shapes are `derived` from the implementation where the flow exists
(dashboard, upload, checkout, management) and from the plan's interfaces where it
does not yet (events, guests, RSVP, reminders — Tasks 10–12). Each flow carries its
`provenance` and a note saying which part is measured; the document you are
reading quotes the same labels.

## Monthly volumes and cost

Prices: Convex Free/Starter (pay-as-you-go, 1M calls + 1 GB I/O + 20 GB-h action
compute + 0.5 GB storage included) and Professional ($25/developer, 25M calls…);
Cloudflare Workers Paid ($5, 10M requests + 30M CPU-ms, **static assets free and
unlimited**); R2 ($0.015/GB-month, Class A $4.50/M, Class B $0.36/M, free egress,
10 GB + 1M + 10M free); Cloudflare Images ($0.50 per 1,000 unique transformations
after 5,000 free); Resend (Free 3,000/month — 100/day; Pro $20 / 50,000, then
$0.90 per 1,000). Sources are in `PRICES.sources`.

| | 20 planners | 50 | 100 | 1,000 |
| --- | --- | --- | --- | --- |
| Function calls (total) | 5,561 | 13,903 | 27,805 | 278,050 |
| — explicit | 4,000 | 9,999 | 19,998 | 199,975 |
| — scheduled | 251 | 626 | 1,253 | 12,525 |
| — file (bridge) | 480 | 1,200 | 2,400 | 24,000 |
| — **reactive re-executions** | 831 | 2,078 | 4,155 | 41,550 |
| Database I/O | 0.023 GB | 0.056 GB | 0.113 GB | 1.127 GB |
| Action compute | 0.034 GB-h | 0.086 GB-h | 0.172 GB-h | 1.719 GB-h |
| R2 storage | 0.60 GB | 1.50 GB | 3.00 GB | 30.00 GB |
| Image transformations | 480 | 1,200 | 2,400 | 24,000 |
| Emails | 6,011 | 15,026 | 30,053 | 300,525 |
| Worker dynamic requests | 2,715 | 6,786 | 13,573 | 135,725 |
| Worker static requests (free) | 76,155 | 190,388 | 380,775 | 3,807,750 |
| **Convex** | $0.00 | $0.00 | $0.00 | $0.03 |
| **Cloudflare Workers** | $0.00 | $0.00 | $0.00 | $5.00 |
| **R2** | $0.00 | $0.00 | $0.00 | $0.30 |
| **Cloudflare Images** | $0.00 | $0.00 | $0.00 | $9.50 |
| **Resend** | $20.00 | $20.00 | $20.00 | $245.47 |
| **Total** | **$20.00** | **$20.00** | **$20.00** | **$260.30** |
| **+ 30 % margin** | **$26.00** | **$26.00** | **$26.00** | **$338.39** |

Reproduce with `npx tsx -e "import('./scripts/migration/load-model.ts').then(m => console.log(m.buildReport({ planners: 1000 })))"`
or `pnpm test:migration -- load-model`.

### Chosen tiers (explicit)

| Provider | Tier | Why | Crossover |
| --- | --- | --- | --- |
| **Convex** | **Free/Starter** (pay-as-you-go) at every modelled tier | even at 1,000 planners the volume sits inside the included allowances ($0.03 of overflow I/O). Professional's $25/developer seat only pays for itself above ~12M calls/month — computed by `chooseConvexPlan`, not assumed | `chooseConvexPlan` switches to Professional at roughly 12.5M calls/month, monotonic thereafter |
| **Cloudflare Workers** | **Free** up to 100 planners, **Paid ($5)** from 1,000 | the free plan's 100k/day is account-wide; a single viral day can exhaust it. Static assets are free on both | paid minimum also buys 10M requests + 30M CPU-ms |
| **R2** | Standard, free tier | 30 GB at 1,000 planners is $0.30/month after 10 GB free; egress free | — |
| **Cloudflare Images** | **Free** to ~2,500 uploads/month, **Paid** beyond | 24,000 transformations at 1,000 planners exceed the 5,000 free — the model raises this as a warning rather than letting the invoice do it | 5,000 unique transformations/month |
| **Resend** | **Pro ($20)** from 20 planners | the free plan is 3,000 emails/month *and* 100/day; a single event's reminder batch can hit the daily cap | 3,000 emails/month |

### What the bill is actually made of

**Email is the cost centre, not compute.** At 1,000 planners Resend is $245 of
$260 (94 %); Convex's *compute* is three cents. The economic consequence is that
invitation/reminder volume — guests per event times reminders — is the input worth
managing, and that any plan pricing exercise should start there rather than at
database calls.

Per planner, with margin: at 1,000 planners $338.39 / 1,000 = **$0.34 per planner
per month** (the Atelier plan lists at €24/month). At 100 planners it is $0.26.
The margin covers the assumed 30 % headroom on top of the modelled cost, not a
reserve for architectural changes.

### What the old constant would have said

"1,000 calls per planner" predicts **1,000,000 calls at 1,000 planners** — exactly
Convex's included allowance, i.e. it would have argued for the Professional tier on
the basis of a number nobody had measured. The model's 278,050 calls differ by
3.6×, and 15 % of them are the reactive fan-out the constant could not express at
all. That is the finding the spec asked this spike to produce.

## Sensitivity

Each row shifts **one** assumption of the 1,000-planner scenario (base: 278,050
calls, $338.39 with margin) and re-runs the model:

| Change | Calls | Cost with margin | Reading |
| --- | --- | --- | --- |
| Guests per event ×1.5 | 278,050 (**+0 %**) | $513.95 (**+52 %**) | the bill is email; the call meter does not move at all |
| Guests per event ×0.5 | 278,050 (+0 %) | $156.35 (−54 %) | same lever, opposite direction |
| Reminders per event 2 → 3 (the product cap) | 284,050 (+2 %) | $513.90 (**+52 %**) | one more reminder per event costs as much as 50 % more guests |
| Events per planner 1.5 → 3 | 369,700 (+33 %) | $706.46 (**+109 %**) | doubles guests *and* emails |
| Uploads per event ×1.5 | 308,050 (+11 %) | $346.49 (+2 %) | the only other meter that leaves its free tier (Images) |
| Paid event rate ×1.5 | 279,625 (+1 %) | $338.70 (+0 %) | negligible |
| RSVP rate 70 % → 100 % | 278,050 (+0 %) | $338.44 (+0 %) | public submissions are not subscribed writes; they cost one call each and no email |
| **Concurrent subscribers 1 → 5** | 444,250 (**+60 %**) | $338.39 (**+0 %**) | **the calls move, the bill does not** |
| **Concurrent subscribers 1 → 20** | 1,067,500 (**+284 %**) | $338.58 (+0.1 %) | past Convex's included million, for 58 cents |

Two conclusions the spike exists to produce. First, **the cost driver and the
quota driver are different quantities**: guests and reminders move 94 % of the
bill while touching the call count barely at all, and fan-out moves the call count
by triple digits while changing the bill by cents. Second, a fan-out of 20 (all
planners with several tabs open during an event day) is the realistic way this
product could outgrow Convex's included allowance — and the fix for that is a
cheaper query shape or a coarser subscription, not a bigger plan, since the plan's
price is 0.2 % of the bill at that point.

## Budget and usage alerts — the half of this gate that is *not* done

The gate's PASS condition is "an explicitly chosen tier **and** budget/usage alerts
configured". The tier is chosen above. The alerts cannot be configured from this
repository: Convex spending limits and Cloudflare notifications are dashboard-only
settings, and this environment has no account access. **G10 is therefore not
recorded as PASS** — see the ledger.

To close it, configure these four, using the modelled values as thresholds:

| Where | Setting | Threshold from the model |
| --- | --- | --- |
| Convex → deployment → Settings → Spending limit | monthly budget alert | $10 (Professional crossover is ~12.5M calls; a >250k-call month at our volumes means something is looping) |
| Cloudflare → Notifications → Workers budget | monthly spend alert | $20 (paid minimum is $5; a spike above $20 means request or CPU volume, not assets) |
| Cloudflare → Notifications → R2 usage | storage + Class A alert | 50 GB / 2M Class A (10× the 1,000-planner model) |
| Resend → usage | daily send alert | 500/day (the 1,000-planner average is 334/day; the free plan's 100/day cap is the trap) |

## Not measured

- **The Convex and Cloudflare dashboards before/after a load run.** The plan asks
  for exactly that comparison and it is owed: there is no dashboard API, and no
  account access from this repository. What is measured here is the client side —
  calls issued, payloads received, re-executions observed, latency — and the model
  states plainly which meter each number feeds.
- **The flows that do not exist yet.** `events`, `guests`, `rsvp` and `reminders`
  have no Convex implementation (Tasks 10–12), so their per-flow call counts are
  derived from the plan's interfaces and the legacy behaviour. The model marks them
  `derived`; when those modules land, re-running the runner replaces the estimate
  with a measurement.
- **A production mix.** The assumptions above are the largest single source of
  error in this document. After cutover, one month of dashboard data replaces the
  whole `ACTIVITY_ASSUMPTIONS` block.
