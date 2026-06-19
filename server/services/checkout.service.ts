/**
 * Checkout Celebrazione (one-time per-evento) — SPEC §6.2.
 * Creato SERVER-SIDE così eventId/organizationId sono legati nel metadata e
 * l'ownership è verificata PRIMA di emettere il checkout. Lo sblocco avviene nel
 * webhook checkout.completed (server/utils/creem.ts), non qui.
 */
import { createCheckout } from "@creem_io/better-auth/server";
import type { H3Event, EventHandlerRequest } from "~~/server/types/h3";
import { runtimeConfig } from "../utils/runtimeConfig";
import { findEventByIdScoped } from "../repositories/eventRepository";
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

    const row = await findEventByIdScoped(organizationId, eventId);
    assertOwnership(row, organizationId);

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

    const baseUrl = runtimeConfig.public.baseURL;
    const { url } = await createCheckout(
        { apiKey: runtimeConfig.creemApiKey!, testMode: runtimeConfig.public.appEnv !== "production" },
        {
            productId,
            customer: { email: event.context.user?.email },
            metadata: { eventId, organizationId },
            successUrl: `${baseUrl}/dashboard/events/${eventId}?unlocked=true`,
        },
    );
    return { url };
}
