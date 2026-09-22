import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireActiveOrganization } from "./lib/authorization";
import { writeAudit } from "./lib/audit";
import { forbidden } from "./lib/identity";
import { requireOwnedEvent, resolveEventLimits } from "./lib/domain";

/**
 * Reminder per evento (plan Task 11) — `server/services/reminder.service.ts`.
 *
 * Le tre regole che questo file esiste per rispettare:
 *
 * 1. **Massimo N per evento** (Free e Celebrazione 3, Atelier illimitato). Il
 *    conteggio è fatto **dopo** aver deciso cosa succede a ogni riga, perché i
 *    reminder già inviati restano anche se omessi dalla lista: contarli come
 *    "cancellati" permetterebbe di superare il limite svuotando il form.
 * 2. **Un reminder già inviato è immutabile**: una riga con `sentAt` non si
 *    aggiorna e non si cancella. Il legacy lo faceva con uno skip silenzioso, e lo
 *    skip resta silenzioso: rifiutare l'intera operazione punirebbe l'organizzatore
 *    per un dettaglio che non ha modo di vedere.
 * 3. **Invio una volta sola**: `pending` è la traduzione Convex dell'indice
 *    parziale `WHERE enabled AND sent_at IS NULL` (vedi `convex/schema.ts`), e va
 *    tenuto allineato a `enabled`/`sentAt` in ogni scrittura.
 *
 * L'esecuzione del cron (`processDueReminders`) **non** è qui: dispatcha un job per
 * ospite, e la coda è il Task 13. Qui c'è lo stato che quel job dovrà leggere.
 */

const reminderInput = {
    id: v.optional(v.string()),
    daysBefore: v.number(),
    subject: v.string(),
    message: v.string(),
    enabled: v.boolean(),
};

/** `pending` è derivato: un reminder è in attesa finché non è inviato. */
const isPending = (reminder: Pick<Doc<"eventReminders">, "enabled" | "sentAt">): boolean =>
    reminder.enabled && reminder.sentAt === undefined;

export const list = query({
    args: { eventId: v.id("events") },
    handler: async (ctx, args) => {
        const authz = await requireActiveOrganization(ctx);
        await requireOwnedEvent(ctx, authz.organizationId, args.eventId);

        const reminders = await ctx.db
            .query("eventReminders")
            .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
            .collect();

        return reminders.sort((left, right) => left.createdAt - right.createdAt);
    },
});

/**
 * `api.reminders.save` — bulk upsert (SPEC §6 PUT /api/events/:id/reminders).
 *
 * Semantica per riga: `id` presente e non inviato → update; `id` presente e
 * inviato → skip; `id` assente → insert. Le righe esistenti non citate nella lista
 * vengono **cancellate** se non inviate (la lista è la verità), conservate se
 * inviate.
 */
export const save = mutation({
    args: { eventId: v.id("events"), reminders: v.array(v.object(reminderInput)) },
    handler: async (ctx, args) => {
        const authz = await requireActiveOrganization(ctx);
        const event = await requireOwnedEvent(ctx, authz.organizationId, args.eventId);

        const limits = await resolveEventLimits(ctx, event);
        const existing = await ctx.db
            .query("eventReminders")
            .withIndex("by_event", (q) => q.eq("eventId", event._id))
            .collect();
        const byId = new Map(existing.map((reminder) => [reminder._id as string, reminder]));

        const sentKept = existing.filter((reminder) => reminder.sentAt !== undefined).length;
        let updatedUnsent = 0;
        let inserts = 0;
        const mentioned = new Set<string>();

        for (const item of args.reminders) {
            if (!item.id) {
                inserts += 1;
                continue;
            }
            const current = byId.get(item.id);
            if (!current) continue; // id sconosciuto nello scope: skip silenzioso
            mentioned.add(item.id);
            if (current.sentAt === undefined) updatedUnsent += 1;
        }

        if (limits.maxReminders !== -1 && sentKept + updatedUnsent + inserts > limits.maxReminders) {
            throw forbidden("REMINDER_LIMIT_REACHED", { limit: limits.maxReminders });
        }

        const now = Date.now();
        const keep = new Set<string>();
        let inserted = 0;
        let updated = 0;
        let deleted = 0;

        for (const item of args.reminders) {
            const current = item.id ? byId.get(item.id) : undefined;

            // Un `id` fornito ma sconosciuto nello scope viene **saltato**, non
            // inserito: gli id Convex non sono assegnabili dal client, e creare una
            // riga "con quell'id" significherebbe onorare un identificatore scelto
            // dal chiamante.
            if (item.id && !current) continue;

            if (current && current.sentAt !== undefined) {
                keep.add(current._id);
                continue;
            }

            if (current) {
                await ctx.db.replace(current._id, {
                    legacyId: current.legacyId,
                    organizationId: current.organizationId,
                    eventId: current.eventId,
                    daysBefore: item.daysBefore,
                    subject: item.subject,
                    message: item.message,
                    enabled: item.enabled,
                    pending: isPending({ enabled: item.enabled, sentAt: current.sentAt }),
                    sentAt: current.sentAt,
                    processingAt: current.processingAt,
                    createdAt: current.createdAt,
                    updatedAt: now,
                } as never);
                keep.add(current._id);
                updated += 1;
                continue;
            }

            const reminderId = await ctx.db.insert("eventReminders", {
                organizationId: authz.organizationId,
                eventId: event._id,
                daysBefore: item.daysBefore,
                subject: item.subject,
                message: item.message,
                enabled: item.enabled,
                pending: item.enabled,
                createdAt: now,
                updatedAt: now,
            });
            keep.add(reminderId);
            inserted += 1;
        }

        for (const reminder of existing) {
            if (keep.has(reminder._id) || reminder.sentAt !== undefined) continue;
            await ctx.db.delete(reminder._id);
            deleted += 1;
        }

        await writeAudit(ctx, {
            action: "reminder.updated",
            actorAppUserId: authz.appUserId,
            actorAuthUserId: authz.authUserId,
            organizationId: authz.organizationId,
            targetType: "event",
            targetId: event._id,
            details: { inserted, updated, deleted },
        });

        const reminders = await ctx.db
            .query("eventReminders")
            .withIndex("by_event", (q) => q.eq("eventId", event._id))
            .collect();

        return reminders.sort((left, right) => left.createdAt - right.createdAt);
    },
});

// ---------------------------------------------------------------------------
// Stato del cron (plan Task 13, Step 4)
// ---------------------------------------------------------------------------
//
// Le transizioni di stato di un reminder sono di questo file perché è qui che vive
// il significato di `pending`/`processingAt`; il cron in `convex/jobs.ts` le
// orchestra e non le reimplementa.

/** Lease del cron: dopo questo tempo un claim è considerato morto. */
const PROCESSING_LEASE_MS = 5 * 60 * 1000;

/**
 * Reminder "dovuti": enabled, mai inviati, non in processing, di un evento attivo
 * con `rsvpDeadline` **dentro la finestra** di `daysBefore` e non ancora passata.
 *
 * Query di sistema, cross-org per costruzione: nessun `organizationId` in ingresso,
 * perché il chiamante è il cron. Le funzioni a valle restano org-scoped — l'org
 * arriva dalla riga del reminder, che è già filtrata.
 *
 * L'indice `by_enabled_pending` è la traduzione Convex dell'indice parziale del
 * legacy: `pending` è un campo esplicito proprio perché i documenti senza il campo
 * non entrano nell'indice.
 */
export const dueReminders = internalQuery({
    args: { limit: v.optional(v.number()) },
    handler: async (
        ctx,
        args,
    ): Promise<
        Array<{
            reminderId: Id<"eventReminders">;
            organizationId: Id<"organizations">;
            eventId: Id<"events">;
        }>
    > => {
        const now = Date.now();
        const limit = args.limit ?? 20;

        const pending = await ctx.db
            .query("eventReminders")
            .withIndex("by_enabled_pending", (q) => q.eq("enabled", true).eq("pending", true))
            .take(limit * 5);

        const due: Array<{
            reminderId: Id<"eventReminders">;
            organizationId: Id<"organizations">;
            eventId: Id<"events">;
        }> = [];

        for (const reminder of pending) {
            // Il lease scaduto è riprendibile: è ciò che rende un cron morto a metà
            // innocuo invece che bloccante.
            if (reminder.processingAt !== undefined && reminder.processingAt > now - PROCESSING_LEASE_MS) {
                continue;
            }

            const event = await ctx.db.get(reminder.eventId);
            if (!event || event.status !== "active") continue;
            if (event.rsvpDeadline === undefined) continue;
            // A deadline passata il form è chiuso: un promemoria sarebbe fuorviante.
            if (now > event.rsvpDeadline) continue;
            if (now < event.rsvpDeadline - reminder.daysBefore * 24 * 60 * 60 * 1000) continue;

            due.push({
                reminderId: reminder._id,
                organizationId: reminder.organizationId,
                eventId: reminder.eventId,
            });

            if (due.length >= limit) break;
        }

        return due;
    },
});

/** Claim atomico con lease: `false` se un altro giro lo sta già processando. */
export const claimForProcessing = internalMutation({
    args: { reminderId: v.id("eventReminders") },
    handler: async (ctx, args): Promise<boolean> => {
        const reminder = await ctx.db.get(args.reminderId);
        if (!reminder) return false;
        if (reminder.sentAt !== undefined) return false;

        const now = Date.now();
        if (reminder.processingAt !== undefined && reminder.processingAt > now - PROCESSING_LEASE_MS) {
            return false;
        }

        await ctx.db.patch(reminder._id, { processingAt: now, updatedAt: now });
        return true;
    },
});

/** Rilascia il lease: il giro successivo riprova dallo stato attuale. */
export const releaseProcessing = internalMutation({
    args: { reminderId: v.id("eventReminders") },
    handler: async (ctx, args): Promise<void> => {
        const reminder = await ctx.db.get(args.reminderId);
        if (!reminder) return;

        await ctx.db.patch(reminder._id, { processingAt: undefined, updatedAt: Date.now() });
    },
});

/**
 * Marca il reminder come inviato e rilascia il lease — **solo** se non era già
 * inviato: un secondo giro che arriva tardi non deve poter riscrivere `sentAt`.
 */
export const markSent = internalMutation({
    args: { reminderId: v.id("eventReminders") },
    handler: async (ctx, args): Promise<boolean> => {
        const reminder = await ctx.db.get(args.reminderId);
        if (!reminder || reminder.sentAt !== undefined) return false;

        const now = Date.now();
        await ctx.db.patch(reminder._id, {
            sentAt: now,
            processingAt: undefined,
            pending: false,
            updatedAt: now,
        });

        return true;
    },
});

/**
 * Ospiti da sollecitare: non rimossi, con email, con i reminder attivi e **senza**
 * risposta. Il legacy lo esprimeva con una `LEFT JOIN` su `rsvp_responses` e
 * `IS NULL`; qui la sottrazione è esplicita, perché senza join non c'è il rischio
 * di dimenticare il ramo "nessuna risposta" in un `WHERE`.
 *
 * La finestra è limitata (`limit * 2` ospiti letti) e il limite è dichiarato: un
 * evento con più di 400 ospiti viene sollecitato in più giri, non in uno. Il cron
 * gira una volta al giorno su una finestra di giorni, quindi il caso non peggiora
 * con le dimensioni dell'evento — mentre un `collect` senza tetto lo farebbe.
 */
export const pendingGuests = internalQuery({
    args: {
        organizationId: v.id("organizations"),
        eventId: v.id("events"),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args): Promise<Array<Id<"guests">>> => {
        const limit = args.limit ?? 200;

        const guests = await ctx.db
            .query("guests")
            .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
            .take(limit * 2);

        const answered = await ctx.db
            .query("rsvpResponses")
            .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
            .collect();
        const answeredIds = new Set(answered.map((row) => row.guestId as string));

        const pending: Array<Id<"guests">> = [];
        for (const guest of guests) {
            if (guest.organizationId !== args.organizationId) continue;
            if (guest.removedAt !== undefined) continue;
            if (guest.remindersDisabled) continue;
            if (!guest.email || guest.email.length === 0) continue;
            if (answeredIds.has(guest._id as string)) continue;

            pending.push(guest._id);
            if (pending.length >= limit) break;
        }

        return pending;
    },
});
