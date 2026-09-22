"use node";

import { v, type Infer } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { renderEmail, resolveBrand, type EmailRequest } from "./emailTemplates";
import { requireEnv, siteUrl } from "./lib/env";

/**
 * Consegna email (plan Task 13, Step 3) — il lato Node.
 *
 * Il rendering React Email richiede Node, e una funzione `"use node"` può
 * esportare **solo action**: per questo lo stato (soppressioni, righe seed,
 * webhook) vive in `convex/emailEvents.ts` e le mutation sono di là. La divisione
 * è imposta dal runtime, non è una preferenza.
 *
 * Tre regole che il legacy aveva e che qui sono esplicite:
 *
 * 1. **La soppressione si controlla prima di tutto.** Un hard bounce o una
 *    complaint sono oggettivi: continuare a scrivere a quell'indirizzo brucia la
 *    reputazione del dominio, e un template renderizzato per essere scartato è
 *    lavoro sprecato. Il rifiuto è un audit `email.failed`, non un silenzio.
 * 2. **Il `from` dipende dal contesto.** Le email correlate a un evento escono dal
 *    sottodominio tracciato (open+click ON), le transazionali dal mittente
 *    principale (tracking OFF): è la stessa separazione del legacy, e serve a non
 *    inquinare le metriche di consegna dei messaggi transazionali.
 * 3. **Nessun segreto nello stato del job.** La chiave Resend è letta qui e non
 *    esce da questa funzione: `jobExecutions` registra solo l'id del provider o un
 *    errore sanitizzato (vedi `convex/jobs.ts`).
 *
 * Il contratto delle richieste è validato al confine con `v.*`, non solo in
 * TypeScript: un job che costruisce male una richiesta deve fallire con un errore
 * di validazione leggibile, non inviare un'email vuota.
 */

const language = v.optional(v.union(v.literal("it"), v.literal("en")));

/**
 * L'unione delle richieste, speculare a `EmailRequest` in `convex/emailTemplates`.
 *
 * `props` libere non esistono apposta: ogni template dichiara i campi che usa, e
 * `event-cleanup-warning` non può ricevere per sbaglio il payload di un invito.
 */
export const emailRequest = v.union(
    v.object({
        template: v.literal("verification"),
        to: v.string(),
        language,
        verificationUrl: v.string(),
        userName: v.optional(v.string()),
    }),
    v.object({
        template: v.literal("reset-password"),
        to: v.string(),
        language,
        resetUrl: v.string(),
        userName: v.optional(v.string()),
    }),
    v.object({
        template: v.literal("change-email"),
        to: v.string(),
        language,
        confirmUrl: v.string(),
        newEmail: v.string(),
        userName: v.optional(v.string()),
    }),
    v.object({ template: v.literal("waiting-list"), to: v.string(), language }),
    v.object({
        template: v.literal("org-invite"),
        to: v.string(),
        language,
        inviteUrl: v.string(),
        orgName: v.string(),
        invitedByName: v.string(),
        expiresInDays: v.optional(v.number()),
    }),
    v.object({
        template: v.literal("guest-invite"),
        to: v.string(),
        subject: v.string(),
        eventTitle: v.string(),
        firstName: v.string(),
        message: v.string(),
        ctaUrl: v.string(),
        pixelUrl: v.string(),
    }),
    v.object({
        template: v.literal("guest-reminder"),
        to: v.string(),
        subject: v.string(),
        eventTitle: v.string(),
        firstName: v.string(),
        message: v.string(),
        ctaUrl: v.string(),
        pixelUrl: v.string(),
    }),
    v.object({
        template: v.literal("event-cleanup-warning"),
        to: v.string(),
        language,
        eventTitle: v.string(),
        dashboardUrl: v.string(),
        daysLeft: v.number(),
    }),
    v.object({
        template: v.literal("contact-confirmation"),
        to: v.string(),
        language,
        userName: v.string(),
        subject: v.string(),
    }),
    v.object({
        template: v.literal("contact-notification"),
        to: v.string(),
        senderName: v.string(),
        senderEmail: v.string(),
        subject: v.string(),
        message: v.string(),
        language: v.string(),
        /**
         * Istante di invio in millisecondi, **non** una stringa formattata.
         *
         * Il legacy formattava la data nel servizio con `toLocaleString('it-IT', …)`,
         * cioè con i dati ICU del runtime che esegue. Qui la formattazione avviene in
         * questa action Node — dove quel locale esiste davvero — invece che in una
         * mutation V8, il cui supporto delle locale non è ciò su cui si vuole
         * dipendere per il contenuto di un'email.
         */
        submittedAtMs: v.number(),
    }),
);

export type EmailRequestDocument = Infer<typeof emailRequest>;

const emailContext = v.optional(
    v.object({
        organizationId: v.optional(v.id("organizations")),
        guestId: v.optional(v.id("guests")),
        eventId: v.optional(v.id("events")),
    }),
);

/** Massimo estratto del corpo d'errore del provider che entra nello stato del job. */
const MAX_PROVIDER_ERROR_CHARS = 300;

/** Il provider risponde con JSON, ma un guasto di rete può rispondere HTML. */
function sanitizeProviderError(status: number, body: string): string {
    const compact = body.replace(/\s+/g, " ").trim().slice(0, MAX_PROVIDER_ERROR_CHARS);
    return `RESEND_${status}${compact ? `: ${compact}` : ""}`;
}

function brand() {
    return resolveBrand({
        appName: process.env.APP_NAME ?? "Ceremly",
        siteUrl: siteUrl(),
    });
}

/** Mittente: sottodominio eventi se l'email è correlata a un evento. */
function senderFor(eventScoped: boolean): string {
    const fallback = requireEnv("EMAIL_FROM");
    if (!eventScoped) return fallback;
    return process.env.EVENTS_EMAIL_FROM ?? fallback;
}

/**
 * Traduce la richiesta validata in quella del renderer.
 *
 * Esiste per un solo campo, `submittedAtMs`: la formattazione della data con il
 * locale del destinatario è un'operazione da Node, e farla qui è meglio che chiedere
 * a una mutation V8 di indovinare il formato. Tutto il resto passa invariato, e un
 * template nuovo senza bisogno di traduzione non tocca questa funzione.
 */
function toRenderableRequest(request: EmailRequestDocument): EmailRequest {
    if (request.template !== "contact-notification") {
        return request as EmailRequest;
    }

    const { submittedAtMs, ...rest } = request;
    return {
        ...rest,
        submittedAt: new Date(submittedAtMs).toLocaleString(
            rest.language === "it" ? "it-IT" : "en-GB",
            { dateStyle: "full", timeStyle: "short" },
        ),
    };
}

export const sendTemplate = internalAction({
    args: {
        request: emailRequest,
        /** Vero per le email dentro il flusso di un evento (inviti, reminder). */
        eventScoped: v.optional(v.boolean()),
        replyTo: v.optional(v.string()),
        /** Chiave Resend: rende sicuro il retry dello stesso invio (24 ore). */
        idempotencyKey: v.optional(v.string()),
        context: emailContext,
    },
    handler: async (
        ctx,
        args,
    ): Promise<{ sent: boolean; messageId: string | null; reason?: string }> => {
        const context = args.context ?? {};

        // 1. Soppressione. Globale per indirizzo: un bounce vale per ogni mittente.
        const suppressed: boolean = await ctx.runQuery(internal.emailEvents.isSuppressed, {
            email: args.request.to,
        });
        if (suppressed) {
            await ctx.runMutation(internal.emailEvents.recordSuppressed, {
                recipient: args.request.to,
                emailType: args.request.template,
                organizationId: context.organizationId,
            });
            return { sent: false, messageId: null, reason: "suppressed" };
        }

        // 2. Rendering. Il brand arriva dalla deployment, il contenuto dalla richiesta.
        const request = toRenderableRequest(args.request);
        const rendered = await renderEmail(request, brand());

        // 3. Consegna.
        const apiKey = requireEnv("RESEND_API_KEY");
        const scoped = args.eventScoped ?? Boolean(context.eventId);

        const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                ...(args.idempotencyKey ? { "Idempotency-Key": args.idempotencyKey } : {}),
            },
            body: JSON.stringify({
                from: senderFor(scoped),
                to: [args.request.to],
                subject: rendered.subject,
                html: rendered.html,
                text: rendered.text,
                ...(args.replyTo ? { reply_to: args.replyTo } : {}),
            }),
        });

        if (!response.ok) {
            // L'errore del provider è sanitizzato qui, una volta sola: chi lo legge
            // (lo stato del job, i log) non deve poter contenere HTML arbitrario.
            throw new Error(sanitizeProviderError(response.status, await response.text()));
        }

        const result = (await response.json()) as { id?: string };
        const messageId = result.id ?? null;

        // 4. Stato. La riga seed (per correlare i webhook a ospite/evento) esiste solo
        //    con un contesto; l'audit `email.sent` c'è sempre.
        if (messageId) {
            await ctx.runMutation(internal.emailEvents.recordSent, {
                messageId,
                recipient: args.request.to,
                emailType: args.request.template,
                organizationId: context.organizationId,
                guestId: context.guestId,
                eventId: context.eventId,
            });
        }

        return { sent: true, messageId };
    },
});
