/**
 * Checkout Celebrazione (one-time per-evento) — SPEC §6.2.
 * Creato SERVER-SIDE così eventId/organizationId sono legati nel metadata e
 * l'ownership è verificata PRIMA di emettere il checkout. Lo sblocco avviene nel
 * webhook checkout.completed (server/utils/creem.ts), non qui.
 *
 * Fix 7.2: usa il client RAW Creem (createCreemClient → creem.createCheckout) per
 * ottenere l'intero CheckoutEntity con `checkout.id`. Il checkoutId viene persistito
 * via setEventCheckoutId per la recovery via reconcileEventUnlock.
 */
import { createCreemClient } from "@creem_io/better-auth/server";
import type { H3Event, EventHandlerRequest } from "~~/server/types/h3";
import { runtimeConfig } from "../utils/runtimeConfig";
import { findEventByIdScoped, setEventCheckoutId } from "../repositories/eventRepository";
import { assertOwnership } from "../utils/permissions";
import { isOrgAtelier } from "./eventAccess.service";

function getOrgId(event: H3Event<EventHandlerRequest>): string {
    const orgId = event.context.organization?.id;
    if (!orgId) {
        throw createError({ statusCode: 401, statusMessage: "Organizzazione attiva non risolta" });
    }
    return orgId;
}

export async function createCelebrationCheckout(
    event: H3Event<EventHandlerRequest>,
    eventId: string,
): Promise<{ url: string }> {
    const organizationId = getOrgId(event);

    const rawRow = await findEventByIdScoped(organizationId, eventId);
    const row = assertOwnership(rawRow, organizationId);

    if (await isOrgAtelier(organizationId)) {
        throw createError({ statusCode: 409, statusMessage: "L'organizzazione Atelier ha già eventi illimitati" });
    }
    if (row.tier === "celebration") {
        throw createError({ statusCode: 409, statusMessage: "Evento già sbloccato" });
    }

    const productId = runtimeConfig.creemProductIdCelebration;
    if (!productId) {
        throw createError({ statusCode: 500, statusMessage: "Prodotto Celebrazione non configurato" });
    }

    const apiKey = runtimeConfig.creemApiKey!;
    const baseUrl = runtimeConfig.public.baseURL;

    const creem = createCreemClient({
        apiKey,
        testMode: runtimeConfig.public.appEnv !== "production",
    });

    const checkout = await creem.createCheckout({
        xApiKey: apiKey,
        createCheckoutRequest: {
            productId,
            customer: { email: event.context.user?.email },
            metadata: { eventId, organizationId },
            successUrl: `${baseUrl}/dashboard/events/${eventId}?unlocked=true`,
        },
    });

    if (!checkout.checkoutUrl) {
        throw createError({ statusCode: 500, statusMessage: "Checkout URL non disponibile dalla risposta Creem" });
    }

    // Persisti il checkoutId per la recovery via reconcileEventUnlock.
    // Fire-and-forget idempotente: un eventuale errore qui non blocca il checkout.
    await setEventCheckoutId(eventId, organizationId, checkout.id).catch((err) => {
        console.error(`[checkout] setEventCheckoutId failed for eventId=${eventId}`, err);
    });

    return { url: checkout.checkoutUrl };
}
