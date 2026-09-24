import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalQuery, query } from "./_generated/server";
import { mutation } from "./lib/functions";
import { DOMAIN_WRITE_ROLES, requireActiveOrganization, requireRole } from "./lib/authorization";
import { writeAudit } from "./lib/audit";
import { forbidden } from "./lib/identity";
import {
    FALLBACK_INVITE_BODY,
    applyInvitePlaceholders,
    deriveRsvpStatus,
    generateGuestToken,
    normalizeOptionalEmail,
    normalizeOptionalText,
    requireOwnedEvent,
    requireOwnedGuest,
    resolveEventLimits,
} from "./lib/domain";
import { emailSubjects } from "./lib/emailSubjects";
import { requireEnv, siteUrl } from "./lib/env";
import { JOB_TYPES, enqueueJob } from "./lib/jobQueue";
import { assertRateLimit } from "./lib/rateLimit";
import { PREVIEW_TOKEN, signPreviewToken } from "./lib/previewToken";

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
 * Legacy Zod bounds (`shared/schemas/ceremly.ts`: `createGuestSchema`,
 * `updateGuestSchema`, `importGuestsSchema`), final review M1. The browser now
 * reaches these mutations directly, without the Nuxt route that parsed the
 * body, so the limits live here: without them a member could store strings up
 * to the 1 MB document limit and degrade exports and CSV.
 */
export const GUEST_FIELD_LIMITS = {
    firstName: 80,
    lastName: 80,
    email: 254,
    phone: 40,
    groupName: 80,
    notes: 1000,
} as const;
export const GUEST_IMPORT_MAX_ROWS = 500;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type GuestFieldsInput = {
    firstName?: string;
    lastName?: string;
    email?: string | null;
    phone?: string | null;
    groupName?: string | null;
    notes?: string | null;
};

function invalidGuestInput(field: string, extra: Record<string, unknown> = {}): ConvexError<Record<string, unknown>> {
    return new ConvexError({ code: "INVALID_INPUT", field, ...extra });
}

/** `required`: names must be present (create/import); on update only what is sent is checked. */
function assertGuestFields(input: GuestFieldsInput, required: boolean, extra: Record<string, unknown> = {}): void {
    for (const field of ["firstName", "lastName"] as const) {
        const value = input[field];
        if (value === undefined) {
            if (required) throw invalidGuestInput(field, extra);
            continue;
        }
        // Legacy `nonEmptyString.max(80)`.
        if (value.length === 0 || value.length > GUEST_FIELD_LIMITS[field]) {
            throw invalidGuestInput(field, { max: GUEST_FIELD_LIMITS[field], ...extra });
        }
    }
    for (const field of ["phone", "groupName", "notes"] as const) {
        const value = input[field];
        if (typeof value === "string" && value.length > GUEST_FIELD_LIMITS[field]) {
            throw invalidGuestInput(field, { max: GUEST_FIELD_LIMITS[field], ...extra });
        }
    }
    const email = input.email;
    if (typeof email === "string" && email.trim() !== "") {
        // Legacy `z.string().email()` (or ""): a bounded, shape-checked address.
        if (email.length > GUEST_FIELD_LIMITS.email || !EMAIL_SHAPE.test(email.trim())) {
            throw invalidGuestInput("email", { max: GUEST_FIELD_LIMITS.email, ...extra });
        }
    }
}

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
        assertGuestFields(args.input, true);
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
        assertGuestFields(args.input, false);
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
        // Legacy `importGuestsSchema`: 1..500 rows, each a valid `createGuestSchema`
        // (one bad row refused the whole request with 400, as here).
        if (args.rows.length < 1 || args.rows.length > GUEST_IMPORT_MAX_ROWS) {
            throw invalidGuestInput("rows", { max: GUEST_IMPORT_MAX_ROWS });
        }
        args.rows.forEach((row, index) => assertGuestFields(row, true, { row: index + 1 }));
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

// ---------------------------------------------------------------------------
// Email distribution (SPEC §6 POST /api/events/:id/send and /send-test) — Task 14
// ---------------------------------------------------------------------------

/** Legacy `sendInvitesSchema` bounds. */
const MAX_SEND_GUESTS = 200;
const MAX_SUBJECT_LENGTH = 200;
const MAX_BODY_LENGTH = 5000;

/** The sample guest of the test email (legacy `TEST_GUEST_NAME`). */
const TEST_GUEST_NAME = "Anna";

/**
 * Required text within the legacy bound. Blank counts as missing: the legacy
 * schema accepted `"   "` (`min(1)` without trim), which would have saved an
 * invisible subject; the dashboard already trimmed before sending, so no real
 * request changes outcome.
 */
function requireText(value: string, max: number, field: string): string {
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > max) {
        throw new ConvexError({ code: "INVALID_INPUT", field, max });
    }
    return trimmed;
}

function optionalText(value: string | undefined, max: number, field: string): string | undefined {
    return value === undefined || value.trim() === "" ? undefined : requireText(value, max, field);
}

/** Legacy 422: no new invite leaves a closed event until it is reopened. */
function assertEventOpenForSending(event: Doc<"events">): void {
    if (event.status === "closed") {
        throw new ConvexError({
            code: "EVENT_CLOSED",
            eventId: event._id,
            message: "Evento chiuso: riaprilo per inviare nuovi inviti.",
        });
    }
}

/**
 * `api.guests.sendInvites` — the producer of `send-invite-email`.
 *
 * Port of `distribution.service.sendInvites`, in the same order:
 *
 * 1. closed event → refused; draft → activated in the same write (the first send
 *    activates the event, otherwise the links just sent would answer 404);
 * 2. subject/body merged into `event.distribution` **before** the jobs exist: the
 *    consumer reads them from the event when it runs, so the payload stays
 *    `{ guestId }` — ids only, never the text;
 * 3. only active guests of this event and this organization; ids out of scope are
 *    omitted, not an error;
 * 4. one job per guest with an email; "Inviato" (`sentAt`, first send kept) and the
 *    `invite_sent` activity only for what was actually queued.
 *
 * Two differences from the legacy, both consequences of the runtime:
 *
 * - **`failed` is always 0.** The legacy dispatched to QStash over the network and
 *   could lose some guests of a batch; here the jobs are rows in the same
 *   transaction, so either every guest of the call is queued or the mutation
 *   throws and nothing is. The field stays for the UI contract.
 * - **A second click does not queue a second email.** The dedupe key is per guest:
 *   while that guest's job is still pending, retrying or running, it is reused
 *   (and reads the text just saved). It is counted in `alreadyQueued`, not in
 *   `queued`, and no second activity is written for it: neither the audit nor the
 *   UI claims a send this call did not make. Once the job has finished, a new
 *   send is a new, intentional invite.
 */
export const sendInvites = mutation({
    args: {
        eventId: v.id("events"),
        guestIds: v.array(v.id("guests")),
        subject: v.string(),
        body: v.string(),
    },
    handler: async (ctx, args) => {
        const authz = await requireRole(ctx, DOMAIN_WRITE_ROLES);
        // Final review M2: per-caller budget (legacy: global 100 req/min).
        await assertRateLimit(ctx, { bucket: "emailSend", key: `${authz.appUserId}:${authz.organizationId}` });

        if (args.guestIds.length === 0 || args.guestIds.length > MAX_SEND_GUESTS) {
            throw new ConvexError({ code: "INVALID_INPUT", field: "guestIds", max: MAX_SEND_GUESTS });
        }
        const subject = requireText(args.subject, MAX_SUBJECT_LENGTH, "subject");
        const body = requireText(args.body, MAX_BODY_LENGTH, "body");

        const event = await requireOwnedEvent(ctx, authz.organizationId, args.eventId);
        assertEventOpenForSending(event);

        const now = Date.now();
        await ctx.db.patch(event._id, {
            distribution: { ...event.distribution, emailSubject: subject, emailBody: body },
            ...(event.status === "draft" ? { status: "active" } : {}),
            updatedAt: now,
        });

        const wanted = new Set(args.guestIds.map((id) => id as string));
        const guests = (await collectGuests(ctx, event._id)).filter(
            (guest) => isActive(guest) && wanted.has(guest._id),
        );
        const withEmail = guests.filter((guest) => guest.email !== undefined);
        const skippedNoEmail = guests.length - withEmail.length;
        let queued = 0;
        let alreadyQueued = 0;

        for (const guest of withEmail) {
            const { deduplicated } = await enqueueJob(ctx, {
                type: JOB_TYPES.sendInviteEmail,
                payload: { guestId: guest._id },
                dedupeKey: `${JOB_TYPES.sendInviteEmail}:${guest._id}`,
            });
            if (deduplicated) {
                alreadyQueued += 1;
                continue;
            }
            queued += 1;

            await ctx.db.patch(guest._id, {
                // Legacy `COALESCE(sent_at, now())`: the first send date is kept.
                ...(guest.sentAt === undefined ? { sentAt: now } : {}),
                sentChannel: "email",
                updatedAt: now,
            });
            await ctx.db.insert("guestActivities", {
                organizationId: authz.organizationId,
                eventId: event._id,
                guestId: guest._id,
                type: "invite_sent",
                meta: { channel: "email" },
                createdAt: now,
            });
        }

        const result = { queued, alreadyQueued, skippedNoEmail, failed: 0 };

        await writeAudit(ctx, {
            action: "invite.sent",
            actorAppUserId: authz.appUserId,
            actorAuthUserId: authz.authUserId,
            organizationId: authz.organizationId,
            targetType: "event",
            targetId: event._id,
            details: { channel: "email", ...result },
        });

        return result;
    },
});

/**
 * `api.guests.sendTest` — "send a test to me": the invite email, to the caller,
 * as the sample guest "Anna", with a signed preview link instead of a guest link.
 *
 * Port of `distribution.service.sendTest`, with one deliberate change: the legacy
 * sent synchronously inside the route, and an external side effect executed that
 * way has no persisted attempts, backoff or terminal state (a provider error after
 * acceptance would even read as "failed" while the email left). Here the mutation
 * authorizes, validates, stores the request and **queues a job**
 * (`send-test-invite-email`, payload `{ testRequestId }` only); delivery, retries
 * and the terminal state are the job machine's (`convex/jobs.ts`), with a Resend
 * idempotency key per request. The UI therefore reports "queued", not "sent".
 *
 * The subject/body override exists to try the text before saving it: it lives on
 * the request row, never on the event.
 */
export const sendTest = mutation({
    args: {
        eventId: v.id("events"),
        subject: v.optional(v.string()),
        body: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<{ queued: true }> => {
        const authz = await requireRole(ctx, DOMAIN_WRITE_ROLES);
        // Final review M2: per-caller budget (legacy: global 100 req/min).
        await assertRateLimit(ctx, { bucket: "emailSend", key: `${authz.appUserId}:${authz.organizationId}` });
        const subject = optionalText(args.subject, MAX_SUBJECT_LENGTH, "subject");
        const body = optionalText(args.body, MAX_BODY_LENGTH, "body");

        const event = await requireOwnedEvent(ctx, authz.organizationId, args.eventId);
        const appUser = await ctx.db.get(authz.appUserId);
        if (!appUser?.email) {
            throw new ConvexError({ code: "USER_EMAIL_MISSING", message: "Email dell'utente non disponibile" });
        }

        const testRequestId = await ctx.db.insert("inviteTestRequests", {
            organizationId: authz.organizationId,
            eventId: event._id,
            requestedBy: authz.appUserId,
            ...(subject ? { subject } : {}),
            ...(body ? { body } : {}),
            createdAt: Date.now(),
        });

        await enqueueJob(ctx, {
            type: JOB_TYPES.sendTestInviteEmail,
            payload: { testRequestId },
        });

        await writeAudit(ctx, {
            action: "invite.test_requested",
            actorAppUserId: authz.appUserId,
            actorAuthUserId: authz.authUserId,
            organizationId: authz.organizationId,
            targetType: "event",
            targetId: event._id,
            details: { testRequestId },
        });

        return { queued: true };
    },
});

/**
 * What the test job needs, resolved **when it runs**: the recipient is the
 * requester's current email, the text the event's current one (unless the request
 * carries an override). `null` when the request, the event or the requester no
 * longer exist — the job then ends without sending instead of retrying five times
 * something that has no recipient.
 */
export const testEmailContext = internalQuery({
    args: { testRequestId: v.id("inviteTestRequests") },
    handler: async (ctx, args) => {
        const request = await ctx.db.get(args.testRequestId);
        if (!request) return null;
        const [event, requester] = await Promise.all([
            ctx.db.get(request.eventId),
            ctx.db.get(request.requestedBy),
        ]);
        if (!event || !requester?.email) return null;

        return {
            to: requester.email,
            organizationId: request.organizationId,
            title: event.title,
            slug: event.slug,
            subject: request.subject || event.distribution.emailSubject || emailSubjects.guestInvite(event.title),
            body: request.body || event.distribution.emailBody || FALLBACK_INVITE_BODY,
        };
    },
});

/** Link, subject and message of the test email: pure, used by the job runner. */
export async function buildTestInviteEmail(context: {
    slug: string;
    subject: string;
    body: string;
}): Promise<{ link: string; subject: string; message: string; firstName: string }> {
    const base = siteUrl().replace(/\/+$/, "");
    const sig = await signPreviewToken(requireEnv("BETTER_AUTH_SECRET"), context.slug);
    const link = `${base}/e/${context.slug}/${PREVIEW_TOKEN}?sig=${encodeURIComponent(sig)}`;
    const values = { nome: TEST_GUEST_NAME, link };

    return {
        link,
        subject: applyInvitePlaceholders(context.subject, values),
        message: applyInvitePlaceholders(context.body, values),
        firstName: TEST_GUEST_NAME,
    };
}
