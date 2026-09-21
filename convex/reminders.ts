import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
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
