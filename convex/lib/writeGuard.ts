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
 * functions (import, webhooks, jobs, crons, the CLI `siteSettings.set`) are not
 * public and are not guarded: they are operator or provider paths, and the
 * runbook controls them (the job queue drains; webhooks are provider truth).
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
// the same rule as the Worker applies (`shared/constants/siteMode.ts`,
// `READONLY_ALLOWED_WRITES`): password login, TOTP verification and logout are
// the only writes (sessions, ephemeral); reads pass except the GETs that write.
// Paths are Better Auth's own (`/sign-in/email`), without the `/api/auth` base.

const AUTH_WRITES_OUTSIDE_ACTIVE = ["/sign-in/email", "/two-factor/verify-totp", "/sign-out"] as const;
const AUTH_GETS_THAT_WRITE = ["/callback/", "/oauth2/", "/verify-email", "/magic-link/"] as const;

export function authEndpointAllowed(mode: SiteMode, method: string, path: string): boolean {
    if (mode === "active") return true;
    const upper = method.toUpperCase();
    if (upper === "GET" || upper === "HEAD" || upper === "OPTIONS") {
        return !AUTH_GETS_THAT_WRITE.some((prefix) => path.startsWith(prefix));
    }
    return (AUTH_WRITES_OUTSIDE_ACTIVE as readonly string[]).includes(path);
}
