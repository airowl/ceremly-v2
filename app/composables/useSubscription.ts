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
     * Map product ID → plan name
     */
    function getPlanNameFromProductId(productId: string): string {
        const pub = runtimeConfig.public;
        // Atelier è l'unico prodotto a subscription ricorrente; mappato al tier
        // B2B legacy "agency" per coerenza con il resto della UI piano corrente.
        if (productId === pub.creemProductIdAtelier) return "agency";
        return "starter";
    }

    /**
     * Has active subscription
     */
    const hasActiveSubscription = computed(() => hasAccess.value);

    /**
     * Get current plan name
     */
    const currentPlan = computed(() => {
        if (!subscription.value?.productId) return "starter";
        return getPlanNameFromProductId(subscription.value.productId);
    });

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
     * Create checkout session for subscription
     * @param planSlug - e.g. 'starter-monthly', 'premium-yearly', 'agency-monthly'
     */
    async function createCheckoutSession(planSlug: string) {
        if (import.meta.server) {
            throw new Error("createCheckoutSession is not available on server");
        }

        // Map slug to productId
        const pub = runtimeConfig.public;
        const slugToProductId: Record<string, string> = {
            atelier: pub.creemProductIdAtelier as string,
        };

        const productId = slugToProductId[planSlug];
        if (!productId) {
            throw new Error(`Unknown plan slug: ${planSlug}`);
        }

        try {
            const { data, error } = await creem.createCheckout({
                productId,
                successUrl: `${window.location.origin}/dashboard/subscription?success=true&plan=${planSlug}`,
            });

            if (error) {
                throw new Error(error.message || "Failed to create checkout session");
            }

            if (data && 'url' in data && data.url) {
                window.location.href = data.url;
            }

            return data;
        } catch (error) {
            console.error("createCheckoutSession error:", error);
            throw error;
        }
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
        currentPlan,
        isUpdating,

        // Methods
        createCheckoutSession,
        openCustomerPortal,
        refreshSubscription,
    };
}
