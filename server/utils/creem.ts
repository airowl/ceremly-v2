/**
 * Creem Payment Provider Configuration
 * Single payment provider for the application
 */
import { creem } from "@creem_io/better-auth";
import { logAudit } from "./audit";
import { runtimeConfig } from "./runtimeConfig";

/**
 * Map Creem product ID to internal plan name
 */
export function getPlanFromProductId(productId: string): string {
    if (
        productId === runtimeConfig.creemProductIdStarterMonth ||
        productId === runtimeConfig.creemProductIdStarterYear
    ) return "starter";
    if (
        productId === runtimeConfig.creemProductIdPremiumMonth ||
        productId === runtimeConfig.creemProductIdPremiumYear
    ) return "premium";
    if (
        productId === runtimeConfig.creemProductIdAgencyMonth ||
        productId === runtimeConfig.creemProductIdAgencyYear
    ) return "agency";
    return "starter";
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
