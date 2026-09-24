import { logAudit } from "./audit";
import type { AuditAction, LogAuditOptions } from "./audit/types";
import { getServerSiteMode } from "./siteMode";

/**
 * Audit for the legacy Better Auth hooks, aware of the cutover (migration
 * Task 17, fix round 1).
 *
 * `maintenance-readonly` keeps password login open, and a login ran the auth
 * `after` hook, which wrote an `audit_log` row — an exported, reconciled table.
 * After the watermark that row is lost (or shows up as drift), so in read-only
 * the hook emits a structured log line instead. The line carries the action,
 * the status and the user id only: no email, no IP, no user agent.
 *
 * Final review I2: the same holds in `maintenance`. After runbook step 10 the
 * blue stack sits in `maintenance` as the rollback asset and must not write
 * ("il blu non scrive più, mai"), yet the admin break-glass keeps sign-in open.
 */
const AUTH_WRITES_SUPPRESSED_IN: readonly string[] = ["maintenance-readonly", "maintenance"];

export async function auditAuthEvent(action: AuditAction, opts: Partial<LogAuditOptions>): Promise<void> {
    if (AUTH_WRITES_SUPPRESSED_IN.includes(await getServerSiteMode())) {
        console.info(
            JSON.stringify({
                event: "audit.suppressed_readonly",
                action,
                status: opts.status ?? "success",
                userId: opts.userId ?? null,
            }),
        );
        return;
    }
    await logAudit(null, action, opts);
}

/**
 * Whether the login self-heal may create a personal organization. Not in
 * `maintenance-readonly` (it would write `organization` + `member` after the
 * watermark) nor in `maintenance` (final review I2: the blue stack after step
 * 10). Every imported user already has one, so a login is unaffected.
 */
export async function shouldSelfHealOrg(): Promise<boolean> {
    return !AUTH_WRITES_SUPPRESSED_IN.includes(await getServerSiteMode());
}
