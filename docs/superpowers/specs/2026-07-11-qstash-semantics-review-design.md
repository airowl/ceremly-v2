# QStash Queue-Semantics Code Review — Design / Spec

*Date: 2026-07-11 · Author: brainstorming session · Status: approved-pending-review*

## Goal

Deep-dive code review of the **QStash delivery semantics** in Ceremly's job pipeline (publish → deliver → handle), an angle NOT covered by the general Upstash review of 2026-06-30 (commits `b47c91d` + `f10b53a`, 13 findings fixed). Deliverables: verified findings report (in conversation + memory update, no extra MD report file) and **high-confidence fixes applied** with tests, committed to `dev` (push manual, per project convention).

## Context (verified during brainstorming)

- QStash surface (~1,250 lines): `server/queue/` (abstraction `index.ts` + `types.ts` + 5 handlers: dataExport, imageVariant, sendInviteEmail, sendReminderEmail, barrel), `server/api/jobs/[job].post.ts` (signed receiver endpoint), enqueue call sites (`distribution.service.ts`, `reminder.service.ts`, `dataExport.service.ts`, `file/fileService.ts`, `user.service.ts`), `server/api/cron/send-reminders.get.ts`, config (`runtimeConfig.ts`, `plugins/0.validate-env.ts`, `nuxt.config.ts` route/security exemptions).
- Zero commits touched these files since the 2026-06-30 review — code is identical; this review changes the *lens*, not the diff.
- Dev environment has empty `NUXT_QSTASH_TOKEN` → in-process fallback (jobs run synchronously, no QStash involved locally).

## Method (approved: hybrid, option C)

1. **Preparation**: consult the `upstash-qstash-js` skill for documented semantics (retry-by-status-code, signature verification, at-least-once delivery) — review against documented behavior, not memory.
2. **Single-context review** driven by the 6-lens invariant checklist below (surface fits one context; cross-path issues like cron→enqueue→handler stay visible).
3. **Adversarial verification**: every medium/high finding gets 2 independent skeptic subagents attempting refutation; a finding survives only if ≥1 skeptic confirms it with code evidence.
4. **Fixes**: confirmed high-confidence findings → fix with reproducing test where feasible (TDD), full Vitest suite + `pnpm typecheck` green → commit on `dev`. Doubtful/architectural findings → report only.

## Invariant checklist (the 6 lenses)

1. **Handler idempotency** — QStash is at-least-once: each of the 5 handlers must tolerate double delivery (duplicate emails? double export? re-generated variant?).
2. **Retry semantics** — response status codes: permanent errors (invalid payload, deleted entity) must NOT trigger retry; mid-handler failure (email sent, DB write failed) → retry → double side effect.
3. **Signature verification** — Receiver usage, current+next signing keys, raw-body vs parsed-body verification, replay exposure.
4. **Dev fallback parity** — in-process fallback (empty token): error/async semantics differing from prod in ways that mask prod-only bugs.
5. **Delivery config** — retry configuration, Vercel function timeout vs heavy jobs (dataExport), absence of DLQ/failure callback, ordering assumptions.
6. **Path security** — middleware coverage on `/api/jobs/*`, trust in payload-carried `organizationId`, rate limiting on the receiver.

## Out of scope

- Upstash Redis (cache/rate-limit) — covered 2026-06-30, no open follow-ups.
- Re-audit of the 13 previous fixes (only flagged if a lens incidentally exposes a regression).
- New QStash features (queues, flow control, QStash schedules vs Vercel Cron) — best-practice comparison was a separate, non-selected review cut.

## Success criteria

- All 6 lenses explicitly checked against every relevant file; per-lens verdict (clean / findings).
- No unverified medium/high finding in the final report.
- Applied fixes: Vitest suite + typecheck green, committed on `dev`, not pushed.
- Memory index updated with outcome.
