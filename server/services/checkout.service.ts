/**
 * Celebration Checkout (one-time per-event) — SPEC §6.2.
 * Created SERVER-SIDE so that eventId/organizationId are bound in the metadata and
 * ownership is verified BEFORE emitting the checkout. Unlocking happens in the
 * webhook checkout.completed (server/utils/creem.ts), not here.
 *
 * Fix 7.2: uses the RAW Creem client (createCreemClient → creem.createCheckout) to
 * obtain the full CheckoutEntity with `checkout.id`. The checkoutId is persisted
 * via setEventCheckoutId for recovery via reconcileEventUnlock.
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
        testMode: !runtimeConfig.public.isProdDeployment,
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
        throw createError({ statusCode: 502, statusMessage: "Creem checkout senza URL" });
    }

    // Persist the checkoutId for recovery via reconcileEventUnlock.
    // NOT swallowed: if persistence fails the checkout is rejected (500) and
    // the user retries. An untracked Creem checkout that is subsequently paid is
    // unrecoverable; a checkout created but never paid (because the flow stops
    // here) is however harmless — Creem never charges an incomplete checkout.
    await setEventCheckoutId(eventId, organizationId, checkout.id);

    return { url: checkout.checkoutUrl };
}
