/**
 * Reconciliation service for one-time Celebrazione payments (SPEC §6.2 / fix 7.2).
 *
 * The webhook `onCheckoutCompleted` is fire-and-forget (always returns 200) and
 * swallows errors. If `unlockEvent` fails, Creem never retries — a paid event
 * stays `tier='free'` forever. This service is the recovery path.
 *
 * Strategy (fix 7.2 — replaces the dead searchTransactions approach):
 *   At checkout creation the `checkoutId` is persisted on the event row (via
 *   `setEventCheckoutId` in checkout.service.ts). Recovery reads that id and
 *   calls `retrieveCheckout(checkoutId)` on the RAW Creem client.
 *   `CheckoutEntity` DOES return `metadata` + `order.type` / `order.status`,
 *   unlike `searchTransactions` which strips metadata at the Zod SDK boundary.
 *
 * This function is designed to be safe to call at any time:
 *   - If the event doesn't exist / doesn't belong to the org → no-op.
 *   - If tier is already 'celebration' → no API call (idempotent).
 *   - If checkoutId was never persisted → no-op.
 *   - If the Creem API throws → console.error + return false (never throws out).
 */
import { createCreemClient } from "@creem_io/better-auth/server";
import { runtimeConfig } from "../utils/runtimeConfig";
import { getEventCheckoutInfo, unlockEvent } from "../repositories/eventRepository";

export async function reconcileEventUnlock(
    eventId: string,
    organizationId: string,
): Promise<{ reconciled: boolean }> {
    // Step 1: read the event's tier + stored checkoutId.
    const info = await getEventCheckoutInfo(eventId, organizationId);

    // No row → event not found or not in this org.
    if (!info) return { reconciled: false };

    // Already unlocked → nothing to do (idempotent).
    if (info.tier === "celebration") return { reconciled: false };

    // No checkoutId persisted → can't reconcile without the authoritative id.
    if (!info.creemCheckoutId) return { reconciled: false };

    try {
        const apiKey = runtimeConfig.creemApiKey!;
        const creem = createCreemClient({
            apiKey,
            testMode: runtimeConfig.public.appEnv !== "production",
        });

        const checkout = await creem.retrieveCheckout({
            checkoutId: info.creemCheckoutId,
            xApiKey: apiKey,
        });

        const order = checkout.order;

        // Only unlock on paid one-time orders with matching metadata.eventId AND organizationId.
        // The org check prevents a corrupted/foreign checkoutId from driving an unlock
        // when metadata.organizationId doesn't match the scoped org.
        if (
            order?.type === "onetime" &&
            order.status === "paid" &&
            checkout.metadata?.eventId === eventId &&
            checkout.metadata?.organizationId === organizationId &&
            order.id
        ) {
            await unlockEvent(eventId, organizationId, order.id);
            return { reconciled: true };
        }

        return { reconciled: false };
    } catch (err) {
        console.error(
            `[reconcile] retrieveCheckout failed for eventId=${eventId} checkoutId=${info.creemCheckoutId}`,
            err,
        );
        return { reconciled: false };
    }
}
