/**
 * Public Invite Service — logica di business delle route pubbliche ospite
 * (SPEC §6 "Pubblico ospite" + §6.2 + §8, owner B2).
 *
 * Regole chiave:
 *  - NESSUNA auth: l'ospite accede via token opaco. 404 GENERICO e indistinguibile
 *    ("Invito non disponibile") per token inesistente / ospite rimosso / evento
 *    draft → nessuna enumeration (SPEC §8.2).
 *  - Il payload pubblico §6.2 è costruito CAMPO PER CAMPO, mai con spread della
 *    riga DB: vietato esporre organizationId, email/phone/notes, token, id interni.
 *  - Le azioni ospite NON sono audit-logged (nessun userId): solo guest_activities.
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
import { clearEventCleanupWarned } from "../repositories/eventRepository";
import { DEFAULT_RSVP_CLOSED_MESSAGE } from "./event.service";

/** 404 generico §8.2: stessa risposta per ogni causa (no enumeration). */
function inviteNotFound() {
    return createError({ statusCode: 404, statusMessage: "Invito non disponibile" });
}

/**
 * Lookup by token + gate di visibilità: l'invito esiste per l'ospite solo se
 * il token matcha, l'ospite non è rimosso e l'evento non è in bozza.
 */
async function findActiveInviteByToken(token: string) {
    const row = await findGuestWithEventByToken(token);
    if (!row || row.guest.removedAt !== null || row.event.status === "draft") {
        throw inviteNotFound();
    }
    return row;
}

/** true se la deadline RSVP esiste ed è passata. */
function isDeadlinePassed(rsvpDeadline: Date | null, now: Date): boolean {
    return rsvpDeadline !== null && now > rsvpDeadline;
}

/**
 * GET /api/public/invite/:token (SPEC §6.2).
 * Side-effect di tracking: openCount+1, firstOpenedAt al primo accesso,
 * activity `link_opened` con meta { nth } (numero progressivo di apertura).
 */
export async function getPublicInvite(token: string): Promise<PublicInvitePayload> {
    const { guest, event: eventRow, response } = await findActiveInviteByToken(token);

    const isFirst = guest.firstOpenedAt === null;
    const nth = guest.openCount + 1;
    await Promise.all([
        trackOpen(guest.id, isFirst),
        insertActivity(guest.organizationId, guest.eventId, guest.id, "link_opened", { nth }),
    ]);

    // Evento 'closed': l'invito resta visibile (più cortese di un 404) ma il
    // form RSVP è chiuso, esattamente come a deadline passata.
    const deadlinePassed = eventRow.status === "closed"
        || isDeadlinePassed(eventRow.rsvpDeadline, new Date());

    // Payload §6.2 campo per campo — MAI spread della riga DB.
    return {
        event: {
            title: eventRow.title,
            type: eventRow.type as EventTypeKey,
            templateKey: eventRow.templateKey,
            eventDate: eventRow.eventDate?.toISOString() ?? null,
            eventTime: eventRow.eventTime,
            blocks: eventRow.blocks,
            rsvpConfig: eventRow.rsvpConfig,
            rsvpDeadline: eventRow.rsvpDeadline?.toISOString() ?? null,
            rsvpClosedMessage: eventRow.rsvpClosedMessage ?? DEFAULT_RSVP_CLOSED_MESSAGE,
            slug: eventRow.slug,
        },
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
 * POST /api/public/invite/:token/rsvp (SPEC §6).
 *  - stessi check 404 del GET;
 *  - 410 con rsvpClosedMessage se la deadline è passata o l'evento è 'closed';
 *  - validateRsvpSubmission (autoritativa, §3.4) → 422 con errors;
 *  - SANIFICA answers: persiste SOLO le chiavi delle domande VISIBILI secondo
 *    la logica condizionale (§8.4 — il validator scarta le chiavi estranee solo
 *    per la valutazione, non sanifica il payload: lo facciamo qui prima di
 *    scrivere), esclusa 'attendance' (ridondante col campo `attending`);
 *  - upsert (guestId UNIQUE) + activity rsvp_submitted (prima volta) / rsvp_updated.
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

    // Il body zod tipizza answers come Record<string, unknown>: il type-check
    // puntuale dei valori è compito di validateRsvpSubmission.
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

    // Sanificazione: persisti SOLO le risposte delle domande VISIBILI per la
    // logica condizionale (no answer injection, no risposte "orfane" di rami
    // nascosti). La visibilità è valutata con gli stessi valori autoritativi
    // iniettati da validateRsvpSubmission. 'attendance' è esclusa: è già il
    // campo `attending` della response.
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

    // declineMessage ha senso solo per attending='no' (SPEC §2); normalizzato a null.
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

    // Shape pubblica §6.2 (stessa del GET) — campo per campo.
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
 * Pixel email (GET /api/public/pixel/:token.gif): set emailOpenedAt se null,
 * activity `email_opened` SOLO alla prima apertura (idempotente, niente flood
 * a ogni re-render dell'email). Token invalido / ospite rimosso → no-op:
 * il pixel risponde comunque 200 dalla route.
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
