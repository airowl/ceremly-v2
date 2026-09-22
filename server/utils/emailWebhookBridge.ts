import type { EventHandlerRequest, H3Event } from "~~/server/types/h3";
import { runtimeConfig } from "./runtimeConfig";

/**
 * Ponte temporaneo del webhook Resend verso Convex (plan Task 13, Step 3).
 *
 * Il piano lo dice esplicitamente: durante il rehearsal il dashboard Resend continua
 * a puntare all'URL pubblico del Worker, e questa route si limita a **inoltare** i
 * byte ricevuti. Nessuna logica di business: la verifica della firma, la
 * soppressione, la riga append-only e i contatori vivono in Convex
 * (`convex/http.ts` → `internal.emailEvents.ingestWebhook`), che è anche l'unico
 * posto che possiede `RESEND_WEBHOOK_SECRET`.
 *
 * Perché l'inoltro è **byte-for-byte**: la firma Svix copre esattamente
 * `svix-id.svix-timestamp.body`. Un JSON ri-serializzato cambia spazi e ordine delle
 * chiavi, quindi un ponte che parsa e ripubblica renderebbe ogni webhook una firma
 * non valida. Le intestazioni `svix-*` viaggiano con il corpo per la stessa ragione.
 *
 * Al cutover (Task 17) il dashboard punta direttamente al Convex site URL e questo
 * file non serve più.
 */

/** Come per gli altri backend, il default è il legacy e il cutover lo cambia. */
export function isConvexEmailBackend(): boolean {
    return runtimeConfig.emailBackend === "convex";
}

const SVIX_HEADERS = ["svix-id", "svix-timestamp", "svix-signature"] as const;

/** Un Convex che non risponde non deve tenere aperta la richiesta di Resend. */
const FORWARD_TIMEOUT_MS = 10_000;

export async function forwardResendWebhookToConvex(
    event: H3Event<EventHandlerRequest>,
): Promise<Record<string, unknown>> {
    const siteUrl = String(runtimeConfig.public.convexSiteUrl ?? "").replace(/\/+$/, "");
    if (!siteUrl) {
        throw createError({
            statusCode: 503,
            statusMessage: "Convex site URL non configurato",
            data: { code: "EMAIL_BACKEND_NOT_CONFIGURED" },
        });
    }

    // `readRawBody` e non `readBody`: il corpo firmato è quello grezzo.
    const body = await readRawBody(event);
    if (!body) {
        throw createError({ statusCode: 400, statusMessage: "Empty body" });
    }

    const headers: Record<string, string> = { "content-type": "application/json" };
    for (const name of SVIX_HEADERS) {
        const value = getHeader(event, name);
        if (value) headers[name] = value;
    }

    let response: Response;
    try {
        response = await fetch(`${siteUrl}/resend/events`, {
            method: "POST",
            headers,
            body,
            signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
        });
    } catch (error) {
        const reason = error instanceof Error ? error.name : "unknown";
        throw createError({
            statusCode: 503,
            statusMessage: "Backend email non raggiungibile",
            data: { code: "EMAIL_BACKEND_UNREACHABLE", reason },
        });
    }

    const text = await response.text();
    let parsed: Record<string, unknown> = {};
    try {
        const value = JSON.parse(text) as unknown;
        if (value && typeof value === "object" && !Array.isArray(value)) {
            parsed = value as Record<string, unknown>;
        }
    } catch {
        // Una risposta non JSON è comunque una risposta: lo stato HTTP è la verità.
    }

    if (!response.ok) {
        // Lo stato viaggia così com'è: un 401 (firma) e un 500 (ingestione fallita)
        // hanno conseguenze diverse sul lato Resend — il primo è un errore di
        // configurazione, il secondo è un retry da fare.
        throw createError({
            statusCode: response.status,
            statusMessage:
                typeof parsed.message === "string" ? parsed.message : "Webhook rifiutato",
            data: { code: typeof parsed.code === "string" ? parsed.code : "RESEND_WEBHOOK_REFUSED" },
        });
    }

    return parsed;
}
