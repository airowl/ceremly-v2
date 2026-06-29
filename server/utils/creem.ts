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
 * Maps a Creem product ID to the internal tier. Atelier is the only recurring
 * subscription product → the only one mapped here. Celebration is one-time
 * per-event (unlock handled via metadata.eventId in the webhook, Phase 3) and does NOT
 * have an org-tier. Returns null if the product ID is unknown.
 */
export function getPlanFromProductId(productId: string): CeremlyTier | null {
    if (productId && productId === runtimeConfig.creemProductIdAtelier) return "atelier";
    return null;
}

/**
 * Webhook checkout.completed — one-time unlock (SPEC §6.3).
 * PATTERN-DEPARTURE: Creem callbacks are AUDIT-ONLY (persistSubscriptions does
 * the rest). For one-time purchases there is no plugin state machine, so the
 * unlock MUST happen here. Idempotent via the tier='free' predicate in unlockEvent.
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

/** Extracts the creemOrderId from a refund/dispute (order/checkout as object or string). */
function extractCreemOrderId(data: FlatRefundCreated | FlatDisputeCreated): string | undefined {
    if (typeof data.order === "string") return data.order;
    if (data.order?.id) return data.order.id;
    if (data.checkout && typeof data.checkout !== "string") return data.checkout.order?.id;
    return undefined;
}

/**
 * Webhook refund.created / dispute.created — re-lock (SPEC §6.4).
 * Without this, a refunded event would remain unlocked for free.
 */
export async function handleRefundCreated(data: FlatRefundCreated | FlatDisputeCreated): Promise<void> {
    const creemOrderId = extractCreemOrderId(data);
    if (!creemOrderId) return;
    try {
        await relockEventByOrder(creemOrderId);
        await logAudit(null, "event.relocked", {
            targetType: "event",
            targetId: creemOrderId,
            details: { provider: "creem", event: data.webhookEventType, creemOrderId },
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
