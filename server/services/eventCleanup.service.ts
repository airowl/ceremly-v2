/**
 * Event Cleanup Service (SPEC §9) — contesto di sistema (Vercel Cron, no utente).
 * Due fasi idempotenti: warn (email all'owner + cleanupWarnedAt) e delete (cascade
 * FK). L'esclusione org Atelier è QUI via isOrgAtelier (non nel SQL: richiede la
 * subscription per-org). Nessun lavoro pesante: lavora su liste già filtrate.
 *
 * ⚠️ SICUREZZA: la guardia isOrgAtelier() è la prima operazione per ogni candidato
 * — se vero, skip immediato. Questo previene warn/delete di eventi di org Atelier
 * (clienti paganti) che appaiono nella lista per tier free/celebration.
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
        // ⚠️ CRITICAL: esclusione Atelier prima di qualsiasi altra operazione
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
        // ⚠️ CRITICAL: esclusione Atelier prima di qualsiasi altra operazione
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
