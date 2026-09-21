import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Audit trail (plan Task 5, Step 4: "ogni create/update/delete/setActive scrive
 * audit con attore, org, target e dettagli").
 *
 * Taxonomy is the legacy one (`server/utils/audit/types.ts`) with the same
 * `resource.verb` naming, so the migrated records stay greppable next to the
 * historical ones.
 *
 * Unlike the legacy `logAudit`, which swallowed failures to avoid breaking a
 * request, `writeAudit` runs inside the same Convex transaction as the write it
 * describes: if the audit cannot be written, the write does not happen. That is
 * the stronger guarantee the plan asks for ("ogni write applicativa e
 * amministrativa produce un record di audit").
 */

export const AUDIT_CATEGORIES = [
    "auth",
    "email",
    "event",
    "guest",
    "organization",
    "team",
    "user",
    "admin",
    "security",
] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

const AUDIT_ACTION_CATEGORY = {
    "organization.created": "organization",
    "organization.updated": "organization",
    "organization.deleted": "organization",
    "organization.activated": "organization",
    "organization.member_provisioned": "organization",
    "organization.membership_repaired": "organization",
    "team.member_invited": "team",
    "team.invitation_canceled": "team",
    "team.invite_accepted": "team",
    "team.member_removed": "team",
    "team.permissions_updated": "team",
} as const satisfies Record<string, AuditCategory>;

export type AuditAction = keyof typeof AUDIT_ACTION_CATEGORY;

export const AUDIT_ACTIONS: Record<AuditAction, AuditAction> = Object.fromEntries(
    Object.keys(AUDIT_ACTION_CATEGORY).map((action) => [action, action]),
) as Record<AuditAction, AuditAction>;

/** Category of an action; an unmapped action is a programming error, not a guess. */
export function getCategoryFromAction(action: AuditAction): AuditCategory {
    return AUDIT_ACTION_CATEGORY[action];
}

export interface WriteAuditInput {
    action: AuditAction;
    /** Caller, when the write is user-driven. */
    actorAppUserId?: Id<"appUsers">;
    actorAuthUserId?: string;
    /** Tenant the write belongs to; omitted only for pre-provisioning events. */
    organizationId?: Id<"organizations">;
    targetType?: string;
    targetId?: string;
    status?: "success" | "failure";
    details?: Record<string, unknown>;
}

export async function writeAudit(ctx: MutationCtx, input: WriteAuditInput): Promise<void> {
    await ctx.db.insert("auditLogs", {
        action: input.action,
        category: getCategoryFromAction(input.action),
        actorAppUserId: input.actorAppUserId,
        actorAuthUserId: input.actorAuthUserId,
        organizationId: input.organizationId,
        targetType: input.targetType,
        targetId: input.targetId,
        status: input.status ?? "success",
        details: input.details,
        createdAt: Date.now(),
    });
}
