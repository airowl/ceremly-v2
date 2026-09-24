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
    "file",
    "guest",
    "invite",
    "organization",
    "payment",
    "project",
    "reminder",
    "team",
    "user",
    "admin",
    "security",
    // Task 12: le due categorie dei form pubblici (legacy `audit/types.ts`).
    "contact",
    "waiting_list",
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
    // Billing (Task 6). `checkout.completed` / `event.unlocked` / `event.relocked`
    // keep the legacy taxonomy so the migrated records stay greppable next to
    // the historical ones; `billing.checkout_created` is new (the legacy app
    // audited neither the checkout creation nor the portal).
    "billing.checkout_created": "payment",
    "checkout.completed": "payment",
    "event.unlocked": "event",
    "event.relocked": "event",
    // Tenant domain (Task 11): event and guest CRUD, verbatim from the legacy
    // taxonomy (`server/utils/audit/types.ts`) so migrated rows and rows written
    // after the cutover are greppable together.
    "event.created": "event",
    "event.updated": "event",
    "event.deleted": "event",
    // Avviso di cleanup (Task 13): il legacy lo scriveva già con questo nome
    // (`eventCleanup.service`), ed è l'unico modo di sapere *quando* l'organizzatore
    // è stato avvisato senza fidarsi di `cleanupWarnedAt` da solo.
    "event.cleanup_warned": "event",
    "guest.created": "guest",
    "guest.updated": "guest",
    "guest.deleted": "guest",
    "guest.imported": "guest",
    // Files and media (Task 7). The five `file.*` names are the legacy taxonomy
    // (`server/utils/audit/types.ts`), so migrated records stay greppable next to
    // the historical ones; the two `file.variant_*` names are new (the legacy app
    // only logged variant failures to the console).
    "file.presign_requested": "file",
    "file.upload_confirmed": "file",
    "file.uploaded": "file",
    "file.dedup_matched": "file",
    "file.deleted": "file",
    "file.variant_ready": "file",
    "file.variant_failed": "file",
    // `invite`, `reminder` and `project` are categories the legacy declared but
    // that had no writer yet on the Convex side.
    "invite.sent": "invite",
    // Task 14: the legacy `send-test` wrote no audit row (only the generic
    // `email.sent`, which has no actor). The request is audited when it is queued;
    // delivery, retries and the terminal state live in `jobExecutions`.
    "invite.test_requested": "invite",
    "reminder.updated": "reminder",
    "project.created": "project",
    "project.updated": "project",
    "project.deleted": "project",
    // Profilo, GDPR e form pubblici (Task 12). I nomi sono quelli del legacy per
    // restare greppabili accanto ai record migrati; `user.account_purged` esiste
    // già nel legacy (il cron del purge non auditava, ma l'azione era dichiarata).
    "user.profile_updated": "user",
    "user.account_deleted": "user",
    "user.account_purged": "user",
    "user.data_export_requested": "user",
    "contact.sent": "contact",
    "waiting_list.subscribed": "waiting_list",
    "admin.site_mode_changed": "admin",
    /** Ripresa manuale di un job `dead` da parte di un superAdmin (Task 13). */
    "admin.job_retried": "admin",
    // Email (Task 13). I due nomi sono quelli del legacy (`server/utils/email.ts`
    // auditava ogni invio e ogni fallimento con `email.sent`/`email.failed`), quindi
    // i record scritti da Convex e quelli storici restano greppabili insieme.
    "email.sent": "email",
    "email.failed": "email",
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
