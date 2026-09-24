import { ConvexError } from "convex/values";

import type { SiteMode } from "../siteSettings";

/**
 * Site-mode write guard for Convex (migration Task 17, fix round 1).
 *
 * On the new stack the browser's Convex client calls public mutations
 * directly, so the Worker's `maintenance-readonly` gate on `/api/*` cannot stop
 * them. Without this guard, "abilita scritture Convex" (runbook step 10) would
 * be a flag nothing enforces and any open SPA could write between the DNS
 * switch and GO. Every public mutation/action goes through
 * `convex/lib/functions.ts`, which calls `assertWritable` first; a test
 * enumerates the public functions so a new one cannot skip it.
 *
 * Policies, and what each mode allows (explicit, the one place it is decided):
 *
 * | policy          | active | waitinglist | maintenance-readonly | maintenance |
 * |-----------------|:------:|:-----------:|:--------------------:|:-----------:|
 * | domain          |   ✓    |      ✗      |          ✗           |      ✗      |
 * | guest           |   ✓    |      ✓      |          ✗           |      ✗      |
 * | siteModeSwitch  |   ✓    |      ✓      |          ✓           |      ✓      |
 *
 * - `domain`: every tenant/account/admin write, checkout, upload, invite.
 * - `guest`: the guest's own token paths (RSVP, open tracking). Waitinglist
 *   keeps them open as the legacy did (tokens already in circulation); the two
 *   maintenance modes close them, because in the cutover a guest write after the
 *   watermark is exactly the write that must not happen.
 * - `siteModeSwitch`: `admin.setSiteMode` (superAdmin, reason, audit) — the
 *   break-glass that must be able to undo any mode, so it is allowed in all.
 *
 * Reads are never guarded (queries, and actions tagged `read`). Internal
 * functions (import, webhooks, the CLI `siteSettings.set`) are not public and
 * are not guarded by this matrix: they are operator or provider paths.
 *
 * Crons and the job runner are internal too, but they are **not** exempt
 * (final review C2): they produce external or destructive side effects (emails
 * to guests and organizers, R2 deletions, account purge, event deletion,
 * exports, image variants). From the T-1 production import until runbook step
 * 10 — and after a §A rollback — the blue stack is the live one, so the green
 * deployment must stay inert. `sideEffectsAllowed` is the one rule: only
 * `active` runs them. Outside `active` every cron is a logged no-op and
 * `jobs.run` leaves the job `pending`/`retrying` untouched (no attempt counted,
 * never dead-lettered); `cronRecoverStalledJobs` picks it up once the mode is
 * `active` again.
 */

export type WritePolicy = "domain" | "guest" | "siteModeSwitch";

export const SITE_READ_ONLY = "SITE_READ_ONLY";

const ALLOWED: Record<SiteMode, readonly WritePolicy[]> = {
    active: ["domain", "guest", "siteModeSwitch"],
    waitinglist: ["guest", "siteModeSwitch"],
    "maintenance-readonly": ["siteModeSwitch"],
    maintenance: ["siteModeSwitch"],
};

export function writesAllowed(mode: SiteMode, policy: WritePolicy): boolean {
    return ALLOWED[mode].includes(policy);
}

/** Crons and jobs (external/destructive side effects) run only in `active`. */
export function sideEffectsAllowed(mode: SiteMode): boolean {
    return mode === "active";
}

export function assertWritableMode(mode: SiteMode, policy: WritePolicy): void {
    if (!writesAllowed(mode, policy)) {
        throw new ConvexError({ code: SITE_READ_ONLY, mode, policy });
    }
}

// ---------------------------------------------------------------------------
// Better Auth endpoints (fix round 2, N4)
// ---------------------------------------------------------------------------
//
// The Better Auth routes are also reachable on the deployment's own
// `.convex.site` host, bypassing the Worker's read-only gate. Outside `active`
// the same rule as the Worker applies (`shared/constants/siteMode.ts`), mode by
// mode (final review I2, symmetric with the Worker):
//
// - `maintenance-readonly`: `READONLY_ALLOWED_WRITES` — password login, TOTP
//   verification and logout (sessions, ephemeral). Not the backup code: it
//   consumes a credential after the watermark.
// - `maintenance` / `waitinglist`: the admin break-glass
//   (`ADMIN_BREAK_GLASS_AUTH_PATHS`) — the same, plus the backup-code
//   verification, so a superAdmin without the TOTP device can still reach the
//   console. Never 2FA enable/disable, sign-up or OAuth.
//
// Reads pass except the GETs that write. Paths are Better Auth's own
// (`/sign-in/email`), without the `/api/auth` base.

const AUTH_WRITES_READONLY = ["/sign-in/email", "/two-factor/verify-totp", "/sign-out"] as const;
const AUTH_WRITES_BREAK_GLASS = [...AUTH_WRITES_READONLY, "/two-factor/verify-backup-code"] as const;
const AUTH_GETS_THAT_WRITE = ["/callback/", "/oauth2/", "/verify-email", "/magic-link/"] as const;

export function authEndpointAllowed(mode: SiteMode, method: string, path: string): boolean {
    if (mode === "active") return true;
    const upper = method.toUpperCase();
    if (upper === "GET" || upper === "HEAD" || upper === "OPTIONS") {
        return !AUTH_GETS_THAT_WRITE.some((prefix) => path.startsWith(prefix));
    }
    const allowed: readonly string[] =
        mode === "maintenance-readonly" ? AUTH_WRITES_READONLY : AUTH_WRITES_BREAK_GLASS;
    return allowed.includes(path);
}
