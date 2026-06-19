/**
 * Composable for managing subscriptions via Creem + Better Auth
 */
export function useSubscription() {
    const { creem, fetchSession } = useAuth();
    const runtimeConfig = useRuntimeConfig();

    const isUpdating = ref(false);
    const subscription = useState<any | null>("creem:subscription", () => null);
    const hasAccess = useState<boolean>("creem:hasAccess", () => false);

    /**
     * Map product ID → tier (free | atelier)
     */
    function getTierFromProductId(productId: string | undefined | null): "free" | "atelier" {
        if (!productId) return "free";
        const pub = runtimeConfig.public;
        if (productId === pub.creemProductIdAtelier) return "atelier";
        return "free";
    }

    /**
     * Has active subscription
     */
    const hasActiveSubscription = computed(() => hasAccess.value);

    /**
     * Current tier (free | atelier)
     */
    const currentTier = computed<"free" | "atelier">(() => {
        if (!hasAccess.value) return "free";
        return getTierFromProductId((subscription.value as { productId?: string } | null)?.productId);
    });

    /**
     * True when user is on the Atelier plan
     */
    const isAtelier = computed<boolean>(() => currentTier.value === "atelier");

    /**
     * Refresh subscription data from Creem
     */
    async function refreshSubscription() {
        if (import.meta.server) return;

        try {
            const { data: accessData } = await creem.hasAccessGranted();
            hasAccess.value = !!accessData?.hasAccessGranted;

            if (accessData && 'subscription' in accessData && accessData.subscription) {
                subscription.value = accessData.subscription;
            } else {
                subscription.value = null;
            }
        } catch (error) {
            console.warn("[useSubscription] Error refreshing:", error);
            hasAccess.value = false;
            subscription.value = null;
        }
    }

    /**
     * Unlock a single event via checkout.
     * Calls POST /api/events/[id]/unlock → { url } then redirects to the checkout URL.
     */
    async function unlockEvent(eventId: string): Promise<void> {
        if (import.meta.server) throw new Error("unlockEvent is not available on server");
        const { url } = await $fetch<{ url: string }>(`/api/events/${eventId}/unlock`, { method: "POST" });
        window.location.href = url;
    }

    /**
     * Open Creem customer portal for managing subscription (upgrade/downgrade/cancel)
     */
    async function openCustomerPortal() {
        if (import.meta.server) {
            throw new Error("openCustomerPortal is not available on server");
        }

        try {
            const { data, error } = await creem.createPortal();

            if (error) {
                throw new Error(error.message || "Failed to open customer portal");
            }

            if (data && 'url' in data && data.url) {
                window.location.href = data.url;
            }

            return data;
        } catch (error) {
            console.error("openCustomerPortal error:", error);
            throw error;
        }
    }

    return {
        // State
        subscription,
        hasActiveSubscription,
        hasAccess,
        currentTier,
        isAtelier,
        isUpdating,

        // Methods
        unlockEvent,
        openCustomerPortal,
        refreshSubscription,
    };
}
