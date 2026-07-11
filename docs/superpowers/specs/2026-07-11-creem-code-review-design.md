# Creem Payments Code Review — Design / Spec

*Date: 2026-07-11 · Author: brainstorming session · Status: approved-pending-review*

## Goal

Full-spectrum code review of the **Creem payment integration** across four dimensions chosen by the user (money & states, security, production readiness, client flow & UX) plus an end-to-end lens. Deliverables: verified findings report (`docs/reviews/CODE-REVIEW-CREEM-2026-07-11.md`), a **review execution plan** (workflow script + report template, `docs/superpowers/plans/2026-07-11-creem-code-review.md`), and — after the review runs — a TDD implementation plan for priority fixes (P0 + P1 + high-impact/low-cost P2). Multi-agent workflow (user opted in explicitly, same as the R2 review).

## Context (verified during brainstorming)

- Pricing model: `free`/`celebration` are **per-event** tiers (`events.tier`); `atelier` is an **org-level** recurring subscription resolved at runtime via `getPlanFromProductId` (`shared/constants/pricing.ts`, 51 lines). Prices: Celebration €39 one-time per event, Atelier €24/month.
- Core surface (~1,000 lines): `server/utils/creem.ts` (165 — webhook handlers + `setupCreem` plugin config), `checkout.service.ts` (77), `eventAccess.service.ts` (46), `eventReconcile.service.ts` (77), `planLimit.service.ts` (72), `server/api/events/[id]/unlock.post.ts` (25) + `reconcile-unlock.post.ts` (27), unlock/relock functions in `eventRepository.ts` (509 total), plugin wiring in `server/utils/auth.ts` (496 total), client `useSubscription.ts` (112) + `CerCelebrationPaywall.vue` (89) + dashboard event page. Tests ~720 lines (creem, getPlanFromProductId, checkout.service, eventAccess, eventReconcile, eventRepository unlock/relock).
- Key mechanics (read during brainstorming): single provider via `@creem_io/better-auth` plugin; webhook auto-registered at `/api/auth/creem/webhook`; `persistSubscriptions: true` manages the `creem_subscription` table; one-time Celebration unlock happens in `onCheckoutCompleted` via `metadata.eventId` + `metadata.organizationId` (idempotent via the `tier='free'` predicate in `unlockEvent`); refund/dispute → `relockEventByOrder(creemOrderId)` (no org scope — to examine); subscription callbacks are audit-only; `testMode: !runtimeConfig.public.isProdDeployment` (derived from `VERCEL_ENV`); webhook handler errors are caught and logged to `console.error` only.
- Indirect consumers: admin endpoints (`api/admin/subscriptions/` list+patch, `admin/users/`, `admin/stats`), GDPR touchpoints (`gdpr.service.ts`, `gdprRepository.ts`, `dataExport.service.ts`), middleware referencing creem (`0.site-mode.ts`, `4.block-bots.ts`), `nuxt.config.ts` route rules (`/api/auth/creem/**` security exemption).
- Infra-from-code: `plugins/0.validate-env.ts`, `utils/runtimeConfig.ts`, `.env.example`. No Creem dashboard access: provider-side config (webhook registration, product setup, live keys) is reported as "manual operational verification" items, not code findings. Known operational gap: Creem env vars are still placeholders on prod.
- Prior related reviews: R2 storage 2026-07-11, QStash semantics 2026-07-11 (reconcile/queue overlaps — only re-flag if a Creem lens exposes something new), Upstash 2026-06-30.

## Method (approved: R2 pattern — dimensional lenses + adversarial verify)

Alternative considered and rejected as primary structure: per-flow agents (celebration purchase / atelier subscription / refund) — the dimensional lenses cover flows transversally and lens 5 walks them explicitly.

Multi-agent workflow in 5 phases:

1. **Scout** (inline, main context): finalize file list + config snapshot passed to reviewers.
2. **Find**: 5 parallel reviewer agents, one per lens (see below). Structured output per finding: file, line, severity, description, concrete failure scenario.
3. **Dedup** (barrier, plain code — no agent): by file+line+theme across lenses.
4. **Adversarial verify**: 1 skeptic agent per finding attempting refutation with code evidence; **3 independent votes for P0/P1 candidates** (majority wins). Refuted → discarded; uncertain → "manual verification" report section, never in the fix plan.
5. **Synthesize**: report written to `docs/reviews/CODE-REVIEW-CREEM-2026-07-11.md`.

## The 5 lenses

1. **Money & states** — checkout→webhook→unlock correctness, unlock idempotency (`tier='free'` predicate), double purchase of the same event, refund/dispute→relock (order→event mapping), reconcile fallback correctness, `creem_subscription` state coherence vs Creem reality, swallowed webhook errors (`catch`→`console.error`: does Creem retry? is the failure visible?), audit trail completeness, test gaps.
2. **Security** — webhook signature verification and replay, spoofing of `metadata.eventId`/`organizationId` at checkout creation, org isolation on unlock/reconcile routes, `relockEventByOrder` without org scope, admin endpoint auth, billing data exposure to non-owners.
3. **Production readiness** — env validation completeness (`0.validate-env.ts`), prod placeholder keys, `testMode = !isProdDeployment` correctness at runtime (VERCEL_ENV), live vs test product ID mismatch scenarios, customer portal, observability of billing errors (Sentry, structured logs), site-mode/block-bots middleware not blocking the webhook.
4. **Client flow & UX** — `CerCelebrationPaywall`, `useSubscription` staleness after payment (redirect `success=true`, cache invalidation), dashboard event page unlock states, admin subscriptions UI, i18n of billing texts.
5. **End-to-end state machine** — full Celebration walk: create event (free) → checkout → webhook unlock → success redirect → reconcile fallback → refund relock → re-purchase; full Atelier walk: subscribe → active → paid → canceled → org limit enforcement. Find gaps BETWEEN steps that sectoral lenses miss (stuck states, double transitions, races).

## Report format

`docs/reviews/CODE-REVIEW-CREEM-2026-07-11.md`: executive summary, findings table (severity, lens, file:line), per-finding detail (failure scenario + recommended fix), "manual operational verification" section, declared limits.

Severity scale: **P0** blocker (money loss / security breach), **P1** real bug, high impact, **P2** should-fix, **P3** minor.

## Fix selection → implementation plan

- In scope for the plan: all P0, all P1, plus P2 with high impact and low implementation cost.
- Out: P3, uncertain findings, anything requiring Creem dashboard action (listed as operational follow-ups instead).
- Plan authored via `superpowers:writing-plans`, TDD (reproducing Vitest test per fix), on branch `dev`, auto-commit ok, push manual (project convention).

## Out of scope

- R2 storage, Upstash Redis, QStash delivery semantics internals (covered by their own 2026-06/2026-07 reviews).
- Refactors not tied to a confirmed finding.
- Creem dashboard/provider configuration changes (reported as operational follow-ups only).
- Resend email flow (receipts/notifications belong to the email system review).

## Success criteria

- Every file in the perimeter reviewed by all 5 lenses; per-lens verdict (clean / findings).
- No unverified P0/P1 in the final report (all pass 3-vote adversarial verify).
- Report committed; review execution plan produced; fix plan follows after results with a test-first task per fix.
