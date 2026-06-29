/**
 * Public Invite Service — business logic for public guest routes
 * (SPEC §6 "Public guest" + §6.2 + §8, owner B2).
 *
 * Key rules:
 *  - NO auth: the guest accesses via an opaque token. GENERIC and indistinguishable
 *    404 ("Invito non disponibile") for non-existent token / removed guest / draft
 *    event → no enumeration (SPEC §8.2).
 *  - The public payload §6.2 is built FIELD BY FIELD, never with a spread of the
 *    DB row: exposing organizationId, email/phone/notes, token, or internal ids is forbidden.
 *  - Guest actions are NOT audit-logged (no userId): only guest_activities.
 */
import type { PublicRsvpInput } from "~~/shared/schemas/ceremly";
import type {
    AttendingStatus,
    EventTypeKey,
    PublicInvitePayload,
    RsvpAnswers,
} from "~~/shared/types/ceremly";
import { getVisibleQuestions, validateRsvpSubmission } from "~~/shared/utils/rsvpLogic";
import {
    findGuestWithEventByToken,
    insertActivity,
    markEmailOpened,
    trackOpen,
    upsertResponse,
} from "../repositories/publicRsvpRepository";
import { clearEventCleanupWarned, findEventBySlug } from "../repositories/eventRepository";
import { verifyPreviewToken } from "../utils/previewToken";
import { DEFAULT_RSVP_CLOSED_MESSAGE } from "./event.service";

/** Example guest name for the signed preview (aligned with the test email). */
const PREVIEW_GUEST_NAME = "Anna";

/** Generic 404 §8.2: same response for every cause (no enumeration). */
function inviteNotFound() {
    return createError({ statusCode: 404, statusMessage: "Invito non disponibile" });
}

/**
 * Lookup by token + visibility gate: the invite exists for the guest only if
 * the token matches, the guest is not removed, and the event is not in draft.
 */
async function findActiveInviteByToken(token: string) {
    const row = await findGuestWithEventByToken(token);
    if (!row || row.guest.removedAt !== null || row.event.status === "draft") {
        throw inviteNotFound();
    }
    return row;
}

/** true if the RSVP deadline exists and has passed. */
function isDeadlinePassed(rsvpDeadline: Date | null, now: Date): boolean {
    return rsvpDeadline !== null && now > rsvpDeadline;
}

/** Event row for the public payload (both guest-token and signed preview paths). */
type InviteEventRow = NonNullable<Awaited<ReturnType<typeof findEventBySlug>>>;

/**
 * §6.2 mapping of the `event` field — field by field, NEVER spread of the DB row.
 * Single builder so the guest invite and the preview never diverge as fields change.
 */
function buildInviteEventPayload(eventRow: InviteEventRow): PublicInvitePayload["event"] {
    return {
        title: eventRow.title,
        type: eventRow.type as EventTypeKey,
        templateKey: eventRow.templateKey,
        theme: eventRow.theme,
        inviteFont: eventRow.inviteFont,
        eventDate: eventRow.eventDate?.toISOString() ?? null,
        eventTime: eventRow.eventTime,
        blocks: eventRow.blocks,
        rsvpConfig: eventRow.rsvpConfig,
        rsvpDeadline: eventRow.rsvpDeadline?.toISOString() ?? null,
        rsvpClosedMessage: eventRow.rsvpClosedMessage ?? DEFAULT_RSVP_CLOSED_MESSAGE,
        slug: eventRow.slug,
    };
}

/**
 * GET /api/public/invite/:token (SPEC §6.2).
 * Tracking side-effect: openCount+1, firstOpenedAt on first access,
 * activity `link_opened` with meta { nth } (progressive open count).
 */
export async function getPublicInvite(token: string): Promise<PublicInvitePayload> {
    const { guest, event: eventRow, response } = await findActiveInviteByToken(token);

    const isFirst = guest.firstOpenedAt === null;
    const nth = guest.openCount + 1;
    await Promise.all([
        trackOpen(guest.id, isFirst),
        insertActivity(guest.organizationId, guest.eventId, guest.id, "link_opened", { nth }),
    ]);

    // Event 'closed': the invite remains visible (more courteous than a 404) but
    // the RSVP form is closed, exactly as when the deadline has passed.
    const deadlinePassed = eventRow.status === "closed"
        || isDeadlinePassed(eventRow.rsvpDeadline, new Date());

    // Payload §6.2 field by field — NEVER spread of the DB row.
    return {
        event: buildInviteEventPayload(eventRow),
        guest: {
            firstName: guest.firstName,
            lastName: guest.lastName,
        },
        response: response
            ? {
                    attending: response.attending as AttendingStatus,
                    companionsCount: response.companionsCount,
                    answers: response.answers,
                    declineMessage: response.declineMessage,
                    updatedAt: response.updatedAt.toISOString(),
                }
            : null,
        deadlinePassed,
    };
}

/**
 * GET /api/public/preview?slug=&sig= — signed invite preview (link from the
 * test email). `sig` must be a valid HMAC for the slug, otherwise generic 404
 * (same response as a non-existent invite: no enumeration).
 * Renders the invite with the example guest and WITHOUT tracking side-effects; the
 * `preview: true` flag puts the RSVP form in read-only mode on the client.
 * Unlike for guests, draft events are visible (that is the point of the preview).
 */
export async function getInvitePreview(slug: string, sig: string): Promise<PublicInvitePayload> {
    if (!verifyPreviewToken(slug, sig)) throw inviteNotFound();

    const eventRow = await findEventBySlug(slug);
    if (!eventRow) throw inviteNotFound();

    // Same calculation as the guest path: the preview reflects the real state
    // (closed/deadline passed) so the planner sees what guests see.
    const deadlinePassed = eventRow.status === "closed"
        || isDeadlinePassed(eventRow.rsvpDeadline, new Date());

    return {
        event: buildInviteEventPayload(eventRow),
        guest: { firstName: PREVIEW_GUEST_NAME, lastName: "" },
        response: null,
        deadlinePassed,
        preview: true,
    };
}

/**
 * POST /api/public/invite/:token/rsvp (SPEC §6).
 *  - same 404 checks as GET;
 *  - 410 with rsvpClosedMessage if the deadline has passed or the event is 'closed';
 *  - validateRsvpSubmission (authoritative, §3.4) → 422 with errors;
 *  - SANITISES answers: persists ONLY keys of VISIBLE questions according to
 *    conditional logic (§8.4 — the validator discards unknown keys only for
 *    evaluation, not for sanitising the payload: we do that here before writing),
 *    excluding 'attendance' (redundant with the `attending` field);
 *  - upsert (guestId UNIQUE) + activity rsvp_submitted (first time) / rsvp_updated.
 */
export async function submitRsvp(token: string, payload: PublicRsvpInput) {
    const { guest, event: eventRow } = await findActiveInviteByToken(token);

    if (eventRow.status === "closed" || isDeadlinePassed(eventRow.rsvpDeadline, new Date())) {
        const closedMessage = eventRow.rsvpClosedMessage ?? DEFAULT_RSVP_CLOSED_MESSAGE;
        throw createError({
            statusCode: 410,
            statusMessage: closedMessage,
            data: { rsvpClosedMessage: closedMessage },
        });
    }

    const config = eventRow.rsvpConfig ?? [];

    // The zod body types answers as Record<string, unknown>: precise value
    // type-checking is the responsibility of validateRsvpSubmission.
    const candidate = payload.answers as RsvpAnswers;
    const result = validateRsvpSubmission(config, {
        attending: payload.attending,
        companionsCount: payload.companionsCount,
        answers: candidate,
    });
    if (!result.ok) {
        throw createError({
            statusCode: 422,
            statusMessage: result.errors[0] ?? "Risposta non valida",
            data: { errors: result.errors },
        });
    }

    // Sanitisation: persist ONLY answers for VISIBLE questions according to
    // conditional logic (no answer injection, no "orphan" answers from hidden
    // branches). Visibility is evaluated with the same authoritative values
    // injected by validateRsvpSubmission. 'attendance' is excluded: it is
    // already the `attending` field of the response.
    const knownIds = new Set(config.map((q) => q.id));
    const evaluation: RsvpAnswers = {};
    for (const [key, value] of Object.entries(candidate)) {
        if (knownIds.has(key) && value !== undefined) evaluation[key] = value;
    }
    if (knownIds.has("attendance")) evaluation.attendance = payload.attending;
    if (knownIds.has("companions_count") && evaluation.companions_count === undefined) {
        evaluation.companions_count = payload.companionsCount;
    }
    const answers: RsvpAnswers = {};
    for (const q of getVisibleQuestions(config, evaluation)) {
        if (q.id === "attendance") continue;
        const value = candidate[q.id];
        if (value !== undefined) answers[q.id] = value;
    }

    // declineMessage only makes sense for attending='no' (SPEC §2); normalised to null.
    const trimmedDecline = payload.declineMessage?.trim();
    const declineMessage = payload.attending === "no" && trimmedDecline ? trimmedDecline : null;

    const saved = await upsertResponse({
        organizationId: guest.organizationId,
        eventId: guest.eventId,
        guestId: guest.id,
        attending: payload.attending,
        companionsCount: payload.companionsCount,
        answers,
        declineMessage,
    });
    if (!saved) {
        throw createError({ statusCode: 500, statusMessage: "Salvataggio della risposta fallito" });
    }

    // FIX 7.4 — RSVP activity reset: azzera cleanupWarnedAt so the event gets a
    // fresh 7-day warning window if it goes stale again, instead of being deleted
    // immediately (the old cleanupWarnedAt was never reset after the first warn).
    await Promise.all([
        insertActivity(
            guest.organizationId,
            guest.eventId,
            guest.id,
            saved.wasInsert ? "rsvp_submitted" : "rsvp_updated",
        ),
        clearEventCleanupWarned(guest.organizationId, guest.eventId),
    ]);

    // Public shape §6.2 (same as GET) — field by field.
    return {
        response: {
            attending: saved.attending as AttendingStatus,
            companionsCount: saved.companionsCount,
            answers: saved.answers,
            declineMessage: saved.declineMessage,
            updatedAt: saved.updatedAt.toISOString(),
        } satisfies NonNullable<PublicInvitePayload["response"]>,
    };
}

/**
 * Email pixel (GET /api/public/pixel/:token.gif): sets emailOpenedAt if null,
 * activity `email_opened` ONLY on the first open (idempotent, no flood on
 * every email re-render). Invalid token / removed guest → no-op:
 * the pixel still responds 200 from the route.
 */
export async function trackEmailOpen(token: string): Promise<void> {
    const row = await findGuestWithEventByToken(token);
    if (!row || row.guest.removedAt !== null) return;

    const firstOpen = await markEmailOpened(row.guest.id);
    if (firstOpen) {
        await insertActivity(
            row.guest.organizationId,
            row.guest.eventId,
            row.guest.id,
            "email_opened",
        );
    }
}
