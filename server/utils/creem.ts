/**
 * Creem Payment Provider Configuration
 * Single payment provider for the application
 */
import { creem } from "@creem_io/better-auth";
import { logAudit } from "./audit";
import { runtimeConfig } from "./runtimeConfig";
import type { CeremlyTier } from "~~/shared/constants/pricing";

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

        onCheckoutCompleted: async (data) => {
            await logAudit(null, "checkout.completed", {
                targetType: "creemCustomerId",
                targetId: data?.customer?.id,
                details: {
                    provider: "creem",
                    productId: data?.product?.id,
                    productName: data?.product?.name,
                },
            });
        },

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
