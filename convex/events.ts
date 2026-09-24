import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireActiveOrganization } from "./lib/authorization";
import { writeAudit } from "./lib/audit";
import { forbidden } from "./lib/identity";
import {
    DEFAULT_RSVP_CLOSED_MESSAGE,
    assertBlocksInvariants,
    assertRsvpConfigInvariants,
    generateEventSlug,
    requireOwnedEvent,
    resolveOrganizationTier,
} from "./lib/domain";
import { TIER_LIMITS } from "./lib/pricing";
import { getDefaultDistribution, getTemplate } from "./lib/inviteTemplates";
import { RSVP_PRESETS } from "./lib/rsvpPresets";
import {
    eventDistribution,
    eventStatus,
    eventTypeKey,
    inviteBlock,
    inviteTheme,
    rsvpQuestion,
} from "./model/validators";

/**
 * Eventi Ceremly in Convex (plan Task 11).
 *
 * Porting di `server/services/event.service.ts`: le stesse regole, lo stesso
 * ordine di controlli, gli stessi messaggi. Quello che cambia è *dove* sta
 * l'autorità:
 *
 * - l'organizzazione non arriva mai dall'input, sempre da `requireActiveOrganization`;
 * - l'evento è verificato contro quell'organizzazione prima di ogni accesso
 *   (`requireOwnedEvent`), e un evento altrui è "non trovato", non "vietato";
 * - ogni scrittura scrive audit **nella stessa transazione**, quindi un audit che
 *   non si può scrivere annulla la scrittura (nel legacy `logAudit` inghiottiva
 *   l'errore per non rompere la richiesta).
 *
 * Il limite di eventi attivi Free resta un check-then-insert: in Convex la
 * mutation è serializzabile, quindi due create concorrenti della stessa org non
 * possono più leggere lo stesso conteggio — la TOCTOU che il legacy accettava
 * (`#2`, driver HTTP) qui non esiste.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Aggregati condivisi da lista e statistiche
// ---------------------------------------------------------------------------

interface GuestTally {
    guests: number;
    sent: number;
    opened: number;
    responded: number;
    confirmed: number;
    declined: number;
    maybe: number;
    totalPeople: number;
    noEmailPending: number;
}

const emptyTally = (): GuestTally => ({
    guests: 0,
    sent: 0,
    opened: 0,
    responded: 0,
    confirmed: 0,
    declined: 0,
    maybe: 0,
    totalPeople: 0,
    noEmailPending: 0,
});

/**
 * Conta gli ospiti attivi di ogni evento dell'organizzazione e incrocia le
 * risposte.
 *
 * Una lettura per tabella invece di una per evento: `by_organization` copre tutti
 * gli ospiti dell'org, e il raggruppamento per evento è in memoria. Il legacy
 * faceva la stessa cosa in SQL con `count(...) filter (where ...)` in un solo
 * round trip; qui il costo è lineare negli ospiti dell'organizzazione, non nel
 * numero di eventi.
 */
async function tallyGuestsByEvent(
    ctx: QueryCtx,
    organizationId: Id<"organizations">,
): Promise<Map<string, GuestTally>> {
    const [guests, responses] = await Promise.all([
        ctx.db
            .query("guests")
            .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
            .collect(),
        ctx.db
            .query("rsvpResponses")
            .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
            .collect(),
    ]);

    const byGuest = new Map<string, Doc<"rsvpResponses">>();
    for (const response of responses) byGuest.set(response.guestId, response);

    const tallies = new Map<string, GuestTally>();
    for (const guest of guests) {
        // Gli ospiti rimossi (soft-delete) non contano in nessuna vista
        // organizzatore: né nel conteggio né nelle azioni aperte.
        if (guest.removedAt !== undefined) continue;

        const key = guest.eventId;
        const tally = tallies.get(key) ?? emptyTally();
        const response = byGuest.get(guest._id);

        tally.guests += 1;
        if (guest.sentAt !== undefined) tally.sent += 1;
        if (guest.firstOpenedAt !== undefined) tally.opened += 1;

        if (response) {
            tally.responded += 1;
            if (response.attending === "yes") {
                tally.confirmed += 1;
                tally.totalPeople += 1 + response.companionsCount;
            } else if (response.attending === "no") {
                tally.declined += 1;
            } else {
                tally.maybe += 1;
            }
        } else if (guest.email === undefined) {
            // "Senza email e senza risposta": sono gli inviti che l'organizzatore
            // deve mandare a mano (il reminder WhatsApp non ha un destinatario).
            tally.noEmailPending += 1;
        }

        tallies.set(key, tally);
    }

    return tallies;
}

/**
 * Il blocco `counts` delle card evento, in un punto solo.
 *
 * Estratto nel Task 14 perché ora lo usano due query (`list` e `listAll`): il
 * commento su `pending` è una decisione di prodotto, e due copie di una decisione
 * sono due decisioni che possono divergere.
 */
function countsOf(tally: GuestTally) {
    return {
        guests: tally.guests,
        confirmed: tally.confirmed,
        declined: tally.declined,
        maybe: tally.maybe,
        // "In attesa" = ospiti senza risposta; i `maybe` hanno
        // risposto e sono esposti a parte.
        pending: Math.max(0, tally.guests - tally.responded),
        opened: tally.opened,
        sent: tally.sent,
    };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * `api.events.list` — eventi dell'organizzazione con i conteggi, dal più recente.
 *
 * Paginato (il piano lo richiede) con l'ordinamento del legacy: `createdAt` desc.
 */
export const list = query({
    args: { paginationOpts: paginationOptsValidator },
    handler: async (ctx, args) => {
        const authz = await requireActiveOrganization(ctx);

        const page = await ctx.db
            .query("events")
            .withIndex("by_organization_created", (q) => q.eq("organizationId", authz.organizationId))
            .order("desc")
            .paginate(args.paginationOpts);

        const tallies = await tallyGuestsByEvent(ctx, authz.organizationId);

        return {
            ...page,
            page: page.page.map((event) => ({
                ...event,
                counts: countsOf(tallies.get(event._id) ?? emptyTally()),
            })),
        };
    },
});

/**
 * Tetto della vista UI (Task 14), come `projects.listAll`.
 *
 * La home e la pagina abbonamento mostrano l'elenco completo con i KPI aggregati
 * client-side, quindi vogliono una lista sola e viva: i cursori dal client
 * significherebbero una sottoscrizione per pagina, con le pagine precedenti
 * congelate a ogni avanzamento. `truncated` dice alla UI quando il tetto morde.
 *
 * I conteggi vengono dagli stessi `tallyGuestsByEvent` di `list`: due query dello
 * stesso dominio che contano in modo diverso sarebbero due verità.
 */
export const UI_LIST_LIMIT = 500;

export const listAll = query({
    args: {},
    handler: async (ctx) => {
        const authz = await requireActiveOrganization(ctx);

        const events = await ctx.db
            .query("events")
            .withIndex("by_organization_created", (q) => q.eq("organizationId", authz.organizationId))
            .order("desc")
            .take(UI_LIST_LIMIT);

        const tallies = await tallyGuestsByEvent(ctx, authz.organizationId);

        return {
            events: events.map((event) => ({
                ...event,
                counts: countsOf(tallies.get(event._id) ?? emptyTally()),
            })),
            truncated: events.length === UI_LIST_LIMIT,
        };
    },
});

/** `api.events.get` — evento completo della propria organizzazione. */
export const get = query({
    args: { eventId: v.id("events") },
    handler: async (ctx, args) => {
        const authz = await requireActiveOrganization(ctx);
        return await requireOwnedEvent(ctx, authz.organizationId, args.eventId);
    },
});

const createInput = {
    type: eventTypeKey,
    templateKey: v.string(),
    title: v.string(),
    eventDate: v.optional(v.number()),
    eventTime: v.optional(v.string()),
    locationName: v.optional(v.string()),
    locationAddress: v.optional(v.string()),
};

/** "12 settembre 2026" — formato display it-IT per i blocchi header. */
function formatDateIt(timestamp: number): string {
    return new Intl.DateTimeFormat("it-IT", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    }).format(new Date(timestamp));
}

/**
 * Nomi per il blocco header: per matrimonio il titolo "Giulia & Tommaso" viene
 * diviso in più nomi; altrimenti il titolo resta un nome solo.
 */
function splitHeaderNames(type: Doc<"events">["type"], title: string): string[] {
    if (type === "matrimonio") {
        const parts = title
            .split(/\s+&\s+|\s+e\s+/i)
            .map((part) => part.trim())
            .filter((part) => part.length > 0);
        if (parts.length >= 2 && parts.length <= 4) return parts;
    }
    return [title];
}

/**
 * DEEP-CLONE dei blocchi del template con i placeholder sostituiti.
 *
 * `structuredClone` e non spread: il template è una costante condivisa, e mutarla
 * qui significherebbe cambiare il default di tutti gli eventi successivi.
 */
function buildBlocksFromTemplate(
    defaultBlocks: Doc<"events">["blocks"],
    input: {
        type: Doc<"events">["type"];
        title: string;
        eventDate?: number;
        eventTime?: string;
        locationName?: string;
        locationAddress?: string;
    },
): Doc<"events">["blocks"] {
    const list = structuredClone(defaultBlocks) as unknown as Array<{
        type: string;
        data: Record<string, unknown>;
    }>;

    for (const block of list) {
        if (block.type === "header") {
            block.data.names = splitHeaderNames(input.type, input.title);
            if (input.eventDate !== undefined) block.data.dateText = formatDateIt(input.eventDate);
            if (input.eventTime !== undefined) block.data.timeText = input.eventTime;
        }
        if (block.type === "location") {
            if (input.locationName !== undefined) block.data.name = input.locationName;
            if (input.locationAddress !== undefined) block.data.address = input.locationAddress;
        }
    }

    return list as unknown as Doc<"events">["blocks"];
}

/**
 * `api.events.create` — evento da template, con i limiti del tier effettivo.
 *
 * Il template deve esistere **e** corrispondere al tipo: un `templateKey` di
 * matrimonio su un evento `laurea` produrrebbe blocchi con i testi sbagliati, e
 * nel legacy era 404.
 */
export const create = mutation({
    args: { input: v.object(createInput) },
    handler: async (ctx, args) => {
        const authz = await requireActiveOrganization(ctx);
        const { input } = args;

        const template = getTemplate(input.templateKey);
        if (!template || template.eventType !== input.type) {
            throw forbidden("TEMPLATE_NOT_FOUND", { templateKey: input.templateKey });
        }

        // Limite eventi attivi: gli eventi Free non chiusi occupano lo slot, gli
        // sbloccati (`celebration`) no. Un'org Atelier non ha limite.
        if ((await resolveOrganizationTier(ctx, authz.organizationId)) !== "atelier") {
            const active = await ctx.db
                .query("events")
                .withIndex("by_organization", (q) => q.eq("organizationId", authz.organizationId))
                .collect();
            const activeFree = active.filter(
                (event) => event.tier === "free" && event.status !== "closed",
            ).length;

            if (activeFree >= TIER_LIMITS.free.maxActiveEvents) {
                throw forbidden("ACTIVE_EVENT_LIMIT_REACHED", {
                    limit: TIER_LIMITS.free.maxActiveEvents,
                });
            }
        }

        const blocks = buildBlocksFromTemplate(template.defaultBlocks, input);
        const rsvpConfig = structuredClone(RSVP_PRESETS[input.type]);
        const distribution = getDefaultDistribution(input.type, input.title);

        // Slug: prima si prova quello derivato dal titolo, poi si rigenera. In
        // Convex non esiste un indice unico, quindi il controllo è esplicito —
        // ed è ripetuto al momento dell'insert, perché due create concorrenti
        // della stessa org non sono il caso che il retry del legacy copriva.
        let slug = generateEventSlug(input.title);
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const clash = await ctx.db
                .query("events")
                .withIndex("by_slug", (q) => q.eq("slug", slug))
                .first();
            if (!clash) break;
            if (attempt === 4) {
                throw new ConvexError({ code: "EVENT_SLUG_UNAVAILABLE", slug });
            }
            slug = generateEventSlug(input.title);
        }

        const now = Date.now();
        const eventId = await ctx.db.insert("events", {
            organizationId: authz.organizationId,
            type: input.type,
            templateKey: input.templateKey,
            title: input.title,
            slug,
            status: "draft",
            blocks,
            rsvpConfig: rsvpConfig as Doc<"events">["rsvpConfig"],
            rsvpClosedMessage: DEFAULT_RSVP_CLOSED_MESSAGE,
            distribution,
            tier: "free",
            ...(input.eventDate !== undefined ? { eventDate: input.eventDate } : {}),
            ...(input.eventTime !== undefined ? { eventTime: input.eventTime } : {}),
            ...(input.locationName !== undefined ? { locationName: input.locationName } : {}),
            ...(input.locationAddress !== undefined ? { locationAddress: input.locationAddress } : {}),
            createdAt: now,
            updatedAt: now,
        });

        await writeAudit(ctx, {
            action: "event.created",
            actorAppUserId: authz.appUserId,
            actorAuthUserId: authz.authUserId,
            organizationId: authz.organizationId,
            targetType: "event",
            targetId: eventId,
            details: { type: input.type, templateKey: input.templateKey },
        });

        return await requireOwnedEvent(ctx, authz.organizationId, eventId);
    },
});

const updateInput = {
    title: v.optional(v.string()),
    eventDate: v.optional(v.union(v.number(), v.null())),
    eventTime: v.optional(v.union(v.string(), v.null())),
    locationName: v.optional(v.union(v.string(), v.null())),
    locationAddress: v.optional(v.union(v.string(), v.null())),
    status: v.optional(eventStatus),
    theme: v.optional(v.union(inviteTheme, v.null())),
    inviteFont: v.optional(v.union(v.string(), v.null())),
    blocks: v.optional(v.array(inviteBlock)),
    rsvpConfig: v.optional(v.array(rsvpQuestion)),
    rsvpDeadline: v.optional(v.union(v.number(), v.null())),
    rsvpClosedMessage: v.optional(v.union(v.string(), v.null())),
    distribution: v.optional(eventDistribution),
};

/** Campi che possono essere *azzerati*: `null` esplicito rimuove il campo. */
const CLEARABLE = [
    "eventDate",
    "eventTime",
    "locationName",
    "locationAddress",
    "theme",
    "inviteFont",
    "rsvpDeadline",
    "rsvpClosedMessage",
] as const;

/**
 * `api.events.update` — patch parziale con invarianti di contenuto.
 *
 * `null` significa "azzera il campo": il modello Convex rappresenta l'assenza come
 * campo non presente, quindi il documento viene riscritto (`replace`) invece che
 * aggiornato (`patch`) — un `patch` non può togliere una chiave, e il legacy
 * distingueva davvero `undefined` (non toccare) da `null` (svuota).
 *
 * Come nel legacy, un update dell'organizzatore **azzera `cleanupWarnedAt`**: se
 * l'evento diventa di nuovo stale, il cron lo avvisa di nuovo invece di
 * cancellarlo senza preavviso (FIX 7.4).
 */
export const update = mutation({
    args: { eventId: v.id("events"), input: v.object(updateInput) },
    handler: async (ctx, args) => {
        const authz = await requireActiveOrganization(ctx);
        const event = await requireOwnedEvent(ctx, authz.organizationId, args.eventId);
        const { input } = args;

        if (input.blocks !== undefined) assertBlocksInvariants(input.blocks);
        if (input.rsvpConfig !== undefined) assertRsvpConfigInvariants(input.rsvpConfig);

        const next: Record<string, unknown> = { ...event };
        delete next._id;
        delete next._creationTime;
        delete next.cleanupWarnedAt;

        for (const [key, value] of Object.entries(input)) {
            if (value === undefined) continue;
            if (value === null && (CLEARABLE as readonly string[]).includes(key)) {
                // `null` esplicito significa "azzera": la chiave deve sparire dal
                // documento, non restare con un valore vuoto. La cancellazione
                // dinamica è voluta e la chiave è già validata contro CLEARABLE.
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete next[key];
                continue;
            }
            if (value === null) continue;
            next[key] = value;
        }
        next.updatedAt = Date.now();

        await ctx.db.replace(event._id, next as Doc<"events">);

        await writeAudit(ctx, {
            action: "event.updated",
            actorAppUserId: authz.appUserId,
            actorAuthUserId: authz.authUserId,
            organizationId: authz.organizationId,
            targetType: "event",
            targetId: event._id,
            details: { fields: Object.keys(input) },
        });

        return await requireOwnedEvent(ctx, authz.organizationId, event._id);
    },
});

/**
 * `api.events.remove` — hard delete con cascata.
 *
 * In Convex non esiste `ON DELETE CASCADE`: la cascata è esplicita e completa
 * (ospiti, risposte, attività, reminder, file dell'evento non tracciati qui perché
 * non hanno `eventId` nello schema attuale). Un delete parziale lascerebbe righe
 * orfane che nessuna query raggiunge più — l'opposto della cascata che il legacy
 * aveva nel database.
 */
export const remove = mutation({
    args: { eventId: v.id("events") },
    handler: async (ctx, args) => {
        const authz = await requireActiveOrganization(ctx);
        const event = await requireOwnedEvent(ctx, authz.organizationId, args.eventId);

        await deleteEventGraph(ctx, event);

        await writeAudit(ctx, {
            action: "event.deleted",
            actorAppUserId: authz.appUserId,
            actorAuthUserId: authz.authUserId,
            organizationId: authz.organizationId,
            targetType: "event",
            targetId: event._id,
        });

        return { success: true };
    },
});

/** Tutte le righe che appartengono a un evento, rimosse insieme a lui. */
export async function deleteEventGraph(ctx: MutationCtx, event: Doc<"events">): Promise<void> {
    const [guests, responses, activities, reminders, testRequests] = await Promise.all([
        ctx.db.query("guests").withIndex("by_event", (q) => q.eq("eventId", event._id)).collect(),
        ctx.db
            .query("rsvpResponses")
            .withIndex("by_event", (q) => q.eq("eventId", event._id))
            .collect(),
        ctx.db
            .query("guestActivities")
            .withIndex("by_event", (q) => q.eq("eventId", event._id))
            .collect(),
        ctx.db
            .query("eventReminders")
            .withIndex("by_event", (q) => q.eq("eventId", event._id))
            .collect(),
        ctx.db
            .query("inviteTestRequests")
            .withIndex("by_event", (q) => q.eq("eventId", event._id))
            .collect(),
    ]);

    for (const row of [...responses, ...activities, ...reminders, ...testRequests, ...guests]) {
        await ctx.db.delete(row._id);
    }

    await ctx.db.delete(event._id);
}

// ---------------------------------------------------------------------------
// Statistiche (SPEC §6.1)
// ---------------------------------------------------------------------------

/**
 * Risposta di `api.events.stats`.
 *
 * Stessa shape di `EventStats` in `shared/types/ceremly.ts`, dichiarata qui
 * perché Convex non può importare da `shared/` (bundle separato).
 */
export interface EventStatsResult {
    kpi: {
        totalGuests: number;
        sent: number;
        opened: number;
        responded: number;
        confirmed: number;
        declined: number;
        maybe: number;
        pending: number;
        totalPeople: number;
    };
    timeline: Array<{ date: string; confirmed: number; declined: number; maybe: number }>;
    menuBreakdown: Array<{ label: string; count: number }>;
    allergies: Array<{ value: string; count: number }>;
    needsAttention: Array<{
        guestId: string;
        name: string;
        contact: string | null;
        openedDaysAgo: number;
    }>;
    noEmailPending: number;
}

interface PerPersonAnswer {
    self: unknown;
    companions: unknown[];
}

const isPerPersonAnswer = (value: unknown): value is PerPersonAnswer =>
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "companions" in value &&
    Array.isArray((value as PerPersonAnswer).companions);

/** Tutti i valori (self + accompagnatori) di una risposta, appiattiti. */
function flattenAnswerValues(raw: unknown): unknown[] {
    if (raw === undefined || raw === null) return [];
    if (isPerPersonAnswer(raw)) {
        const values = raw.self === null || raw.self === undefined ? [] : [raw.self];
        return [...values, ...raw.companions.filter((value) => value !== null && value !== undefined)];
    }
    return [raw];
}

const isoDay = (timestamp: number): string => new Date(timestamp).toISOString().slice(0, 10);

/**
 * `api.events.stats` — kpi, timeline 28 giorni, menu, allergie, attenzione.
 *
 * Le aggregazioni sulle `answers` restano in TypeScript, come nel legacy: il
 * jsonb non è indicizzabile per contenuto e una query per domanda sarebbe una
 * scansione per risposta.
 */
export const stats = query({
    args: { eventId: v.id("events") },
    handler: async (ctx, args): Promise<EventStatsResult> => {
        const authz = await requireActiveOrganization(ctx);
        const event = await requireOwnedEvent(ctx, authz.organizationId, args.eventId);

        const now = Date.now();
        const sevenDaysAgo = now - 7 * DAY_MS;

        const [guests, responses] = await Promise.all([
            ctx.db.query("guests").withIndex("by_event", (q) => q.eq("eventId", event._id)).collect(),
            ctx.db
                .query("rsvpResponses")
                .withIndex("by_event", (q) => q.eq("eventId", event._id))
                .collect(),
        ]);

        // Gli ospiti rimossi restano nel database (soft-delete) ma fuori da ogni
        // statistica, esattamente come nel legacy.
        const active = guests.filter((guest) => guest.removedAt === undefined);
        const responseByGuest = new Map(responses.map((response) => [response.guestId, response]));

        const kpi = {
            totalGuests: active.length,
            sent: active.filter((guest) => guest.sentAt !== undefined).length,
            opened: active.filter((guest) => guest.firstOpenedAt !== undefined).length,
            responded: 0,
            confirmed: 0,
            declined: 0,
            maybe: 0,
            pending: 0,
            totalPeople: 0,
        };

        const eventResponses: Doc<"rsvpResponses">[] = [];
        for (const guest of active) {
            const response = responseByGuest.get(guest._id);
            if (!response) continue;
            eventResponses.push(response);
            kpi.responded += 1;
            if (response.attending === "yes") {
                kpi.confirmed += 1;
                kpi.totalPeople += 1 + response.companionsCount;
            } else if (response.attending === "no") {
                kpi.declined += 1;
            } else {
                kpi.maybe += 1;
            }
        }
        // "In attesa" = ospiti senza risposta: i `maybe` hanno risposto.
        kpi.pending = Math.max(0, kpi.totalGuests - kpi.responded);

        // --- Timeline cumulativa, ultimi 28 giorni -------------------------
        // Ogni risposta conta nello stato attuale a partire dall'ultimo
        // aggiornamento; le risposte precedenti alla finestra entrano nella
        // baseline del primo giorno, perché la serie è cumulativa.
        const days = 28;
        const todayKey = isoDay(now);
        const startOfWindow = now - (days - 1) * DAY_MS;
        const startKey = isoDay(startOfWindow);

        const perDay = new Map<string, { confirmed: number; declined: number; maybe: number }>();
        const baseline = { confirmed: 0, declined: 0, maybe: 0 };
        const bucketOf = (attending: string): keyof typeof baseline | null => {
            if (attending === "yes") return "confirmed";
            if (attending === "no") return "declined";
            if (attending === "maybe") return "maybe";
            return null;
        };

        for (const response of eventResponses) {
            const bucket = bucketOf(response.attending);
            if (!bucket) continue;

            const effective = isoDay(response.updatedAt ?? response.submittedAt);
            if (effective < startKey) {
                baseline[bucket] += 1;
                continue;
            }
            const key = effective > todayKey ? todayKey : effective;
            const day = perDay.get(key) ?? { confirmed: 0, declined: 0, maybe: 0 };
            day[bucket] += 1;
            perDay.set(key, day);
        }

        const timeline: EventStatsResult["timeline"] = [];
        const running = { ...baseline };
        for (let index = 0; index < days; index += 1) {
            const dateKey = isoDay(startOfWindow + index * DAY_MS);
            const delta = perDay.get(dateKey);
            if (delta) {
                running.confirmed += delta.confirmed;
                running.declined += delta.declined;
                running.maybe += delta.maybe;
            }
            timeline.push({ date: dateKey, ...running });
        }

        // --- Aggregazione delle risposte ----------------------------------
        const config = event.rsvpConfig ?? [];
        const menuQuestions = config.filter(
            (question) => question.type === "single" && question.label.toLowerCase().includes("menu"),
        );
        const allergyQuestions = config.filter(
            (question) => question.type === "text" && question.label.toLowerCase().includes("allerg"),
        );

        const menuCounts = new Map<string, number>();
        const allergyCounts = new Map<string, { value: string; count: number }>();

        for (const response of eventResponses) {
            const answers = response.answers ?? {};
            for (const question of menuQuestions) {
                for (const value of flattenAnswerValues(answers[question.id])) {
                    if (typeof value !== "string" || value.trim() === "") continue;
                    menuCounts.set(value, (menuCounts.get(value) ?? 0) + 1);
                }
            }
            for (const question of allergyQuestions) {
                for (const value of flattenAnswerValues(answers[question.id])) {
                    if (typeof value !== "string" || value.trim() === "") continue;
                    const normalized = value.trim().toLowerCase();
                    const entry = allergyCounts.get(normalized);
                    if (entry) {
                        entry.count += 1;
                    } else {
                        allergyCounts.set(normalized, { value: value.trim(), count: 1 });
                    }
                }
            }
        }

        const menuBreakdown = [...menuCounts.entries()]
            .map(([label, count]) => ({ label, count }))
            .sort((left, right) => right.count - left.count);
        const allergies = [...allergyCounts.values()].sort((left, right) => right.count - left.count);

        // Ospiti che hanno aperto l'invito più di 7 giorni fa e non hanno ancora
        // risposto: la lista di lavoro dell'organizzatore (max 10, dal più vecchio).
        const needsAttention = active
            .filter(
                (guest) =>
                    responseByGuest.get(guest._id) === undefined &&
                    guest.firstOpenedAt !== undefined &&
                    guest.firstOpenedAt < sevenDaysAgo,
            )
            .sort((left, right) => (left.firstOpenedAt ?? 0) - (right.firstOpenedAt ?? 0))
            .slice(0, 10)
            .map((guest) => ({
                guestId: guest._id,
                name: `${guest.firstName} ${guest.lastName}`.trim(),
                contact: guest.email ?? guest.phone ?? null,
                openedDaysAgo: Math.floor((now - (guest.firstOpenedAt ?? now)) / DAY_MS),
            }));

        return {
            kpi,
            timeline,
            menuBreakdown,
            allergies,
            needsAttention,
            noEmailPending: active.filter(
                (guest) => guest.email === undefined && responseByGuest.get(guest._id) === undefined,
            ).length,
        };
    },
});
