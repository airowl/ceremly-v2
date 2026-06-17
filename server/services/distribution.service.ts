/**
 * Distribution Service — invio inviti via email/WhatsApp (SPEC §6 "Distribuzione", owner B3).
 *
 * Pattern project.service:
 *   1. organizationId SEMPRE da event.context.organization (guard RBAC), mai da body.
 *   2. Query repository org-scoped by-construction (distributionRepository).
 *   3. assertOwnership come 2° guard sull'evento.
 *   4. logAudit su ogni scrittura organizzatore.
 *
 * L'invio email è 1 job QStash per ospite ('send-invite-email'): il service
 * accoda, marca sentAt/sentChannel e scrive l'attività; il rendering/invio
 * vero avviene nel job handler (server/queue/handlers).
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

/** Concorrenza massima dei dispatch QStash per invio (#6: evita timeout su liste grandi). */
const DISPATCH_CONCURRENCY = 10;

/** Token fittizio per il link/pixel dell'email di test (il 404 pubblico è cortese). */
const TEST_TOKEN = "anteprima";

/** Nome ospite d'esempio per l'email di test (SPEC §6 send-test). */
const TEST_GUEST_NAME = "Anna";

/** Corpo di fallback se l'organizzatore non ha ancora scritto un messaggio. */
const FALLBACK_INVITE_BODY
    = "Ciao {nome},\n\nc'è un invito che ti aspetta. Apri il link per scoprire tutti i dettagli e confermare la tua presenza:\n{link}";

// ---------------------------------------------------------------------------
// Helpers puri/condivisi (usati anche dai job handler della queue)
// ---------------------------------------------------------------------------

/** Sostituisce i placeholder {nome} e {link} in subject/body. */
export function applyInvitePlaceholders(
    text: string,
    values: { nome: string; link: string },
): string {
    return text.split("{nome}").join(values.nome).split("{link}").join(values.link);
}

/** baseURL pubblico senza trailing slash (stessa costruzione di guest.service). */
export function getPublicBaseUrl(): string {
    const config = useRuntimeConfig();
    return String(config.public.baseURL ?? "").replace(/\/+$/, "");
}

/** Link personale dell'ospite: `{baseURL}/e/{slug}/{token}`. */
export function buildGuestInviteLink(slug: string, token: string): string {
    return `${getPublicBaseUrl()}/e/${slug}/${token}`;
}

/** Pixel tracking apertura email: `{baseURL}/api/public/pixel/{token}.gif`. */
export function buildGuestPixelUrl(token: string): string {
    return `${getPublicBaseUrl()}/api/public/pixel/${token}.gif`;
}

// ---------------------------------------------------------------------------
// Guard comuni
// ---------------------------------------------------------------------------

/** Legge l'org attiva dal context. 401 se assente (guard RBAC non eseguito). */
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

/** Evento scoped + assertOwnership (guard comune alle route nested). */
async function requireEventScoped(
    event: H3Event<EventHandlerRequest>,
    eventId: string,
) {
    const organizationId = getOrgId(event);
    const eventRow = await findEventByIdScoped(organizationId, eventId);
    return { organizationId, eventRow: assertOwnership(eventRow, organizationId) };
}

/** 422 se l'evento è chiuso: nessun nuovo invio finché non viene riaperto. */
function assertEventNotClosed(eventRow: { status: string }): void {
    if (eventRow.status === "closed") {
        throw createError({
            statusCode: 422,
            statusMessage: "Evento chiuso: riaprilo per inviare nuovi inviti.",
        });
    }
}

// ---------------------------------------------------------------------------
// Invio inviti email (SPEC §6 POST /api/events/:id/send)
// ---------------------------------------------------------------------------

/**
 * Accoda l'invio dell'invito agli ospiti selezionati:
 * - evento 'closed' → 422; evento 'draft' → attivazione automatica (il primo
 *   invio attiva l'evento, altrimenti i link inviati risponderebbero 404);
 * - risolve i guestIds org+event scoped, SOLO attivi (i fuori scope sono omessi);
 * - salva subject/body in event.distribution (merge) PRIMA del dispatch
 *   (il job handler legge da lì; in dev il job gira in-process subito);
 * - per gli ospiti CON email: markSent 'email' + activity invite_sent + job;
 * - ritorna { queued, skippedNoEmail }.
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

    // Merge (non sostituzione) della distribution: subject/body aggiornati,
    // whatsappTemplate/senderName conservati. Primo invio su bozza → l'evento
    // diventa 'active' nello stesso update (la distribuzione attiva l'evento).
    const distribution: EventDistribution = {
        ...eventRow.distribution,
        emailSubject: data.subject,
        emailBody: data.body,
    };
    await updateEventScoped(organizationId, eventId, {
        distribution,
        ...(eventRow.status === "draft" ? { status: "active" } : {}),
    });

    // 1 job per ospite. Dispatch PRIMA, poi si marcano "inviato" + activity SOLO
    // gli ospiti effettivamente accodati: un enqueue fallito non deve apparire
    // come "Inviato" in dashboard (l'organizzatore può ritentare). L'idempotenza
    // lato consumer (upstash-message-id) evita doppioni sui retry QStash.
    //
    // Dispatch concorrente a chunk (#6): N round-trip QStash seriali rischiano il
    // timeout della function serverless su liste grandi (import bulk → centinaia).
    // I chunk riducono il wall-clock ~DISPATCH_CONCURRENCY× mantenendo
    // l'isolamento per-ospite (un fallimento non blocca gli altri).
    const enqueued: typeof withEmail = [];
    const failedIds: string[] = [];
    for (let i = 0; i < withEmail.length; i += DISPATCH_CONCURRENCY) {
        const chunk = withEmail.slice(i, i + DISPATCH_CONCURRENCY);
        const settled = await Promise.allSettled(
            chunk.map((g) => dispatch("send-invite-email", { guestId: g.id })),
        );
        settled.forEach((res, idx) => {
            const guest = chunk[idx]!;
            if (res.status === "fulfilled") {
                enqueued.push(guest);
            } else {
                failedIds.push(guest.id);
                console.error(`[distribution] dispatch send-invite-email fallito per guest ${guest.id}:`, res.reason);
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
 * Invia subito (NO queue) l'email d'invito all'utente corrente, con ospite
 * d'esempio "Anna" e link/pixel fittizi. Override opzionale di subject/body
 * per provare il testo prima di salvarlo. Nessuna scrittura su tabelle Ceremly.
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

    const link = buildGuestInviteLink(eventRow.slug, TEST_TOKEN);
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

    const html = await renderGuestInviteEmail({
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
 * Marca come inviati via WhatsApp gli ospiti selezionati (bottone "Copia"):
 * markSent 'whatsapp' + activity invite_sent { channel: 'whatsapp' } + audit.
 * Evento 'closed' → 422; evento 'draft' → attivazione automatica (come send).
 */
export async function markWhatsappSent(
    event: H3Event<EventHandlerRequest>,
    eventId: string,
    data: MarkSentInput,
) {
    const { organizationId, eventRow } = await requireEventScoped(event, eventId);
    assertEventNotClosed(eventRow);
    if (eventRow.status === "draft") {
        // Primo invio (mark-sent WhatsApp) su bozza → l'evento diventa 'active'.
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
