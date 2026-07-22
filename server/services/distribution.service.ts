/**
 * Distribution Service — invite sending via email/WhatsApp (SPEC §6 "Distribution", owner B3).
 *
 * Pattern project.service:
 *   1. organizationId ALWAYS from event.context.organization (RBAC guard), never from body.
 *   2. Repository queries org-scoped by-construction (distributionRepository).
 *   3. assertOwnership as 2nd guard on the event.
 *   4. logAudit on every organizer write.
 *
 * Email sending is 1 QStash job per guest ('send-invite-email'): the service
 * enqueues, marks sentAt/sentChannel and writes the activity; the actual rendering/sending
 * happens in the job handler (server/queue/handlers).
 */
import type { H3Event, EventHandlerRequest } from "~~/server/types/h3";
import type { MarkSentInput, SendInvitesInput, SendTestInput } from "~~/shared/schemas/ceremly";
import type { EventDistribution } from "~~/shared/types/ceremly";
import { findEventByIdScoped, updateEventScoped } from "../repositories/eventRepository";
import {
    findGuestsForSend,
    insertActivities,
    markSent,
} from "../repositories/distributionRepository";
import { assertOwnership } from "../utils/permissions";
import { logAudit } from "../utils/audit";
import { sendEmail } from "../utils/email";
import { emailSubjects, renderGuestInviteEmail } from "../emailTemplates";
import { dispatch } from "../queue";
import { signPreviewToken } from "../utils/previewToken";

/** Maximum QStash dispatch concurrency per send (#6: avoids timeout on large lists). */
const DISPATCH_CONCURRENCY = 10;

/** Dummy token for the test email link/pixel (the public 404 is graceful). */
const TEST_TOKEN = "preview";

/** Example guest name for the test email (SPEC §6 send-test). */
const TEST_GUEST_NAME = "Anna";

/** Fallback body if the organizer has not yet written a message. */
const FALLBACK_INVITE_BODY
    = "Ciao {nome},\n\nc'è un invito che ti aspetta. Apri il link per scoprire tutti i dettagli e confermare la tua presenza:\n{link}";

// ---------------------------------------------------------------------------
// Pure/shared helpers (also used by the queue job handlers)
// ---------------------------------------------------------------------------

/** Replaces the {nome} and {link} placeholders in subject/body. */
export function applyInvitePlaceholders(
    text: string,
    values: { nome: string; link: string },
): string {
    return text.split("{nome}").join(values.nome).split("{link}").join(values.link);
}

/** Public baseURL without trailing slash (same construction as guest.service). */
export function getPublicBaseUrl(): string {
    const config = useRuntimeConfig();
    return String(config.public.baseURL ?? "").replace(/\/+$/, "");
}

/** Personal guest link: `{baseURL}/e/{slug}/{token}`. */
export function buildGuestInviteLink(slug: string, token: string): string {
    return `${getPublicBaseUrl()}/e/${slug}/${token}`;
}

/** Email open tracking pixel: `{baseURL}/api/public/pixel/{token}.gif`. */
export function buildGuestPixelUrl(token: string): string {
    return `${getPublicBaseUrl()}/api/public/pixel/${token}.gif`;
}

/**
 * Signed preview link for the test email: `{baseURL}/e/{slug}/preview?sig=...`.
 * The HMAC signature authorizes preview mode on the public page (rendered invite,
 * example guest, read-only RSVP) without exposing guest data or allowing
 * enumeration: `/e/{slug}/preview` typed manually (without sig) remains 404.
 */
export function buildPreviewLink(slug: string): string {
    const sig = signPreviewToken(slug);
    return `${getPublicBaseUrl()}/e/${slug}/${TEST_TOKEN}?sig=${encodeURIComponent(sig)}`;
}

// ---------------------------------------------------------------------------
// Guard comuni
// ---------------------------------------------------------------------------

/** Reads the active org from context. 401 if missing (RBAC guard not executed). */
function getOrgId(event: H3Event<EventHandlerRequest>): string {
    const orgId = event.context.organization?.id;
    if (!orgId) {
        throw createError({
            statusCode: 401,
            statusMessage: "Organizzazione attiva non risolta",
        });
    }
    return orgId;
}

/** Scoped event + assertOwnership (common guard for nested routes). */
async function requireEventScoped(
    event: H3Event<EventHandlerRequest>,
    eventId: string,
) {
    const organizationId = getOrgId(event);
    const eventRow = await findEventByIdScoped(organizationId, eventId);
    return { organizationId, eventRow: assertOwnership(eventRow, organizationId) };
}

/** 422 if the event is closed: no new sends until it is reopened. */
function assertEventNotClosed(eventRow: { status: string }): void {
    if (eventRow.status === "closed") {
        throw createError({
            statusCode: 422,
            statusMessage: "Evento chiuso: riaprilo per inviare nuovi inviti.",
        });
    }
}

// ---------------------------------------------------------------------------
// Email invite sending (SPEC §6 POST /api/events/:id/send)
// ---------------------------------------------------------------------------

/**
 * Enqueues invite sending to the selected guests:
 * - event 'closed' → 422; event 'draft' → automatic activation (the first
 *   send activates the event, otherwise sent links would respond 404);
 * - resolves guestIds org+event scoped, ONLY active ones (out-of-scope are omitted);
 * - saves subject/body in event.distribution (merge) BEFORE dispatch
 *   (the job handler reads from there; in dev the job runs in-process immediately);
 * - for guests WITH email: markSent 'email' + activity invite_sent + job;
 * - returns { queued, skippedNoEmail }.
 */
export async function sendInvites(
    event: H3Event<EventHandlerRequest>,
    eventId: string,
    data: SendInvitesInput,
) {
    const { organizationId, eventRow } = await requireEventScoped(event, eventId);
    assertEventNotClosed(eventRow);

    const guests = await findGuestsForSend(organizationId, eventId, data.guestIds);
    const withEmail = guests.filter((g) => !!g.email);
    const skippedNoEmail = guests.length - withEmail.length;

    // Merge (not replacement) of the distribution: subject/body updated,
    // whatsappTemplate/senderName preserved. First send on draft → the event
    // becomes 'active' in the same update (distribution activates the event).
    const distribution: EventDistribution = {
        ...eventRow.distribution,
        emailSubject: data.subject,
        emailBody: data.body,
    };
    await updateEventScoped(organizationId, eventId, {
        distribution,
        ...(eventRow.status === "draft" ? { status: "active" } : {}),
    });

    // 1 job per guest. Dispatch FIRST, then mark "sent" + activity ONLY for
    // guests actually enqueued: a failed enqueue must not appear as "Sent" in
    // the dashboard (the organizer can retry). Consumer-side idempotency
    // (upstash-message-id) prevents duplicates on QStash retries.
    //
    // Chunked concurrent dispatch (#6): N serial QStash round-trips risk a
    // serverless function timeout on large lists (bulk import → hundreds).
    // Chunks reduce wall-clock by ~DISPATCH_CONCURRENCY× while maintaining
    // per-guest isolation (one failure does not block others).
    //
    // One dispatchId per invocation of sendInvites, shared by every guest's job
    // payload: a QStash retry re-delivers the SAME message (same dispatchId → same
    // Resend idempotency key, no duplicate email), while a NEW /send call (deliberate
    // re-send) gets a fresh dispatchId → a fresh key → a real re-send goes out.
    const dispatchId = crypto.randomUUID();
    const enqueued: typeof withEmail = [];
    const failedIds: string[] = [];
    for (let i = 0; i < withEmail.length; i += DISPATCH_CONCURRENCY) {
        const chunk = withEmail.slice(i, i + DISPATCH_CONCURRENCY);
        const settled = await Promise.allSettled(
            chunk.map((g) => dispatch("send-invite-email", { guestId: g.id, dispatchId })),
        );
        settled.forEach((res, idx) => {
            const guest = chunk[idx]!;
            if (res.status === "fulfilled") {
                enqueued.push(guest);
            } else {
                failedIds.push(guest.id);
                console.error(`[distribution] dispatch send-invite-email failed for guest ${guest.id}:`, res.reason);
            }
        });
    }

    if (enqueued.length > 0) {
        await markSent(organizationId, enqueued.map((g) => g.id), "email");
        await insertActivities(enqueued.map((g) => ({
            organizationId,
            eventId,
            guestId: g.id,
            type: "invite_sent" as const,
            meta: { channel: "email" },
        })));
    }

    const queued = enqueued.length;
    const failed = failedIds.length;

    await logAudit(event, "invite.sent", {
        organizationId,
        targetType: "event",
        targetId: eventId,
        details: { channel: "email", queued, skippedNoEmail, failed },
    });

    return { queued, skippedNoEmail, failed };
}

// ---------------------------------------------------------------------------
// Email di test (SPEC §6 POST /api/events/:id/send-test)
// ---------------------------------------------------------------------------

/**
 * Sends immediately (NO queue) the invite email to the current user, with
 * example guest "Anna" and dummy link/pixel. Optional override of subject/body
 * to preview the text before saving. No writes to Ceremly tables.
 */
export async function sendTest(
    event: H3Event<EventHandlerRequest>,
    eventId: string,
    override: SendTestInput,
) {
    const { eventRow } = await requireEventScoped(event, eventId);

    const user = event.context.user;
    if (!user?.email) {
        throw createError({ statusCode: 401, statusMessage: "Email dell'utente non disponibile" });
    }

    const link = buildPreviewLink(eventRow.slug);
    const values = { nome: TEST_GUEST_NAME, link };
    const distribution = eventRow.distribution;
    const subject = applyInvitePlaceholders(
        override.subject || distribution.emailSubject || emailSubjects.guestInvite(eventRow.title),
        values,
    );
    const message = applyInvitePlaceholders(
        override.body || distribution.emailBody || FALLBACK_INVITE_BODY,
        values,
    );

    const { html, text } = await renderGuestInviteEmail({
        eventTitle: eventRow.title,
        firstName: TEST_GUEST_NAME,
        message,
        ctaUrl: link,
        pixelUrl: buildGuestPixelUrl(TEST_TOKEN),
    });

    const result = await sendEmail({
        type: "custom",
        to: user.email,
        subject,
        html,
        text,
        userId: user.id,
    });
    if (!result.success) {
        throw createError({ statusCode: 502, statusMessage: "Invio dell'email di test non riuscito" });
    }
    return { success: true };
}

// ---------------------------------------------------------------------------
// Mark sent WhatsApp (SPEC §6 POST /api/events/:id/mark-sent)
// ---------------------------------------------------------------------------

/**
 * Marks selected guests as sent via WhatsApp ("Copy" button):
 * markSent 'whatsapp' + activity invite_sent { channel: 'whatsapp' } + audit.
 * Event 'closed' → 422; event 'draft' → automatic activation (same as send).
 */
export async function markWhatsappSent(
    event: H3Event<EventHandlerRequest>,
    eventId: string,
    data: MarkSentInput,
) {
    const { organizationId, eventRow } = await requireEventScoped(event, eventId);
    assertEventNotClosed(eventRow);
    if (eventRow.status === "draft") {
        // First send (mark-sent WhatsApp) on draft → the event becomes 'active'.
        await updateEventScoped(organizationId, eventId, { status: "active" });
    }

    const guests = await findGuestsForSend(organizationId, eventId, data.guestIds);
    if (guests.length > 0) {
        await markSent(organizationId, guests.map((g) => g.id), "whatsapp");
        await insertActivities(guests.map((g) => ({
            organizationId,
            eventId,
            guestId: g.id,
            type: "invite_sent" as const,
            meta: { channel: "whatsapp" },
        })));
    }

    await logAudit(event, "invite.sent", {
        organizationId,
        targetType: "event",
        targetId: eventId,
        details: { channel: "whatsapp", marked: guests.length },
    });

    return { marked: guests.length };
}
