/**
 * Creem Payment Provider Configuration
 * Single payment provider for the application
 */
import { creem } from "@creem_io/better-auth";
import type {
    FlatCheckoutCompleted,
    FlatRefundCreated,
    FlatDisputeCreated,
} from "@creem_io/better-auth";
import { logAudit } from "./audit";
import { runtimeConfig } from "./runtimeConfig";
import type { CeremlyTier } from "~~/shared/constants/pricing";
import { unlockEvent, relockEventByOrder } from "../repositories/eventRepository";

/**
 * Mappa un product ID Creem al tier interno. Atelier è l'unico prodotto a
 * subscription ricorrente → unico mappato qui. Celebrazione è one-time
 * per-evento (sblocco gestito via metadata.eventId nel webhook, Fase 3) e NON
 * ha un tier-org. Ritorna null se il product ID è sconosciuto.
 */
export function getPlanFromProductId(productId: string): CeremlyTier | null {
    if (productId && productId === runtimeConfig.creemProductIdAtelier) return "atelier";
    return null;
}

/**
 * Webhook checkout.completed — sblocco one-time (SPEC §6.3).
 * PATTERN-DEPARTURE: i callback Creem sono SOLO-audit (persistSubscriptions fa il
 * resto). Per i one-time non c'è macchina del plugin che persista lo stato, quindi
 * lo sblocco DEVE avvenire qui. Idempotente via predicato tier='free' in unlockEvent.
 */
export async function handleCheckoutCompleted(data: FlatCheckoutCompleted): Promise<void> {
    await logAudit(null, "checkout.completed", {
        targetType: "creemCustomerId",
        targetId: data?.customer?.id,
        details: { provider: "creem", productId: data?.product?.id, productName: data?.product?.name },
    });

    const eventId = data.metadata?.eventId;
    const organizationId = data.metadata?.organizationId;
    if (
        data.order?.type === "onetime"
        && typeof eventId === "string"
        && typeof organizationId === "string"
        && data.order.id
    ) {
        try {
            await unlockEvent(eventId, organizationId, data.order.id);
            await logAudit(null, "event.unlocked", {
                organizationId,
                targetType: "event",
                targetId: eventId,
                details: { provider: "creem", creemOrderId: data.order.id },
            });
        } catch (err) {
            console.error("[creem] checkout unlock error", err);
        }
    }
}

/** Estrae il creemOrderId e creemCheckoutId da refund/dispute. */
function extractCreemIds(data: FlatRefundCreated | FlatDisputeCreated): { orderId?: string; checkoutId?: string } {
    const orderId = typeof data.order === "string"
        ? data.order
        : data.order?.id ?? (typeof data.checkout !== "string" ? data.checkout?.order?.id : undefined);
    const checkoutId = typeof data.checkout === "string" ? data.checkout : data.checkout?.id;
    return { orderId, checkoutId };
}

/**
 * Webhook refund.created / dispute.created — re-lock (SPEC §6.4).
 * Gestisce anche il caso refund-arrivato-prima-del-checkout: se non trova
 * l'evento per orderId, prova con checkoutId (persistito alla creazione checkout).
 * Senza questo un evento rimborsato resterebbe sbloccato gratis.
 */
export async function handleRefundCreated(data: FlatRefundCreated | FlatDisputeCreated): Promise<void> {
    const { orderId, checkoutId } = extractCreemIds(data);
    if (!orderId && !checkoutId) return;
    try {
        await relockEventByOrder(orderId, checkoutId);
        await logAudit(null, "event.relocked", {
            targetType: "event",
            targetId: orderId ?? checkoutId,
            details: { provider: "creem", event: data.webhookEventType, creemOrderId: orderId, creemCheckoutId: checkoutId },
        });
    } catch (err) {
        console.error("[creem] refund relock error", err);
    }
}

export const setupCreem = () =>
    creem({
        apiKey: runtimeConfig.creemApiKey!,
        webhookSecret: runtimeConfig.creemWebhookSecret,
        testMode: !runtimeConfig.public.isProdDeployment,
        defaultSuccessUrl: "/dashboard/subscription?success=true",
        persistSubscriptions: true,

        onGrantAccess: async ({ reason, product, customer, metadata }) => {
            const plan = getPlanFromProductId(product?.id || "");
            await logAudit(null, "subscription.created", {
                userId: metadata?.referenceId as string | undefined,
                targetType: "creemCustomerId",
                targetId: customer?.id,
                details: {
                    provider: "creem",
                    reason,
                    plan,
                    productId: product?.id,
                },
            });
        },

        onRevokeAccess: async ({ reason, product, customer, metadata }) => {
            const plan = getPlanFromProductId(product?.id || "");
            await logAudit(null, "subscription.canceled", {
                userId: metadata?.referenceId as string | undefined,
                targetType: "creemCustomerId",
                targetId: customer?.id,
                details: {
                    provider: "creem",
                    reason,
                    plan,
                    productId: product?.id,
                },
            });
        },

        onCheckoutCompleted: handleCheckoutCompleted,
        onRefundCreated: handleRefundCreated,
        onDisputeCreated: handleRefundCreated,

        onSubscriptionActive: async (data) => {
            await logAudit(null, "subscription.updated", {
                targetType: "creemCustomerId",
                targetId: data?.customer?.id,
                status: "success",
                details: {
                    provider: "creem",
                    event: "subscription_active",
                },
            });
        },

        onSubscriptionCanceled: async (data) => {
            await logAudit(null, "subscription.canceled", {
                targetType: "creemCustomerId",
                targetId: data?.customer?.id,
                details: {
                    provider: "creem",
                    event: "subscription_canceled",
                },
            });
        },

        onSubscriptionPaid: async (data) => {
            await logAudit(null, "subscription.updated", {
                targetType: "creemCustomerId",
                targetId: data?.customer?.id,
                status: "success",
                details: {
                    provider: "creem",
                    event: "subscription_paid",
                },
            });
        },
    });
