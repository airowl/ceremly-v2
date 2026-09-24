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
 */
export async function auditAuthEvent(action: AuditAction, opts: Partial<LogAuditOptions>): Promise<void> {
    if ((await getServerSiteMode()) === "maintenance-readonly") {
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
 * `maintenance-readonly`: it would write `organization` + `member` after the
 * watermark. Every imported user already has one, so a login is unaffected.
 */
export async function shouldSelfHealOrg(): Promise<boolean> {
    return (await getServerSiteMode()) !== "maintenance-readonly";
}
