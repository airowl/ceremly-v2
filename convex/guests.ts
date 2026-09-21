import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireActiveOrganization } from "./lib/authorization";
import { writeAudit } from "./lib/audit";
import { forbidden } from "./lib/identity";
import {
    deriveRsvpStatus,
    generateGuestToken,
    normalizeOptionalEmail,
    normalizeOptionalText,
    requireOwnedEvent,
    requireOwnedGuest,
    resolveEventLimits,
} from "./lib/domain";

/**
 * Ospiti Ceremly in Convex (plan Task 11).
 *
 * Porting di `server/services/guest.service.ts` + la parte WhatsApp di
 * `distribution.service.ts` (`mark-sent`). Le regole portate invariate:
 *
 * - l'ospite non ha account: è il `token` opaco a identificarlo, e resta immutabile;
 * - un solo ospite **attivo** per `(evento, email)` — l'indice unico parziale del
 *   legacy diventa una verifica esplicita, perché Convex non ha indici unici;
 * - il limite ospiti è del tier effettivo (Free 30, Celebrazione 250, Atelier ∞);
 * - il soft-delete conserva la risposta: il link muore, il dato resta.
 *
 * Due differenze dichiarate rispetto al legacy, entrambe a favore della correttezza:
 *
 * 1. **Il token è verificato per unicità alla scrittura.** Il legacy si affidava a
 *    un indice UNIQUE e ritentava sul 23505; senza quell'indice una collisione
 *    (astronomicamente improbabile, ma non impossibile) darebbe due ospiti con lo
 *    stesso link — cioè un invito che apre la pagina di un altro. Qui la collisione
 *    è cercata e risolta rigenerando il token.
 * 2. **L'email è normalizzata in scrittura** (trim + lowercase), come il vincolo
 *    `lower(email)` del legacy implicava: senza, il controllo di unicità sarebbe
 *    aggirabile scrivendo `Ada@Example.com`.
 */

const GUEST_CAPACITY_REASON = "Limite ospiti dell'evento raggiunto";
const MAX_TOKEN_ATTEMPTS = 5;

const isActive = (guest: Doc<"guests">): boolean => guest.removedAt === undefined;

// ---------------------------------------------------------------------------
// Letture
// ---------------------------------------------------------------------------

export interface GuestWithStatus extends Doc<"guests"> {
    rsvpStatus: ReturnType<typeof deriveRsvpStatus>;
    respondedAt: number | null;
    /** 1 + accompagnatori se confermato, altrimenti 0. */
    totalPeople: number;
}

async function collectGuests(ctx: QueryCtx, eventId: Id<"events">): Promise<Doc<"guests">[]> {
    const guests = await ctx.db
        .query("guests")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .collect();

    // Ordine di inserimento, come il legacy (`ORDER BY created_at ASC`).
    return guests.sort((left, right) => left.createdAt - right.createdAt);
}

async function responsesFor(
    ctx: QueryCtx,
    eventId: Id<"events">,
): Promise<Map<string, Doc<"rsvpResponses">>> {
    const responses = await ctx.db
        .query("rsvpResponses")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .collect();

    return new Map(responses.map((response) => [response.guestId, response]));
}

/** Ospiti dell'evento (anche rimossi, con il flag) + stato derivato e summary. */
export const list = query({
    args: { eventId: v.id("events") },
    handler: async (ctx, args) => {
        const authz = await requireActiveOrganization(ctx);
        await requireOwnedEvent(ctx, authz.organizationId, args.eventId);

        const [rows, responseByGuest] = await Promise.all([
            collectGuests(ctx, args.eventId),
            responsesFor(ctx, args.eventId),
        ]);

        const guests: GuestWithStatus[] = rows.map((guest) => {
            const response = responseByGuest.get(guest._id);
            const rsvpStatus = deriveRsvpStatus(response?.attending, guest.firstOpenedAt);

            return {
                ...guest,
                rsvpStatus,
                respondedAt: response ? (response.updatedAt ?? response.submittedAt) : null,
                totalPeople: rsvpStatus === "confirmed" ? 1 + (response?.companionsCount ?? 0) : 0,
            };
        });

        // Il summary conta solo gli ospiti attivi, come i counts della lista eventi.
        const active = guests.filter(isActive);
        const summary = {
            total: active.length,
            confirmed: active.filter((guest) => guest.rsvpStatus === "confirmed").length,
            declined: active.filter((guest) => guest.rsvpStatus === "declined").length,
            maybe: active.filter((guest) => guest.rsvpStatus === "maybe").length,
            pending: active.filter(
                (guest) => guest.rsvpStatus === "opened" || guest.rsvpStatus === "not_opened",
            ).length,
            opened: active.filter((guest) => guest.firstOpenedAt !== undefined).length,
            removed: guests.length - active.length,
        };

        return { guests, summary };
    },
});

/** Dettaglio ospite: riga, risposta completa e timeline attività (più recente prima). */
export const get = query({
    args: { eventId: v.id("events"), guestId: v.id("guests") },
    handler: async (ctx, args) => {
        const authz = await requireActiveOrganization(ctx);
        await requireOwnedEvent(ctx, authz.organizationId, args.eventId);
        const guest = await requireOwnedGuest(ctx, authz.organizationId, args.eventId, args.guestId);

        const [response, activities] = await Promise.all([
            ctx.db
                .query("rsvpResponses")
                .withIndex("by_guest", (q) => q.eq("guestId", guest._id))
                .first(),
            ctx.db
                .query("guestActivities")
                .withIndex("by_guest", (q) => q.eq("guestId", guest._id))
                .collect(),
        ]);

        return {
            guest,
            response: response ?? null,
            activities: activities.sort((left, right) => right.createdAt - left.createdAt),
        };
    },
});

// ---------------------------------------------------------------------------
// Scritture
// ---------------------------------------------------------------------------

const guestInput = {
    firstName: v.string(),
    lastName: v.string(),
    email: v.optional(v.union(v.string(), v.null())),
    phone: v.optional(v.union(v.string(), v.null())),
    groupName: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
};

/**
 * Token nuovo e **non collidente**.
 *
 * Non è una formalità: `guests.token` è l'unica credenziale dell'ospite e in
 * Convex non c'è un indice unico a proteggerla. Due ospiti con lo stesso token
 * significherebbero che l'invito di uno apre la pagina dell'altro.
 */
async function uniqueGuestToken(ctx: MutationCtx): Promise<string> {
    for (let attempt = 0; attempt < MAX_TOKEN_ATTEMPTS; attempt += 1) {
        const token = generateGuestToken();
        const clash = await ctx.db
            .query("guests")
            .withIndex("by_token", (q) => q.eq("token", token))
            .first();
        if (!clash) return token;
    }

    throw new ConvexError({ code: "GUEST_TOKEN_UNAVAILABLE" });
}

/** Ospite attivo con questa email per questo evento, o `null`. */
async function findActiveGuestByEmail(
    ctx: QueryCtx | MutationCtx,
    eventId: Id<"events">,
    email: string,
): Promise<Doc<"guests"> | null> {
    const guests = await ctx.db
        .query("guests")
        .withIndex("by_event_email", (q) => q.eq("eventId", eventId).eq("email", email))
        .collect();

    return guests.find(isActive) ?? null;
}

/**
 * Capacità residua dell'evento secondo il tier effettivo (`Infinity` se illimitato).
 * Il messaggio di rifiuto dipende dal tier, come nel legacy: a un evento già
 * Celebrazione non si suggerisce di passare a Celebrazione.
 */
async function assertGuestCapacity(
    ctx: MutationCtx,
    event: Doc<"events">,
    needed: number,
): Promise<number> {
    const limits = await resolveEventLimits(ctx, event);
    if (limits.maxGuestsPerEvent === -1) return Number.POSITIVE_INFINITY;

    const guests = await ctx.db
        .query("guests")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .collect();
    const current = guests.filter(isActive).length;
    const capacity = Math.max(0, limits.maxGuestsPerEvent - current);

    if (capacity < needed) {
        const statusMessage = limits.maxGuestsPerEvent === 250
            ? "Hai raggiunto il limite di 250 ospiti per questo evento."
            : `Questo evento include fino a ${limits.maxGuestsPerEvent} ospiti. Sblocca con Celebrazione per aggiungerne altri.`;
        throw new ConvexError({ code: "GUEST_LIMIT_REACHED", message: statusMessage });
    }

    return capacity;
}

/** Crea un ospite con token nuovo. Limite ospiti del tier effettivo. */
export const create = mutation({
    args: { eventId: v.id("events"), input: v.object(guestInput) },
    handler: async (ctx, args) => {
        const authz = await requireActiveOrganization(ctx);
        const event = await requireOwnedEvent(ctx, authz.organizationId, args.eventId);

        await assertGuestCapacity(ctx, event, 1);

        const email = normalizeOptionalEmail(args.input.email);
        if (email && (await findActiveGuestByEmail(ctx, event._id, email))) {
            throw new ConvexError({
                code: "GUEST_EMAIL_TAKEN",
                message: `Esiste già un ospite con l'email ${email} per questo evento.`,
            });
        }

        const now = Date.now();
        const guestId = await ctx.db.insert("guests", {
            organizationId: authz.organizationId,
            eventId: event._id,
            firstName: args.input.firstName,
            lastName: args.input.lastName,
            token: await uniqueGuestToken(ctx),
            openCount: 0,
            remindersDisabled: false,
            ...(email ? { email } : {}),
            ...(normalizeOptionalText(args.input.phone)
                ? { phone: normalizeOptionalText(args.input.phone)! }
                : {}),
            ...(normalizeOptionalText(args.input.groupName)
                ? { groupName: normalizeOptionalText(args.input.groupName)! }
                : {}),
            ...(args.input.notes ? { notes: args.input.notes } : {}),
            createdAt: now,
            updatedAt: now,
        });

        await writeAudit(ctx, {
            action: "guest.created",
            actorAppUserId: authz.appUserId,
            actorAuthUserId: authz.authUserId,
            organizationId: authz.organizationId,
            targetType: "guest",
            targetId: guestId,
            details: { eventId: args.eventId },
        });

        return await ctx.db.get(guestId);
    },
});

/** Update ospite: il token non è toccabile, l'email si può svuotare. */
export const update = mutation({
    args: {
        eventId: v.id("events"),
        guestId: v.id("guests"),
        input: v.object({
            ...guestInput,
            firstName: v.optional(v.string()),
            lastName: v.optional(v.string()),
            remindersDisabled: v.optional(v.boolean()),
        }),
    },
    handler: async (ctx, args) => {
        const authz = await requireActiveOrganization(ctx);
        await requireOwnedEvent(ctx, authz.organizationId, args.eventId);
        const guest = await requireOwnedGuest(ctx, authz.organizationId, args.eventId, args.guestId);

        const next: Record<string, unknown> = { ...guest };
        delete next._id;
        delete next._creationTime;

        const { input } = args;
        if (input.firstName !== undefined) next.firstName = input.firstName;
        if (input.lastName !== undefined) next.lastName = input.lastName;
        if (input.notes !== undefined) {
            if (input.notes === null || input.notes === "") delete next.notes;
            else next.notes = input.notes;
        }
        if (input.remindersDisabled !== undefined) next.remindersDisabled = input.remindersDisabled;

        if (input.email !== undefined) {
            const email = normalizeOptionalEmail(input.email);
            if (email) {
                // Il conflitto con sé stessi non è un conflitto: l'ospite può
                // riscrivere la propria email invariata.
                const clash = await findActiveGuestByEmail(ctx, guest.eventId, email);
                if (clash && clash._id !== guest._id) {
                    throw new ConvexError({
                        code: "GUEST_EMAIL_TAKEN",
                        message: `Esiste già un ospite con l'email ${email} per questo evento.`,
                    });
                }
                next.email = email;
            } else {
                delete next.email;
            }
        }

        for (const field of ["phone", "groupName"] as const) {
            const value = input[field];
            if (value === undefined) continue;
            const normalized = normalizeOptionalText(value);
            if (normalized) next[field] = normalized;
            else {
                // Stringa vuota = azzera: il campo sparisce dal documento invece
                // di restare a "". `field` è un'unione letterale, non un input.
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete next[field];
            }
        }

        next.updatedAt = Date.now();
        await ctx.db.replace(guest._id, next as never);

        await writeAudit(ctx, {
            action: "guest.updated",
            actorAppUserId: authz.appUserId,
            actorAuthUserId: authz.authUserId,
            organizationId: authz.organizationId,
            targetType: "guest",
            targetId: guest._id,
            details: { eventId: args.eventId, fields: Object.keys(input) },
        });

        return await ctx.db.get(guest._id);
    },
});

/** Soft-delete: link inattivo, risposta conservata (PRD edge case). */
export const softDelete = mutation({
    args: { eventId: v.id("events"), guestId: v.id("guests") },
    handler: async (ctx, args) => {
        const authz = await requireActiveOrganization(ctx);
        await requireOwnedEvent(ctx, authz.organizationId, args.eventId);
        const guest = await requireOwnedGuest(ctx, authz.organizationId, args.eventId, args.guestId);

        if (guest.removedAt === undefined) {
            const now = Date.now();
            await ctx.db.patch(guest._id, { removedAt: now, updatedAt: now });
        }

        await writeAudit(ctx, {
            action: "guest.deleted",
            actorAppUserId: authz.appUserId,
            actorAuthUserId: authz.authUserId,
            organizationId: authz.organizationId,
            targetType: "guest",
            targetId: guest._id,
            details: { eventId: args.eventId, soft: true },
        });

        return { success: true };
    },
});

// ---------------------------------------------------------------------------
// Import bulk (SPEC §6 POST /api/events/:id/guests/import)
// ---------------------------------------------------------------------------

export interface ImportRowIssue {
    /** Indice 1-based nella lista `rows` inviata. */
    row: number;
    reason: string;
}

/**
 * Import bulk.
 *
 * Due esiti diversi per due situazioni diverse, come nel legacy:
 * - **email duplicata** → la riga è **saltata** (l'indice unico parziale l'avrebbe
 *   rifiutata, e un 23505 in blocco avrebbe fatto fallire l'intero import);
 * - **nome duplicato** → la riga è importata con un **warning**: due "Marco Rossi"
 *   possono essere due persone, e decidere al posto dell'organizzatore sarebbe
 *   sbagliato.
 *
 * L'email è confrontata normalizzata, e il controllo è aggiornato *durante* il
 * ciclo: un file con la stessa email due volte importa la prima riga soltanto.
 */
export const importRows = mutation({
    args: {
        eventId: v.id("events"),
        rows: v.array(v.object(guestInput)),
    },
    handler: async (ctx, args) => {
        const authz = await requireActiveOrganization(ctx);
        const event = await requireOwnedEvent(ctx, authz.organizationId, args.eventId);

        const capacity = await assertGuestCapacity(ctx, event, 0);
        const existing = await collectGuests(ctx, event._id);

        const nameKey = (firstName: string, lastName: string) =>
            `${firstName.trim().toLowerCase()}|${lastName.trim().toLowerCase()}`;

        const knownNames = new Set(
            existing.filter(isActive).map((guest) => nameKey(guest.firstName, guest.lastName)),
        );
        const knownEmails = new Set(
            existing
                .filter(isActive)
                .map((guest) => guest.email)
                .filter((email): email is string => email !== undefined),
        );

        const skipped: ImportRowIssue[] = [];
        const warnings: ImportRowIssue[] = [];
        const toInsert: Array<{
            row: number;
            firstName: string;
            lastName: string;
            email?: string;
            phone?: string;
            groupName?: string;
            notes?: string;
        }> = [];

        let remaining = capacity;

        args.rows.forEach((row, index) => {
            const rowNumber = index + 1;

            if (remaining <= 0) {
                skipped.push({ row: rowNumber, reason: GUEST_CAPACITY_REASON });
                return;
            }

            const email = normalizeOptionalEmail(row.email);
            if (email && knownEmails.has(email)) {
                skipped.push({
                    row: rowNumber,
                    reason: `Email «${email}» già presente per questo evento`,
                });
                return;
            }
            if (email) knownEmails.add(email);

            const key = nameKey(row.firstName, row.lastName);
            if (knownNames.has(key)) {
                warnings.push({
                    row: rowNumber,
                    reason: `Possibile duplicato: «${row.firstName} ${row.lastName}» è già in lista`,
                });
            }
            knownNames.add(key);

            toInsert.push({
                row: rowNumber,
                firstName: row.firstName,
                lastName: row.lastName,
                ...(email ? { email } : {}),
                ...(normalizeOptionalText(row.phone)
                    ? { phone: normalizeOptionalText(row.phone)! }
                    : {}),
                ...(normalizeOptionalText(row.groupName)
                    ? { groupName: normalizeOptionalText(row.groupName)! }
                    : {}),
                ...(row.notes ? { notes: row.notes } : {}),
            });
            remaining -= 1;
        });

        const now = Date.now();
        let imported = 0;
        for (const row of toInsert) {
            await ctx.db.insert("guests", {
                organizationId: authz.organizationId,
                eventId: event._id,
                firstName: row.firstName,
                lastName: row.lastName,
                token: await uniqueGuestToken(ctx),
                openCount: 0,
                remindersDisabled: false,
                ...(row.email ? { email: row.email } : {}),
                ...(row.phone ? { phone: row.phone } : {}),
                ...(row.groupName ? { groupName: row.groupName } : {}),
                ...(row.notes ? { notes: row.notes } : {}),
                createdAt: now,
                updatedAt: now,
            });
            imported += 1;
        }

        await writeAudit(ctx, {
            action: "guest.imported",
            actorAppUserId: authz.appUserId,
            actorAuthUserId: authz.authUserId,
            organizationId: authz.organizationId,
            targetType: "event",
            targetId: event._id,
            details: { imported, skipped: skipped.length, warnings: warnings.length },
        });

        return { imported, skipped, warnings };
    },
});

// ---------------------------------------------------------------------------
// Mark sent (SPEC §6 POST /api/events/:id/mark-sent)
// ---------------------------------------------------------------------------

/**
 * Marca come inviati via WhatsApp gli ospiti selezionati (bottone "Copia"):
 * `sentAt`/`sentChannel`, attività `invite_sent` con `{ channel: 'whatsapp' }`,
 * audit `invite.sent`.
 *
 * Un evento in bozza diventa `active` al primo invio (è il momento in cui l'invito
 * esiste davvero per qualcuno); un evento chiuso rifiuta l'operazione.
 */
export const markSent = mutation({
    args: { eventId: v.id("events"), guestIds: v.array(v.id("guests")) },
    handler: async (ctx, args) => {
        const authz = await requireActiveOrganization(ctx);
        const event = await requireOwnedEvent(ctx, authz.organizationId, args.eventId);

        if (event.status === "closed") {
            throw forbidden("EVENT_CLOSED", { eventId: event._id });
        }

        const wanted = new Set(args.guestIds.map((id) => id as string));
        const guests = (await collectGuests(ctx, event._id)).filter(
            (guest) => isActive(guest) && wanted.has(guest._id),
        );

        const now = Date.now();
        for (const guest of guests) {
            await ctx.db.patch(guest._id, {
                // `sentAt` è il **primo** invio e non si riscrive: il legacy usa
                // `COALESCE(sent_at, now())`, quindi rimarcare un invito già
                // inviato aggiorna il canale ma non la data. Sovrascriverla
                // cancellerebbe "quando è partito l'invito" a ogni reinvio.
                ...(guest.sentAt === undefined ? { sentAt: now } : {}),
                sentChannel: "whatsapp",
                updatedAt: now,
            });
            await ctx.db.insert("guestActivities", {
                organizationId: authz.organizationId,
                eventId: event._id,
                guestId: guest._id,
                type: "invite_sent",
                meta: { channel: "whatsapp" },
                createdAt: now,
            });
        }

        if (event.status === "draft") {
            await ctx.db.patch(event._id, { status: "active", updatedAt: now });
        }

        await writeAudit(ctx, {
            action: "invite.sent",
            actorAppUserId: authz.appUserId,
            actorAuthUserId: authz.authUserId,
            organizationId: authz.organizationId,
            targetType: "event",
            targetId: event._id,
            details: { channel: "whatsapp", marked: guests.length },
        });

        return { marked: guests.length };
    },
});
