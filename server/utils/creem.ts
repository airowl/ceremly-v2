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
        await unlockEvent(eventId, organizationId, data.order.id);
        await logAudit(null, "event.unlocked", {
            organizationId,
            targetType: "event",
            targetId: eventId,
            details: { provider: "creem", creemOrderId: data.order.id },
        });
    }
}

/** Estrae il creemOrderId da refund/dispute (order/checkout come oggetto o stringa). */
function extractCreemOrderId(data: FlatRefundCreated | FlatDisputeCreated): string | undefined {
    if (typeof data.order === "string") return data.order;
    if (data.order?.id) return data.order.id;
    if (data.checkout && typeof data.checkout !== "string") return data.checkout.order?.id;
    return undefined;
}

/**
 * Webhook refund.created / dispute.created — re-lock (SPEC §6.4).
 * Senza questo un evento rimborsato resterebbe sbloccato gratis.
 */
export async function handleRefundCreated(data: FlatRefundCreated | FlatDisputeCreated): Promise<void> {
    const creemOrderId = extractCreemOrderId(data);
    if (!creemOrderId) return;
    await relockEventByOrder(creemOrderId);
    await logAudit(null, "event.relocked", {
        targetType: "event",
        targetId: creemOrderId,
        details: { provider: "creem", event: data.webhookEventType, creemOrderId },
    });
}

export const setupCreem = () =>
    creem({
        apiKey: runtimeConfig.creemApiKey!,
        webhookSecret: runtimeConfig.creemWebhookSecret,
        testMode: runtimeConfig.public.appEnv !== "production",
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
