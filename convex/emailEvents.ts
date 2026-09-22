import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { normalizeEmail } from "./lib/identity";

/**
 * Stato email lato Convex (plan Task 13, Step 3) — soppressioni, righe seed dei
 * messaggi inviati e ingestione del webhook Resend.
 *
 * Perché un modulo separato da `convex/email.ts`: quel file è `"use node"`, perché
 * il rendering React Email richiede Node, e una funzione `"use node"` **non può
 * esportare mutation**. La consegna (rete + template) sta di là, lo stato sta di
 * qua, e la divisione è imposta dal runtime, non preferita.
 *
 * Il webhook è modellato esattamente come il legacy (`emailWebhook.service.ts`),
 * con una differenza sostanziale: l'idempotenza non è nel client Redis ma nella
 * riga stessa. Il `svix-id` del delivery è la chiave, quindi la dedup e la scrittura
 * sono **la stessa transazione** — un replay concorrente non può leggere "non
 * ancora visto" e inserire due volte.
 */

/** Soppressioni: normalizzate qui, perché è la chiave di ricerca (`by_email`). */
export const isSuppressed = internalQuery({
    args: { email: v.string() },
    handler: async (ctx, args): Promise<boolean> => {
        const row = await ctx.db
            .query("emailSuppressions")
            .withIndex("by_email", (q) => q.eq("email", normalizeEmail(args.email)))
            .first();

        return row !== null;
    },
});

/**
 * Registra un invio accettato dal provider.
 *
 * Due scritture distinte, entrambe del legacy: la riga **seed** (`type: "sent"`) è
 * ciò che permette al webhook di risalire da un `messageId` all'ospite e all'evento
 * — senza di essa un'apertura sarebbe un evento orfano — e viene scritta solo quando
 * c'è un contesto da correlare. L'audit invece c'è sempre: è la traccia di cosa
 * l'applicazione ha spedito.
 */
export const recordSent = internalMutation({
    args: {
        messageId: v.string(),
        recipient: v.string(),
        emailType: v.string(),
        organizationId: v.optional(v.id("organizations")),
        guestId: v.optional(v.id("guests")),
        eventId: v.optional(v.id("events")),
    },
    handler: async (ctx, args): Promise<{ seeded: boolean }> => {
        const now = Date.now();
        const hasContext = Boolean(args.organizationId || args.guestId || args.eventId);

        if (hasContext) {
            await ctx.db.insert("emailEvents", {
                messageId: args.messageId,
                type: "sent",
                recipient: normalizeEmail(args.recipient),
                emailType: args.emailType,
                organizationId: args.organizationId,
                guestId: args.guestId,
                eventId: args.eventId,
                occurredAt: now,
                createdAt: now,
            });
        }

        await writeAudit(ctx, {
            action: "email.sent",
            organizationId: args.organizationId,
            targetType: "email",
            targetId: normalizeEmail(args.recipient),
            details: { emailType: args.emailType, messageId: args.messageId },
        });

        return { seeded: hasContext };
    },
});

/**
 * Un invio **non** effettuato perché l'indirizzo è in soppressione.
 *
 * Non è un errore del chiamante — è la regola che protegge la reputazione del
 * dominio — ma non deve sparire: il legacy lo auditava come `email.failed` con
 * `error: "suppressed"`, e la stessa riga qui rende visibile una lista di
 * soppressioni che sta mangiando email legittime.
 */
export const recordSuppressed = internalMutation({
    args: {
        recipient: v.string(),
        emailType: v.string(),
        organizationId: v.optional(v.id("organizations")),
    },
    handler: async (ctx, args): Promise<void> => {
        await writeAudit(ctx, {
            action: "email.failed",
            organizationId: args.organizationId,
            status: "failure",
            targetType: "email",
            targetId: normalizeEmail(args.recipient),
            details: { error: "suppressed", emailType: args.emailType },
        });
    },
});

/** Dominio di un indirizzo, in forma `Nome <a@b>` oppure `a@b`. */
function domainOf(from: string): string {
    const match = from.match(/<([^>]+)>/);
    const address = (match?.[1] ?? from).trim();
    return address.split("@")[1]?.toLowerCase() ?? "";
}

/**
 * Isolamento d'ambiente (legacy `isOwnDomain`): il webhook di Resend è
 * account-wide, quindi arrivano anche gli eventi di un altro ambiente che condivide
 * l'account Resend. Si elabora solo ciò che è stato spedito dai propri mittenti.
 *
 * `ownEmails` è passato dal chiamante invece di essere letto qui: la configurazione
 * è una decisione del bordo (l'HTTP action), e una funzione che legge `process.env`
 * non è verificabile senza deploy.
 */
export function isOwnAddressDomain(from: string, ownEmails: readonly string[]): boolean {
    const own = ownEmails
        .map((email) => domainOf(String(email ?? "")))
        .filter(Boolean);

    return own.includes(domainOf(from));
}

/**
 * Aggiorna i contatori di apertura sull'ospite.
 *
 * `firstOpenedAt` è `COALESCE` (prima apertura vince), `emailOpenedAt` è l'ultima e
 * `openCount` incrementa: la stessa asimmetria del legacy, che è ciò che rende
 * possibile la lista "aperto ma senza risposta".
 */
async function recordGuestOpen(
    ctx: MutationCtx,
    guestId: Id<"guests">,
    occurredAt: number,
): Promise<void> {
    const guest = await ctx.db.get(guestId);
    if (!guest) return;

    await ctx.db.patch(guest._id, {
        openCount: guest.openCount + 1,
        emailOpenedAt: occurredAt,
        firstOpenedAt: guest.firstOpenedAt ?? occurredAt,
        updatedAt: Date.now(),
    });
}

/**
 * Ingestione di una consegna webhook Resend.
 *
 * L'ordine dei rami non è casuale. Su `email.opened` la riga durevole è scritta
 * **prima** del contatore derivato (stessa nota del legacy): se qualcosa fallisse
 * dopo l'append, il retry non incrementa due volte l'apertura, perché il contatore
 * è un valore derivato e la riga è la sorgente di verità.
 *
 * Un tipo non gestito non scrive nulla e non è un errore: Resend manda più eventi di
 * quanti ne interessino, e rispondere 200 a un evento che si ignora è il contratto.
 */
export const ingestWebhook = internalMutation({
    args: {
        svixId: v.string(),
        type: v.string(),
        emailId: v.string(),
        recipient: v.string(),
        occurredAt: v.optional(v.number()),
        clickedUrl: v.optional(v.string()),
        bounceSubType: v.optional(v.string()),
        payload: v.optional(v.any()),
    },
    handler: async (
        ctx,
        args,
    ): Promise<{ outcome: "duplicate" | "recorded" | "ignored"; eventType: string | null }> => {
        // 1. Idempotenza: la stessa consegna non scrive due volte. Il controllo e
        //    l'insert stanno nella stessa mutation, quindi due replay concorrenti
        //    serializzano: il secondo trova la riga.
        const seen = await ctx.db
            .query("emailEvents")
            .withIndex("by_svix_id", (q) => q.eq("svixId", args.svixId))
            .first();
        if (seen) return { outcome: "duplicate", eventType: seen.type };

        const recipient = normalizeEmail(args.recipient);
        const now = Date.now();
        const occurredAt = args.occurredAt ?? now;

        // 2. Contesto del messaggio: la riga seed scritta all'invio. È la stessa
        //    ricerca del legacy (`findSeedContext`), e la ragione per cui un evento
        //    webhook può dire "quale ospite ha aperto".
        const seed: Doc<"emailEvents"> | null = await ctx.db
            .query("emailEvents")
            .withIndex("by_message_id", (q) => q.eq("messageId", args.emailId))
            .first();

        const base = {
            messageId: args.emailId,
            recipient,
            svixId: args.svixId,
            payload: args.payload,
            occurredAt,
            createdAt: now,
            organizationId: seed?.organizationId,
            guestId: seed?.guestId,
            eventId: seed?.eventId,
            emailType: seed?.emailType,
        };

        const record = async (type: string, clickedUrl?: string): Promise<void> => {
            await ctx.db.insert("emailEvents", {
                ...base,
                type,
                ...(clickedUrl ? { clickedUrl } : {}),
            });
        };

        switch (args.type) {
            case "email.bounced": {
                // Il bounce è oggettivo e vale per qualsiasi mittente: la
                // soppressione non è org-scoped (schema `emailSuppressions`).
                const existing = await ctx.db
                    .query("emailSuppressions")
                    .withIndex("by_email", (q) => q.eq("email", recipient))
                    .first();

                if (!existing) {
                    await ctx.db.insert("emailSuppressions", {
                        email: recipient,
                        reason: "hard_bounce",
                        bounceSubtype: args.bounceSubType,
                        source: "resend_webhook",
                        createdAt: now,
                    });
                }

                await record("bounced");
                return { outcome: "recorded", eventType: "bounced" };
            }

            case "email.complained": {
                const existing = await ctx.db
                    .query("emailSuppressions")
                    .withIndex("by_email", (q) => q.eq("email", recipient))
                    .first();

                if (!existing) {
                    await ctx.db.insert("emailSuppressions", {
                        email: recipient,
                        reason: "complaint",
                        source: "resend_webhook",
                        createdAt: now,
                    });
                }

                await record("complained");
                return { outcome: "recorded", eventType: "complained" };
            }

            case "email.delivered":
            case "email.delivery_delayed":
            case "email.failed": {
                const type = args.type.replace("email.", "");
                await record(type);
                return { outcome: "recorded", eventType: type };
            }

            case "email.opened": {
                await record("opened");
                if (seed?.guestId) await recordGuestOpen(ctx, seed.guestId, occurredAt);
                return { outcome: "recorded", eventType: "opened" };
            }

            case "email.clicked": {
                await record("clicked", args.clickedUrl);
                return { outcome: "recorded", eventType: "clicked" };
            }

            default:
                return { outcome: "ignored", eventType: null };
        }
    },
});

/** Diagnostica: quante soppressioni sono attive e perché. */
export const suppressionStats = internalQuery({
    args: {},
    handler: async (ctx): Promise<{ total: number; byReason: Record<string, number> }> => {
        const rows = await ctx.db.query("emailSuppressions").collect();
        const byReason: Record<string, number> = {};

        for (const row of rows) {
            byReason[row.reason] = (byReason[row.reason] ?? 0) + 1;
        }

        return { total: rows.length, byReason };
    },
});
