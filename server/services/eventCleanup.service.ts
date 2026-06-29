/**
 * Event Cleanup Service (SPEC §9) — system context (Vercel Cron, no user).
 * Two idempotent phases: warn (email to owner + cleanupWarnedAt) and delete (FK
 * cascade). Atelier org exclusion is HERE via isOrgAtelier (not in SQL: requires
 * the per-org subscription). No heavy work: operates on pre-filtered lists.
 *
 * ⚠️ SECURITY: the isOrgAtelier() guard is the first operation for each candidate
 * — if true, immediate skip. This prevents warn/delete of Atelier org events
 * (paying customers) that appear in the list due to free/celebration tier.
 */
import {
    findStaleEventsToWarn,
    findStaleEventsToDelete,
    markEventCleanupWarned,
    findEventWarnTargetInfo,
    deleteEventScoped,
} from "../repositories/eventRepository";
import { isOrgAtelier } from "./eventAccess.service";
import { resolveOrgOwnerId } from "./planLimit.service";
import { sendEmail } from "../utils/email";
import { renderEventCleanupWarningEmail, emailSubjects } from "../emailTemplates";
import { logAudit } from "../utils/audit";
import { runtimeConfig } from "../utils/runtimeConfig";

const WARN_DAYS_LEFT = 7;

function dashboardEventUrl(eventId: string): string {
    const base = ((runtimeConfig.public.baseURL as string) || "").replace(/\/$/, "");
    return `${base}/dashboard/events/${eventId}`;
}

export async function processStaleEventsWarn(): Promise<{ warned: number; skipped: number }> {
    const now = new Date();
    const candidates = await findStaleEventsToWarn(now);
    let warned = 0;
    let skipped = 0;

    for (const { id, organizationId } of candidates) {
        // ⚠️ CRITICAL: Atelier exclusion before any other operation
        if (await isOrgAtelier(organizationId)) {
            skipped++;
            continue;
        }

        const ownerId = await resolveOrgOwnerId(organizationId);
        if (!ownerId) {
            skipped++;
            continue;
        }

        const info = await findEventWarnTargetInfo(organizationId, id, ownerId);
        if (!info) {
            skipped++;
            continue;
        }

        const language = info.locale === "en" ? "en" : "it";
        const { html, text } = await renderEventCleanupWarningEmail({
            language,
            eventTitle: info.title,
            dashboardUrl: dashboardEventUrl(id),
            daysLeft: WARN_DAYS_LEFT,
        });

        await sendEmail({
            type: "custom",
            to: info.email,
            userId: ownerId,
            language,
            subject: emailSubjects.eventCleanupWarning(info.title)[language],
            html,
            text,
        });

        await markEventCleanupWarned(organizationId, id, now);

        await logAudit(null, "event.cleanup_warned", {
            organizationId,
            targetType: "event",
            targetId: id,
            details: { daysLeft: WARN_DAYS_LEFT },
        });

        warned++;
    }

    return { warned, skipped };
}

export async function processStaleEventsDelete(): Promise<{ deleted: number; skipped: number }> {
    const now = new Date();
    const candidates = await findStaleEventsToDelete(now);
    let deleted = 0;
    let skipped = 0;

    for (const { id, organizationId } of candidates) {
        // ⚠️ CRITICAL: Atelier exclusion before any other operation
        if (await isOrgAtelier(organizationId)) {
            skipped++;
            continue;
        }

        const removed = await deleteEventScoped(organizationId, id);
        if (!removed) {
            skipped++;
            continue;
        }

        await logAudit(null, "event.deleted", {
            organizationId,
            targetType: "event",
            targetId: id,
            details: { reason: "auto_cleanup" },
        });

        deleted++;
    }

    return { deleted, skipped };
}
