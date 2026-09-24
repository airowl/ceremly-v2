import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { query, mutation as rawMutation } from "./_generated/server";
import { guestMutation, tagged } from "./lib/functions";
import { DEFAULT_RSVP_CLOSED_MESSAGE } from "./lib/domain";
import { requireEnv } from "./lib/env";
import { writesAllowed } from "./lib/writeGuard";
import { readSiteMode } from "./siteSettings";
import { verifyPreviewToken } from "./lib/previewToken";
import { RATE_LIMIT_CODE, assertRateLimit } from "./lib/rateLimit";
import { getVisibleQuestions, validateRsvpSubmission } from "./lib/rsvpLogic";

/**
 * Invito pubblico e RSVP (plan Task 11) — l'unica superficie senza autenticazione.
 *
 * Porting di `server/services/publicInvite.service.ts`. Le regole di sicurezza
 * sono portate alla lettera, perché sono ciò che rende accettabile un endpoint
 * pubblico:
 *
 * - **404 generico e indistinguibile** per token inesistente, ospite rimosso ed
 *   evento in bozza: nessuna enumerazione, e nessuna differenza osservabile tra i
 *   tre casi;
 * - **payload costruito campo per campo**, mai con uno spread della riga: non
 *   devono uscire `organizationId`, email, telefono, note, token né id interni;
 * - **validazione autoritativa** della submission (`lib/rsvpLogic`, la stessa che
 *   il client usa per la visibilità) e **sanificazione** delle risposte: si
 *   persistono solo le chiavi delle domande *visibili*, quindi una risposta di un
 *   ramo nascosto non entra nel database (§8.4, no answer injection);
 * - le azioni dell'ospite non finiscono in `auditLogs` (non c'è un attore): la
 *   traccia è `guestActivities`.
 *
 * Una deviazione dichiarata dal legacy: `publicInvite` è una **mutation**, non una
 * query. Il GET del legacy aveva side effect (incremento di `openCount`,
 * `firstOpenedAt` al primo accesso, attività `link_opened`), e una query Convex non
 * può scrivere. Il contatore delle aperture è un dato che l'organizzatore usa
 * ("chi ha aperto e non risposto"), quindi perderebbe significato se lo si
 * spostasse in una mutation separata che il client potrebbe non chiamare.
 */

/**
 * 404 generico §8.2: la stessa risposta per ogni causa.
 *
 * `status` (Task 14) è ciò che il bridge del Worker (`http.ts` → `runPublicForm`)
 * restituisce come codice HTTP: senza, ogni rifiuto dell'RSVP pubblico arrivava
 * alla pagina come `500`, e la pagina — che distingue 410 e 422 — mostrava un
 * errore generico al posto di "risposte chiuse" o degli errori di validazione.
 */
function inviteNotFound(): ConvexError<{ code: string; status: number }> {
    return new ConvexError({ code: "INVITE_NOT_FOUND", status: 404 });
}

interface ActiveInvite {
    guest: Doc<"guests">;
    event: Doc<"events">;
    response: Doc<"rsvpResponses"> | null;
}

/**
 * Lookup per token + gate di visibilità: l'invito esiste per l'ospite solo se il
 * token matcha, l'ospite non è rimosso e l'evento non è in bozza.
 */
async function findActiveInvite(ctx: MutationCtx, token: string): Promise<ActiveInvite> {
    const guest = await ctx.db
        .query("guests")
        .withIndex("by_token", (q) => q.eq("token", token))
        .first();

    if (!guest || guest.removedAt !== undefined) throw inviteNotFound();

    const event = await ctx.db.get(guest.eventId);
    if (!event || event.status === "draft") throw inviteNotFound();
    // Final review I1: an event of a deleted organization is gone, even while
    // the `organization-purge` job is still draining its rows.
    if (!(await ctx.db.get(event.organizationId))) throw inviteNotFound();

    const response = await ctx.db
        .query("rsvpResponses")
        .withIndex("by_guest", (q) => q.eq("guestId", guest._id))
        .first();

    return { guest, event, response: response ?? null };
}

/** true se la deadline RSVP esiste ed è passata. */
const isDeadlinePassed = (deadline: number | undefined, now: number): boolean =>
    deadline !== undefined && now > deadline;

/** L'invito è chiuso: evento `closed` **o** deadline passata (SPEC §6.2). */
const isInviteClosed = (event: Doc<"events">, now: number): boolean =>
    event.status === "closed" || isDeadlinePassed(event.rsvpDeadline, now);

/**
 * Il campo `event` del payload pubblico §6.2, campo per campo.
 *
 * Un solo builder per l'invito ospite e per l'anteprima: due builder
 * divergerebbero al primo campo aggiunto, e il primo a divergere sarebbe quello
 * che decide cosa è pubblico.
 */
function buildInviteEvent(event: Doc<"events">) {
    return {
        title: event.title,
        type: event.type,
        templateKey: event.templateKey,
        theme: event.theme ?? null,
        inviteFont: event.inviteFont ?? null,
        eventDate: event.eventDate ?? null,
        eventTime: event.eventTime ?? null,
        blocks: event.blocks,
        rsvpConfig: event.rsvpConfig,
        rsvpDeadline: event.rsvpDeadline ?? null,
        rsvpClosedMessage: event.rsvpClosedMessage ?? DEFAULT_RSVP_CLOSED_MESSAGE,
        slug: event.slug,
    };
}

function buildResponse(response: Doc<"rsvpResponses">) {
    return {
        attending: response.attending,
        companionsCount: response.companionsCount,
        answers: response.answers,
        declineMessage: response.declineMessage ?? null,
        updatedAt: response.updatedAt,
    };
}

export interface PublicInviteResult {
    event: ReturnType<typeof buildInviteEvent>;
    guest: { firstName: string; lastName: string };
    response: ReturnType<typeof buildResponse> | null;
    deadlinePassed: boolean;
}

/**
 * `api.rsvp.publicInvite` — SPEC §6.2.
 *
 * Side effect di tracking: `openCount + 1`, `firstOpenedAt` al primo accesso,
 * attività `link_opened` con `{ nth }` (il numero progressivo di apertura).
 */
// Guard inline (Task 17 fix round 1): the invitation is served in every mode,
// the open is recorded only where guest writes are allowed (`lib/writeGuard.ts`).
export const publicInvite = tagged("inline", rawMutation({
    args: { token: v.string() },
    handler: async (ctx, args): Promise<PublicInviteResult> => {
        const { guest, event, response } = await findActiveInvite(ctx, args.token);
        const now = Date.now();

        if (writesAllowed(await readSiteMode(ctx), "guest")) {
            const isFirst = guest.firstOpenedAt === undefined;
            const nth = guest.openCount + 1;
            await ctx.db.patch(guest._id, {
                openCount: nth,
                updatedAt: now,
                ...(isFirst ? { firstOpenedAt: now } : {}),
            });
            await ctx.db.insert("guestActivities", {
                organizationId: guest.organizationId,
                eventId: guest.eventId,
                guestId: guest._id,
                type: "link_opened",
                meta: { nth },
                createdAt: now,
            });
        }

        // Evento `closed`: l'invito resta visibile (più cortese di un 404) ma il
        // form è chiuso, esattamente come a deadline passata.
        return {
            event: buildInviteEvent(event),
            guest: { firstName: guest.firstName, lastName: guest.lastName },
            response: response ? buildResponse(response) : null,
            deadlinePassed: isInviteClosed(event, now),
        };
    },
}));

const submitArgs = {
    token: v.string(),
    attending: v.union(v.literal("yes"), v.literal("no"), v.literal("maybe")),
    companionsCount: v.number(),
    answers: v.record(v.string(), v.any()),
    declineMessage: v.optional(v.union(v.string(), v.null())),
    /**
     * Digest HMAC dell'IP, presente solo quando la chiamata arriva dal bridge del
     * Worker (plan Task 12, Step 3).
     *
     * Il limite resta per **token** — è l'invito che va protetto dal flood — ma
     * quando l'indirizzo è noto il bucket lo include, così un token condiviso
     * dietro lo stesso NAT non consuma la quota di tutti gli altri ospiti. Il
     * client che chiama la mutation direttamente (convex-vue) semplicemente non
     * ha questa dimensione: il limite per token resta identico.
     */
    ipHash: v.optional(v.string()),
};

/**
 * `api.rsvp.submit` — SPEC §6.
 *
 * Ordine dei controlli, come nel legacy e per una ragione: prima l'esistenza
 * dell'invito (404 indistinguibile), poi lo stato di chiusura (410 con il
 * messaggio configurato dall'organizzatore), poi la validazione (422 con gli
 * errori in chiaro per l'ospite). Validare prima di sapere se l'invito è chiuso
 * direbbe a un estraneo quali domande esistono.
 */
export const submit = guestMutation({
    args: submitArgs,
    handler: async (ctx, args) => {
        // Limite per token (30/min, la costante del legacy) prima di qualunque
        // lavoro: una richiesta rifiutata non deve costare una lettura di invito.
        try {
            await assertRateLimit(ctx, {
                bucket: "rsvp",
                key: args.ipHash ? `${args.token}|${args.ipHash}` : args.token,
            });
        } catch (error) {
            // Il messaggio del legacy (`rsvp.post.ts`), con lo status che il bridge
            // restituisce: lo stesso schema dei form pubblici (`publicForms.ts`).
            if ((error as { data?: { code?: unknown } }).data?.code === RATE_LIMIT_CODE) {
                throw new ConvexError({
                    code: RATE_LIMIT_CODE,
                    status: 429,
                    message: "Troppe richieste. Riprova tra poco.",
                });
            }
            throw error;
        }

        const { guest, event } = await findActiveInvite(ctx, args.token);
        const now = Date.now();

        if (isInviteClosed(event, now)) {
            const closedMessage = event.rsvpClosedMessage ?? DEFAULT_RSVP_CLOSED_MESSAGE;
            throw new ConvexError({
                code: "RSVP_CLOSED",
                status: 410,
                message: closedMessage,
                rsvpClosedMessage: closedMessage,
            });
        }

        const config = event.rsvpConfig ?? [];
        const candidate = args.answers as Record<string, unknown>;

        const result = validateRsvpSubmission(config, {
            attending: args.attending,
            companionsCount: args.companionsCount,
            answers: candidate as never,
        });
        if (!result.ok) {
            throw new ConvexError({
                code: "RSVP_INVALID",
                status: 422,
                message: result.errors[0] ?? "Risposta non valida",
                errors: result.errors,
            });
        }

        // Sanificazione: si persiste SOLO quanto appartiene a domande **visibili**
        // per la logica condizionale. 'attendance' è esclusa perché è già il campo
        // `attending` della risposta.
        const knownIds = new Set(config.map((question) => question.id));
        const evaluation: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(candidate)) {
            if (knownIds.has(key) && value !== undefined) evaluation[key] = value;
        }
        if (knownIds.has("attendance")) evaluation.attendance = args.attending;
        if (knownIds.has("companions_count") && evaluation.companions_count === undefined) {
            evaluation.companions_count = args.companionsCount;
        }

        const answers: Record<string, unknown> = {};
        for (const question of getVisibleQuestions(config, evaluation as never)) {
            if (question.id === "attendance") continue;
            const value = candidate[question.id];
            if (value !== undefined) answers[question.id] = value;
        }

        // Il messaggio di declino ha senso solo per `attending = 'no'`.
        const trimmedDecline = args.declineMessage?.trim();
        const declineMessage =
            args.attending === "no" && trimmedDecline ? trimmedDecline : undefined;

        const existing = await ctx.db
            .query("rsvpResponses")
            .withIndex("by_guest", (q) => q.eq("guestId", guest._id))
            .first();

        // Upsert su guestId: la riga rappresenta sempre l'ultima versione, e
        // `submittedAt` (prima compilazione) non cambia agli aggiornamenti.
        let responseId: Id<"rsvpResponses">;
        let wasInsert: boolean;

        if (existing) {
            wasInsert = false;
            responseId = existing._id;

            // `replace` e non `patch`: un ospite che passa da "no" a "sì" deve
            // perdere il messaggio di declino, e `patch` non rimuove chiavi.
            const next: Record<string, unknown> = { ...existing };
            delete next._id;
            delete next._creationTime;
            next.attending = args.attending;
            next.companionsCount = args.companionsCount;
            next.answers = answers;
            next.updatedAt = now;
            if (declineMessage) next.declineMessage = declineMessage;
            else delete next.declineMessage;

            await ctx.db.replace(existing._id, next as never);
        } else {
            wasInsert = true;
            responseId = await ctx.db.insert("rsvpResponses", {
                organizationId: guest.organizationId,
                eventId: guest.eventId,
                guestId: guest._id,
                attending: args.attending,
                companionsCount: args.companionsCount,
                answers: answers as Doc<"rsvpResponses">["answers"],
                ...(declineMessage ? { declineMessage } : {}),
                submittedAt: now,
                updatedAt: now,
            });
        }

        await ctx.db.insert("guestActivities", {
            organizationId: guest.organizationId,
            eventId: guest.eventId,
            guestId: guest._id,
            type: wasInsert ? "rsvp_submitted" : "rsvp_updated",
            meta: {},
            createdAt: now,
        });

        // FIX 7.4 — ogni attività dell'ospite riapre la finestra di avviso del
        // cleanup: se l'evento torna stale, l'organizzatore riceve un nuovo
        // preavviso di 7 giorni invece di trovare l'evento cancellato.
        if (event.cleanupWarnedAt !== undefined) {
            const next: Record<string, unknown> = { ...event };
            delete next._id;
            delete next._creationTime;
            delete next.cleanupWarnedAt;
            await ctx.db.replace(event._id, next as never);
        }

        const saved = await ctx.db.get(responseId);
        return { response: saved ? buildResponse(saved) : null };
    },
});

/** The sample guest of the signed preview (legacy `PREVIEW_GUEST_NAME`). */
const PREVIEW_GUEST_NAME = "Anna";

/**
 * `api.rsvp.previewInvite` — the signed preview of the "send a test to me" email
 * (legacy `GET /api/public/preview`, Task 14).
 *
 * The HMAC is the only authority: no session, no guest. A bad, foreign or expired
 * signature and an unknown slug are the same generic 404, like the guest path, so
 * the endpoint cannot be used to enumerate slugs. A **query**, unlike
 * `publicInvite`: the preview tracks nothing (no open count, no activity), so
 * there is nothing to write.
 *
 * A draft event previews fine, as in the legacy: the organizer tests the email
 * before the first send, which is exactly when the event is still a draft. The
 * payload comes from the same builder as the guest invite, so what the organizer
 * sees is what the guests will see, including "closed" and a passed deadline.
 */
export const previewInvite = query({
    args: { slug: v.string(), sig: v.string() },
    handler: async (ctx, args): Promise<PublicInviteResult & { preview: true }> => {
        const valid = await verifyPreviewToken(requireEnv("BETTER_AUTH_SECRET"), args.slug, args.sig);
        if (!valid) throw inviteNotFound();

        const event = await ctx.db
            .query("events")
            .withIndex("by_slug", (q) => q.eq("slug", args.slug))
            .first();
        if (!event) throw inviteNotFound();

        return {
            event: buildInviteEvent(event),
            guest: { firstName: PREVIEW_GUEST_NAME, lastName: "" },
            response: null,
            deadlinePassed: isInviteClosed(event, Date.now()),
            preview: true,
        };
    },
});

/**
 * `api.rsvp.trackEmailOpen` — pixel dell'email
 * (GET /api/public/pixel/:token.gif).
 *
 * Idempotente: `emailOpenedAt` è scritto una volta sola e l'attività
 * `email_opened` nasce solo alla prima apertura, altrimenti ogni re-render
 * dell'email gonfierebbe la timeline. Token invalido o ospite rimosso → no-op:
 * il pixel risponde comunque 200, e un pixel che rivela l'esistenza di un token
 * sarebbe un oracolo.
 */
// Guard inline: outside the modes that allow guest writes the pixel is a no-op.
export const trackEmailOpen = tagged("inline", rawMutation({
    args: { token: v.string() },
    handler: async (ctx, args): Promise<{ tracked: boolean }> => {
        if (!writesAllowed(await readSiteMode(ctx), "guest")) return { tracked: false };
        const guest = await ctx.db
            .query("guests")
            .withIndex("by_token", (q) => q.eq("token", args.token))
            .first();

        if (!guest || guest.removedAt !== undefined) return { tracked: false };
        if (guest.emailOpenedAt !== undefined) return { tracked: false };

        const now = Date.now();
        await ctx.db.patch(guest._id, { emailOpenedAt: now, updatedAt: now });
        await ctx.db.insert("guestActivities", {
            organizationId: guest.organizationId,
            eventId: guest.eventId,
            guestId: guest._id,
            type: "email_opened",
            meta: {},
            createdAt: now,
        });

        return { tracked: true };
    },
}));
