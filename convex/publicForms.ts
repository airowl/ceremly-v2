import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { assertRateLimit } from "./lib/rateLimit";
import { isDisposableEmail, isHoneypotTriggered, isSubmittedTooFast } from "./lib/spam";

/**
 * Form pubblici (plan Task 12, Step 3) — contatto e waiting list.
 *
 * Sono `internalMutation`: non esiste un percorso in cui il browser le chiami
 * direttamente. L'unico chiamante è la HTTP action in `convex/http.ts`, che
 * accetta solo una richiesta firmata dal Worker — e il Worker è l'unico che vede
 * l'IP reale del client. Il payload che arriva qui contiene `ipHash`, un digest
 * HMAC: Convex non può risalire all'indirizzo, ma il rate limit per-IP funziona.
 *
 * Il legacy faceva il contrario: la route Nuxt leggeva l'IP dagli header della
 * request e applicava le regole nel servizio, sul runtime che risponde al
 * pubblico. Qui le regole vivono accanto alla scrittura, quindi non esiste un
 * percorso che scriva saltandole.
 *
 * **Honeypot e timing rispondono con un finto successo.** È deliberato e viene
 * dal legacy: dire a un bot "ti ho riconosciuto" gli insegna a correggersi. Il
 * rate limit invece è un errore esplicito (`RATE_LIMITED`), perché a quel punto
 * il chiamante non sta più fingendo di essere un browser.
 */

/** Messaggi per lingua: il form risponde all'utente nella lingua del sito. */
const messages = {
    rateLimited: {
        it: "Troppe richieste. Riprova più tardi.",
        en: "Too many requests. Please try again later.",
    },
    dailyLimit: {
        it: "Hai raggiunto il limite massimo di messaggi giornalieri. Riprova domani.",
        en: "You have reached the maximum daily message limit. Please try again tomorrow.",
    },
    disposable: {
        it: "Usa un indirizzo email permanente.",
        en: "Please use a permanent email address.",
    },
} as const;

const pick = (language: string, value: { it: string; en: string }): string =>
    language === "it" ? value.it : value.en;

/** Massimo 3 messaggi per indirizzo in 24h (legacy `MAX_MESSAGES_PER_DAY`). */
const MAX_CONTACT_MESSAGES_PER_DAY = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const languageArg = v.optional(v.string());

export const contact = internalMutation({
    args: {
        name: v.string(),
        email: v.string(),
        subject: v.string(),
        message: v.string(),
        language: languageArg,
        website: v.optional(v.string()),
        _t: v.optional(v.number()),
        /** Digest HMAC dell'IP del client, calcolato dal Worker. */
        ipHash: v.string(),
        /** Id della request edge, per correlare i log del Worker e di Convex. */
        edgeRequestId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const language = args.language === "en" ? "en" : "it";
        const email = args.email.trim().toLowerCase();
        const now = Date.now();

        // 1-2. Bot riconosciuti: finto successo, nessuna scrittura, nessun oracolo.
        //    Nessuna email parte: il finto successo è nella risposta, non negli effetti.
        if (isHoneypotTriggered(args.website) || isSubmittedTooFast(args._t, now)) {
            return { success: true, message: "Contact form submitted successfully", stored: false };
        }

        // 3. Rate limit per-IP: il limite per-email sotto è aggirabile variando
        //    l'indirizzo, quindi senza questo l'email-bombing dell'inbox admin (e il
        //    consumo di quota Resend) sarebbe illimitato.
        try {
            await assertRateLimit(ctx, { bucket: "contact", key: `ip:${args.ipHash}` });
        } catch (error) {
            if (isRateLimited(error)) {
                throw new ConvexError({
                    code: "RATE_LIMITED",
                    status: 429,
                    message: pick(language, messages.rateLimited),
                });
            }
            throw error;
        }

        // 4. Email usa-e-getta.
        if (isDisposableEmail(email)) {
            throw new ConvexError({
                code: "DISPOSABLE_EMAIL",
                status: 400,
                message: pick(language, messages.disposable),
            });
        }

        // 5. Tetto per indirizzo nelle ultime 24h (non solo "oggi solare": il
        //    legacy contava la finestra mobile di 24h, e una finestra mobile è
        //    quella giusta per un limite anti-abuso).
        const recent = await ctx.db
            .query("contactMessages")
            .withIndex("by_email", (q) => q.eq("email", email))
            .collect();
        const inWindow = recent.filter((row) => row.createdAt >= now - DAY_MS).length;

        if (inWindow >= MAX_CONTACT_MESSAGES_PER_DAY) {
            throw new ConvexError({
                code: "CONTACT_DAILY_LIMIT",
                status: 429,
                message: pick(language, messages.dailyLimit),
            });
        }

        const messageId = await ctx.db.insert("contactMessages", {
            name: args.name.trim(),
            email,
            subject: args.subject.trim(),
            message: args.message.trim(),
            language,
            isArchived: false,
            createdAt: now,
        });

        await writeAudit(ctx, {
            action: "contact.sent",
            targetType: "contact",
            targetId: messageId,
            details: {
                email,
                subject: args.subject.trim(),
                ...(args.edgeRequestId ? { edgeRequestId: args.edgeRequestId } : {}),
            },
        });

        // Task 13: le due email del form contatti. Sono action schedulate (non job) e
        // non attese: una mutation non può invocare un'action, e bloccare la risposta
        // del form sull'invio Resend è ciò che il legacy faceva e che qui si evita.
        // Conseguenza dichiarata: la risposta dice "messaggio ricevuto", e la
        // consegna vive nell'audit `email.sent`/`email.failed` — non in un `true`
        // che nessuno ha verificato.
        await ctx.scheduler.runAfter(0, internal.email.sendTemplate, {
            request: {
                template: "contact-confirmation",
                to: email,
                language,
                userName: args.name.trim(),
                subject: args.subject.trim(),
            },
        });

        // Destinatario della notifica admin: nessun fallback inventato. Se la env
        // manca la notifica si salta con un log rumoroso (il messaggio è persistito),
        // invece di spedire a un placeholder `example.com`.
        const adminEmail = process.env.CONTACT_ADMIN_EMAIL ?? "";
        if (adminEmail) {
            await ctx.scheduler.runAfter(0, internal.email.sendTemplate, {
                request: {
                    template: "contact-notification",
                    to: adminEmail,
                    senderName: args.name.trim(),
                    senderEmail: email,
                    subject: args.subject.trim(),
                    message: args.message.trim(),
                    language,
                    submittedAtMs: now,
                },
                // Rispondere alla notifica risponde a chi ha scritto.
                replyTo: email,
            });
        } else {
            console.error(
                "[publicForms] CONTACT_ADMIN_EMAIL non configurata: notifica admin saltata (messaggio comunque salvato)",
            );
        }

        return { success: true, message: "Contact form submitted successfully", stored: true };
    },
});

export const waitingList = internalMutation({
    args: {
        email: v.string(),
        language: v.string(),
        website: v.optional(v.string()),
        _t: v.optional(v.number()),
        source: v.optional(v.string()),
        utmSource: v.optional(v.string()),
        utmMedium: v.optional(v.string()),
        utmCampaign: v.optional(v.string()),
        ipHash: v.string(),
        userAgent: v.optional(v.string()),
        edgeRequestId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const email = args.email.trim().toLowerCase();

        // Finto successo per i bot: `emailSent: true` è parte del finto successo, come
        // nel legacy. Un bot non deve poter dedurre la detection dal corpo della
        // risposta, e l'unico modo di non dirlo è rispondere esattamente come a un
        // iscritto vero. Gli effetti restano zero (nessuna riga, nessuna email).
        if (isHoneypotTriggered(args.website) || isSubmittedTooFast(args._t, now)) {
            return { success: true, alreadySubscribed: false, emailSent: true, stored: false };
        }

        try {
            await assertRateLimit(ctx, { bucket: "waitingList", key: `ip:${args.ipHash}` });
        } catch (error) {
            if (isRateLimited(error)) {
                throw new ConvexError({
                    code: "RATE_LIMITED",
                    status: 429,
                    message: pick(args.language, messages.rateLimited),
                });
            }
            throw error;
        }

        if (isDisposableEmail(email)) {
            throw new ConvexError({
                code: "DISPOSABLE_EMAIL",
                status: 400,
                message: pick(args.language, messages.disposable),
            });
        }

        // Dedup sull'indirizzo: la seconda iscrizione è un successo idempotente, non
        // un errore. Nel legacy la corsa fra due richieste concorrenti finiva nel
        // ramo `23505` della route; qui la mutation è serializzabile, quindi due
        // richieste dello stesso indirizzo non possono inserire due righe.
        const existing = await ctx.db
            .query("waitingList")
            .withIndex("by_email", (q) => q.eq("email", email))
            .first();

        if (existing) {
            return { success: true, alreadySubscribed: true, emailSent: false, stored: false };
        }

        await ctx.db.insert("waitingList", {
            email,
            language: args.language,
            createdAt: now,
            ...(args.source ? { source: args.source } : {}),
            ...(args.utmSource ? { utmSource: args.utmSource } : {}),
            ...(args.utmMedium ? { utmMedium: args.utmMedium } : {}),
            ...(args.utmCampaign ? { utmCampaign: args.utmCampaign } : {}),
            // Digest, non indirizzo: per le righe scritte dopo il Task 12 questo
            // campo contiene l'hash HMAC calcolato dal Worker (vedi `lib/spam.ts`).
            ipAddress: args.ipHash,
            ...(args.userAgent ? { userAgent: args.userAgent } : {}),
        });

        await writeAudit(ctx, {
            action: "waiting_list.subscribed",
            targetType: "waiting_list",
            targetId: email,
            details: {
                email,
                source: args.source ?? null,
                ...(args.edgeRequestId ? { edgeRequestId: args.edgeRequestId } : {}),
            },
        });

        // Task 13: l'email di benvenuto è schedidata nella stessa transazione della
        // scrittura, quindi `emailSent: true` significa "consegnata al percorso di
        // invio", non "il provider ha risposto 200". Il legacy la attendeva e poteva
        // riportare l'esito; qui il vantaggio è che un fallimento diventa un audit
        // `email.failed` con retry, invece di un booleano che nessuno guarda.
        await ctx.scheduler.runAfter(0, internal.email.sendTemplate, {
            request: {
                template: "waiting-list",
                to: email,
                // Normalizzata, non passata com'è: il contratto del renderer accetta
                // `it` | `en`, e un locale inatteso (`"fr"`) deve ricadere su una
                // lingua che esiste invece di far fallire la validazione dell'action.
                language: args.language === "en" ? "en" : "it",
            },
        });

        return { success: true, alreadySubscribed: false, emailSent: true, stored: true };
    },
});

const isRateLimited = (error: unknown): boolean =>
    error instanceof ConvexError &&
    typeof error.data === "object" &&
    error.data !== null &&
    (error.data as { code?: unknown }).code === "RATE_LIMITED";

/** Conteggio per diagnostica: quanti iscritti ha la waiting list. */
export const waitingListCount = internalMutation({
    args: {},
    handler: async (ctx): Promise<{ total: number }> => {
        const rows: Doc<"waitingList">[] = await ctx.db.query("waitingList").collect();
        return { total: rows.length };
    },
});
