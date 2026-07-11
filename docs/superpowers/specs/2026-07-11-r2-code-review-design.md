# Cloudflare R2 Storage Code Review — Design / Spec

*Date: 2026-07-11 · Author: brainstorming session · Status: approved-pending-review*

## Goal

Full-spectrum code review of the **Cloudflare R2 storage integration** across four dimensions chosen by the user: multi-tenant security, correctness/robustness, cost/performance, production readiness. Deliverables: verified findings report (`docs/reviews/CODE-REVIEW-R2-2026-07-11.md`) and a **TDD implementation plan for priority fixes** (P0 + P1 + high-impact/low-cost P2), executed via multi-agent workflow (user opted in explicitly).

## Context (verified during brainstorming)

- R2 surface (~1,400 lines core): `server/services/file/` (`storage/r2.ts` 221 lines — S3-compatible provider, `fileService.ts` 645, `cleanup.ts`, `types.ts`), `server/api/file/` (presign, upload, confirm, `[id].delete`, `[id]/url.get`), `server/database/schema/file.ts`, `shared/schemas/file.ts`.
- Indirect consumers: `gdpr.service.ts` + `gdprRepository.ts` (file purge on account deletion), `dataExport.service.ts` (GDPR export uploaded to R2 — **currently modified in working tree**, review the working-tree version), `user.service.ts`, `queue/handlers/imageVariant.handler.ts`, `api/admin/cleanup-files.post.ts`, `api/cron/cleanup-files.get.ts`.
- Infra-from-code: `plugins/0.validate-env.ts`, `utils/runtimeConfig.ts`, `.env.example`, relevant `nuxt.config.ts` (CSP, request size limits). No Cloudflare dashboard access: bucket-level config (CORS, lifecycle, dev-vs-prod bucket separation — known open TODO) is reported as "manual operational verification" items, not code findings.
- Prior related reviews: Upstash review 2026-06-30 (fixed upload rate-limiter TOCTOU); QStash semantics review 2026-07-11 (queue lens — imageVariant handler idempotency overlaps, only re-flag if an R2 lens exposes something new).

## Method (approved: option A — dimensional lenses + adversarial verify)

Multi-agent workflow in 5 phases:

1. **Scout** (inline, main context): finalize file list + config snapshot passed to reviewers.
2. **Find**: 5 parallel reviewer agents, one per lens (see below). Structured output per finding: file, line, severity, description, concrete failure scenario.
3. **Dedup** (barrier, plain code — no agent): by file+line+theme across lenses.
4. **Adversarial verify**: 1 skeptic agent per finding attempting refutation with code evidence; **3 independent votes for P0/P1 candidates** (majority wins). Refuted → discarded; uncertain → "manual verification" report section, never in the fix plan.
5. **Synthesize**: report written to `docs/reviews/CODE-REVIEW-R2-2026-07-11.md`.

## The 5 lenses

1. **Multi-tenant security** — org isolation on every file query, presigned URL abuse (scope, expiry, content-type/size pinning), key path traversal, cross-tenant access via file id/url endpoints, magic-bytes validation bypass, public vs private object exposure.
2. **Correctness & robustness** — orphan files (upload succeeded / DB write failed and vice versa), SHA-256 dedup edge cases, presign→confirm TOCTOU, DB↔bucket consistency on delete/purge, error handling and retries, cleanup job correctness.
3. **Cost & performance** — Class A/B operation patterns, redundant HEAD/GET calls, egress via presigned download vs public URL, image variant pipeline efficiency, missing caching headers, unbounded object growth (no lifecycle).
4. **Production readiness** — env validation completeness, config drift dev/prod, shared dev/prod bucket risk (known TODO), CORS assumptions in code, size limits coherence (nuxt-security 5MB vs schema vs R2), observability of storage errors (Sentry).
5. **End-to-end flow** — walk presign→upload→confirm→url→delete→GDPR purge→cleanup cron as one state machine; find gaps between steps the sectoral lenses miss (state stuck in `pending`, double-confirm, delete-vs-variant races).

## Report format

`docs/reviews/CODE-REVIEW-R2-2026-07-11.md`: executive summary, findings table (severity, lens, file:line), per-finding detail (failure scenario + recommended fix), "manual operational verification" section, declared limits.

Severity scale: **P0** blocker (security breach / data loss), **P1** real bug, high impact, **P2** should-fix, **P3** minor.

## Fix selection → implementation plan

- In scope for the plan: all P0, all P1, plus P2 with high impact and low implementation cost.
- Out: P3, uncertain findings, anything requiring Cloudflare dashboard action (listed as operational follow-ups instead).
- Plan authored via `superpowers:writing-plans`, TDD (reproducing Vitest test per fix), on branch `dev`, auto-commit ok, push manual (project convention).

## Out of scope

- QStash delivery semantics (covered by the parallel 2026-07-11 QStash review).
- Upstash Redis rate-limiting internals (covered 2026-06-30).
- Refactors not tied to a confirmed finding.
- Cloudflare dashboard/bucket configuration changes (reported as operational follow-ups only).

## Success criteria

- Every file in the perimeter reviewed by all 5 lenses; per-lens verdict (clean / findings).
- No unverified P0/P1 in the final report (all pass 3-vote adversarial verify).
- Report committed; fix plan produced for the selected findings; each fix in the plan has a test-first task.
