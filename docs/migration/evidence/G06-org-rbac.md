# Gate G06 Evidence — Application organizations and RBAC on Convex

**Date:** 2026-09-21
**Deployment:** team `airowl` → project `ceremly-staging` → dev deployment `wary-spaniel-466` (eu-west-1)
**Command:** `pnpm test:gate:g06` → `vitest run convex/organizations.test.ts convex/auth.test.ts`

| Gate | Requirement (plan Task 5) | Status |
| --- | --- | --- |
| G06 | organizzazioni applicative, membership, inviti e RBAC server-side su Convex | **PASS** |

PASS is *mechanism* evidence: 36 hermetic tests on `convex-test` (no deployment, no shared state) plus
one live sign-up on staging that proves the provisioning trigger fires inside the real Better Auth
HTTP path. `Approved by` stays `—`: the signature belongs to GO/NO-GO (Tasks 17–18).

## Gate cases

Result: **2 files passed, 36 tests passed, 0 skipped** (~0.1 s).

The plan's Step 2 asks for isolation first. Each requirement maps to a test that fails if the
guarantee is removed:

| Requirement (plan Task 5, Step 2) | Test | Result |
| --- | --- | --- |
| Alice non legge l'organizzazione di B | `never returns another organization's members` | PASS |
| …e non vede le altre organizzazioni | `lists only organizations the caller belongs to` | PASS |
| un member non scrive (amministrazione) | `denies a member every membership and organization write` | PASS |
| un member continua a scrivere i dati di dominio | `keeps legacy domain-write parity while denying member administration` | PASS |
| admin scrive ma non elimina l'organizzazione | `lets an admin run the team but not delete the organization` | PASS |
| owner gestisce membership | `lets the owner manage members and protects the last owner` | PASS |
| `setActive` rifiuta un'org senza membership | `rejects setActive on an organization the caller is not a member of` | PASS |
| il client non può forzare `organizationId` negli args | `does not accept organizationId from the client` | PASS |
| invito pending con token hash | `stores only the token hash and returns the plaintext once` | PASS |
| scadenza invito | `rejects unknown and expired tokens` | PASS |
| accept idempotente | `is idempotent when the same invitation is accepted twice` | PASS |
| email case-insensitive | `accepts an invitation addressed to the caller, case-insensitively` | PASS |
| divieto self-invite | `refuses self-invitations, bad addresses and duplicates` | PASS |
| invito destinato a un'altra email non è accettabile | `rejects a token presented by somebody else` | PASS |
| membership unica sotto concorrenza | `converges on a single membership under concurrent accepts` | PASS |
| audit su ogni write, con attore/org/target | `audits every write with actor, organization and target` | PASS |
| nessun audit per write rifiutate | `does not write audit rows for refused writes` | PASS |
| self-heal idempotente (membership mancante, puntatore pendente, email cambiata) | `provisioning` suite (4 cases) + `self-heals a missing membership by rebuilding the personal workspace` + `repoints a dangling active organization instead of creating a new one` | PASS |
| il trigger Better Auth crea appUser + org + membership owner | `Better Auth provisioning trigger` suite (4 cases) | PASS |
| cancellazione org senza membership orfane | `deletes memberships and invitations with the organization` | PASS |

### Live: the trigger on the staging deployment

The hermetic suite exercises the hook against the real `createAuth`, but not the fact that Better Auth
*invokes* `databaseHooks.user.create.after` during a real sign-up. That gap was closed against
`wary-spaniel-466`:

```bash
# 1. push the new functions (required: see finding 1)
npx convex dev --once

# 2. sign up a throwaway user on the deployment
curl -s -X POST "$NUXT_PUBLIC_CONVEX_SITE_URL/api/auth/sign-up/email" \
  -H "origin: $NUXT_PUBLIC_BASE_URL" -H "content-type: application/json" \
  -d '{"email":"gate-g06-trigger-…@example.com","password":"…","name":"Gate G06 Retry"}'

# 3. read the app domain back
npx convex data appUsers --format json
npx convex data auditLogs --format json
```

Observed: `sign-up` → `200`; one `appUsers` row with the normalized address, `locale: "it-IT"`,
`globalRole: "user"` and `activeOrganizationId` pointing at a freshly created organization; two audit
records (`organization.created` with `reason: "personal_workspace"`, `organization.member_provisioned`),
both carrying the Better Auth user id as actor. The organization slug came out as
`gate-g06-retry-s-workspace-dd8b956c`, i.e. the legacy `deriveOrgNameFromUser` shape plus the
collision-proof suffix.

## Measured constraints (findings, not assumptions)

1. **`convex codegen` does not deploy the app's functions.** It bundles components and pushes the
   schema (the new tables were already visible), but the function bundle is only uploaded by
   `convex dev --once` / `convex deploy`. Proof: the first live sign-up (after codegen, before the
   push) created a Better Auth user **without** an `appUsers` row; after `convex dev --once` the next
   sign-up provisioned. That is also the exact scenario `ensureProvisioned` exists for — a user that
   predates the trigger — and it was observed live, not reasoned about.
2. **The `after` hook runs on the sign-up request path.** `better-auth/dist/db/with-hooks.mjs`
   queues `databaseHooks.*.create.after` through `queueAfterTransactionHook`, and
   `@better-auth/core/context/transaction.mjs` flushes the queue at the end of `runWithAdapter`,
   i.e. *after* the user row is committed but before the response returns, with no `try/catch`
   around it. A throwing hook would therefore turn a successful sign-up into a 500, which is why
   `scheduleAppUserProvisioning` catches and only logs, and why the public `ensureProvisioned` path
   is authoritative. Both behaviours are pinned by tests (`never fails a sign-up when scheduling is
   unavailable`, `does not schedule from a read-only context`).
3. **`isQueryCtx` is `"db" in ctx`.** A Convex action context (what the HTTP router hands to
   `createAuth`) has no `db`, so the guard lets actions schedule while refusing query contexts.
   convex-test reproduces this faithfully: an inline `t.action` context exposes
   `[runQuery, runMutation, runAction, auth, scheduler, storage, vectorSearch, meta]`.
4. **convex-test needs fake timers to drain an action-scheduled job.**
   `finishInProgressScheduledFunctions()` alone left a `runAfter(0)` job unexecuted and
   `finishAllScheduledFunctions(() => vi.runAllTimers())` without `vi.useFakeTimers()` throws
   *"Timers are not mocked"*. The provisioning test wraps the trigger call in
   `vi.useFakeTimers()` → drain → `vi.useRealTimers()`, which is what makes the end-to-end
   assertion (real scheduler → real internal mutation → real rows) possible without a deployment.
5. **convex-test ids are deterministic per table.** Two `convexTest()` instances create documents
   with the *same* ids (`…0001organizations`), so a test that opens a second backend for the second
   user makes its "foreign" organization id identical to a local one. The first version of this
   suite did exactly that and the cross-tenant cases silently exercised the wrong path; every test
   now shares one backend (`bootstrap` + `addUser`).
6. **Role capabilities are the plugin's, not an invention.** Measured from
   `better-auth/dist/plugins/organization/access/statement.mjs`: `member` has no permission on
   `organization`/`member`/`invitation`; `admin` has `organization.update`, `member.*`,
   `invitation.create/cancel` but no `organization.delete`; `owner` has everything. The Convex
   capability sets (`lib/authorization.ts`) mirror that, and the same module keeps the legacy
   `requireWrite` rule (owner | admin | member write domain resources) so a migration cannot
   silently remove a member's write access. Both halves are asserted in the same test, which is
   how the plan's "un member non scrive" is read: no *administrative* writes, domain writes intact.
7. **Argument validation is the anti-tampering control.** `v.object` validators reject extra
   fields, so `listMembers`/`inviteMember` called with a forged `organizationId` never reach the
   handler — asserted as a rejection rather than trusted.
8. **Expiry is evaluated, not stored.** Marking an invitation `expired` and then throwing would be
   rolled back by the transaction, so `acceptInvitation` refuses an expired token without writing
   and the `expired` status stays reserved for the Task 13 cron sweep.
9. **`appUsers.email` is a deliberate addition** to the plan's minimal field list. The organization
   domain has to answer "is this address already a member?" and "was this invitation addressed to
   me?" without a component round trip, and it must compare the way Better Auth compares
   (lower-cased). Better Auth remains the authority: `ensureProvisioned` refreshes the copy from the
   verified JWT on every login, which is also how a `changeEmail` reaches the domain (tested).
10. **The JWT already carries the email.** The Convex plugin's default payload is
    `omit(user, ["id", "image"])`, so `getAuthEmail` reads the standard OIDC `email` claim and only
    falls back to a component query when a token is minted without it — no component round trip on
    the hot path.

## Files

Created:
- `convex/lib/identity.ts` — `requireIdentity`, `findAppUserByAuthId`, `getAuthEmail`, `forbidden`,
  `normalizeEmail`
- `convex/lib/authorization.ts` — role capabilities (plugin parity + legacy domain-write rule),
  `AuthzContext`, `findMembership`, `requireAppUser`, `requireActiveOrganization`, `requireRole`,
  `countOwners`
- `convex/lib/audit.ts` — `AUDIT_ACTIONS`, `getCategoryFromAction`, `writeAudit` (same transaction as
  the write it describes)
- `convex/organizations.ts` — provisioning (`provisionAppUser`, `internal.provisionAuthUser`,
  `api.ensureProvisioned`), reads (`listMyOrganizations`, `getActiveOrganization`, `listMembers`,
  `listPendingInvitations`, `listMyInvitations`), writes (`createOrganization`, `updateOrganization`,
  `deleteOrganization`, `setActive`, `inviteMember`, `cancelInvitation`, `acceptInvitation`,
  `removeMember`, `updateMemberRole`), pure helpers (`slugify`, `generateOrgSlug`,
  `deriveOrganizationName`, `generateInvitationToken`, `hashInvitationToken`)
- `convex/organizations.test.ts` (32 cases — the G06 gate), `convex/auth.test.ts` (4 cases — the
  provisioning trigger)

Modified:
- `convex/schema.ts` — `appUsers`, `organizations`, `memberships`, `invitations`, `auditLogs` with
  tenant-first indexes (`by_org_user`, `by_organization_role`, `by_org_status`, `by_org_email`,
  `by_token_hash`, `by_auth_user`, `by_email`, `by_slug`)
- `convex/auth.ts` — `databaseHooks.user.create.after` → `scheduleAppUserProvisioning`
- `convex/migrations/authImport.ts` — re-exports `normalizeEmail` from `lib/identity` instead of
  keeping a second copy
- `package.json` — `test:gate:g06`; `test:migration` now passes positional filters that actually
  match (`vitest run test/migration convex` — the previous `convex/**/*.test.ts` argument was treated
  as a filter and matched nothing, so the Convex suites were never part of that run)

## Verified alongside

- `pnpm test:gate:g06` → 2 files, 36 tests passed
- `pnpm test:gate:g02` → 7 passed (unchanged after the deployment push)
- `pnpm test:gate:g03-g05` → 6 passed (live: the credential import and sign-in path still works with
  the provisioning trigger installed)
- `pnpm test:migration` → 8 files passed / 3 skipped, 63 tests passed / 13 skipped (gates unarmed; now
  includes the Convex suites)
- `pnpm typecheck:convex` → clean
- `npx eslint convex` → 0 errors (2 warnings from generated files)
- `pnpm typecheck` → unchanged pre-existing failures outside this perimeter (no app code touched)

## Handoffs

- **Task 6 (G07):** billing functions call `requireRole(ctx, ["owner"])` for checkout/portal and
  `requireActiveOrganization` for reads; the Creem component is already installed in
  `convex.config.ts`.
- **Task 10 (domain import):** imported users get their `appUsers` row through `ensureProvisioned`,
  so the legacy import must set `legacyId`, create the real `memberships` and point
  `activeOrganizationId` at the correct organization. A dangling pointer is repaired
  automatically, but a *valid* pointer at the auto-created personal workspace is legitimate state and
  is **not** rewritten.
- **Task 13 (email/jobs):** `inviteMember` returns the plaintext token and never sends mail itself;
  the invitation email and the `expired` sweep (status literal already in the schema) belong to the
  job/email task.
- **Task 12 (profile):** `appUsers.locale`/`globalRole` are the app-owned home of the legacy user
  columns the Better Auth component cannot store (`deferredProfileFields`).

## Staging leftovers to purge at the rehearsal

- Two throwaway sign-ups from the live trigger check (`gate-g06-trigger-…@example.com`) with their
  personal organizations, memberships and audit rows. The first one has **no** `appUsers` row: it was
  created before the functions were pushed, and is the live instance of the "user that predates the
  trigger" case that `ensureProvisioned` self-heals.
- `npx convex dev --once` also re-uploaded the Task 4 functions to the same dev deployment; no env
  var, secret or table was modified by this task.

## Gate status

| Gate | Status | Evidence |
| --- | --- | --- |
| G01 | PASS | `docs/migration/evidence/G01-cloudflare.md` |
| G02 | PASS | `docs/migration/evidence/G02-convex-vue.md` |
| G03 | PASS | `docs/migration/evidence/G03-G05-auth.md` |
| G04 | NOT_RUN | `docs/migration/evidence/G03-G05-auth.md` — OAuth round trip blocked |
| G05 | PASS | `docs/migration/evidence/G03-G05-auth.md` |
| **G06** | **PASS** | **This document** |
| G07–G10 | NOT_RUN | — |

Next authorized work: **Task 6** (G07: Creem billing per organization).
