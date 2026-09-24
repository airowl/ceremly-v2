import { computed, ref } from "vue";
import { useConvexQuery } from "convex-vue";
import { useConvexAction } from "~/composables/useConvexAction";
import { api } from "~~/convex/_generated/api";
import type { Id } from "~~/convex/_generated/dataModel";

/**
 * Plan and billing of the **active organization** — Task 14, part b.
 *
 * Before: the Creem Better Auth client plugin (`creem.hasAccessGranted()`,
 * `creem.createPortal()`) plus `POST /api/events/:id/unlock`. The billing entity
 * was whatever the plugin keyed on. Now: `api.billing.*`, where the entity is
 * always the caller's active organization resolved server-side — no argument here
 * names an organization, and no Creem secret or product id is needed in the
 * browser (the tier → product mapping is server configuration).
 *
 * The exposed surface is unchanged (`currentTier`, `isAtelier`, `unlockEvent`,
 * `openCustomerPortal`, `refreshSubscription`, ...) with one behavioural note:
 * the plan is a **live query**, so it changes by itself when the Creem webhook
 * lands. `refreshSubscription()` is kept as a resolved no-op for API
 * compatibility (the brief requires it); no UI calls it any more — the
 * subscription page shows the plan as real-time state instead of a sync button.
 *
 * Every caller gets its own `useConvexQuery`, which is cheap: the Convex client
 * shares one subscription per (query, args) across all of them.
 */
export function useSubscription() {
    const { data: plan, error: planError } = useConvexQuery(
        api.billing.planForActiveOrganization,
        {},
        { server: false },
    );
    const createCheckout = useConvexAction(api.billing.checkoutsCreate);
    const portalUrl = useConvexAction(api.billing.customersPortalUrl);

    const isUpdating = ref(false);

    /** The Creem subscription row mirrored by the webhook, or `null` (legacy shape: `{ productId }`). */
    const subscription = computed(() => plan.value?.subscription ?? null);

    /** Atelier is the only recurring access; `celebration` is per event, not a plan. */
    const hasAccess = computed<boolean>(() => plan.value?.plan === "atelier");
    const hasActiveSubscription = hasAccess;

    /** `free` while loading or on error: never grant a paid tier the server did not state. */
    const currentTier = computed<"free" | "atelier">(() => plan.value?.plan ?? "free");
    const isAtelier = computed<boolean>(() => currentTier.value === "atelier");

    /**
     * What the billing actions will accept for this caller, answered by the server
     * from the same role lists the actions check: `canManageBilling` (Atelier
     * checkout, portal) is owner only, `canUnlockEvents` (Celebration) every write
     * role. `false` while loading: never offer a control the server has not confirmed.
     */
    const canManageBilling = computed<boolean>(() => plan.value?.canManageBilling ?? false);
    const canUnlockEvents = computed<boolean>(() => plan.value?.canUnlockEvents ?? false);

    /** Kept for existing callers: the plan query is live, so this resolves immediately. */
    async function refreshSubscription(): Promise<void> {
        // Intentionally empty — see the composable's doc comment.
    }

    /**
     * Unlock a single event (Celebrazione) via a Creem checkout, then redirect.
     *
     * The server validates the event (same organization, still `free`, no Atelier)
     * before Creem is called. Back from the checkout, the event page needs no
     * reconcile call: `events.get` is live and the webhook is exactly-once with
     * provider retries on failure (G07), so the tier flips by itself.
     */
    async function unlockEvent(eventId: string): Promise<void> {
        if (import.meta.server) throw new Error("unlockEvent is not available on server");
        isUpdating.value = true;
        try {
            const { url } = await createCheckout({
                tier: "celebration",
                eventId: eventId as Id<"events">,
                successUrl: `${window.location.origin}/dashboard/events/${eventId}`,
            });
            window.location.href = url;
        } finally {
            isUpdating.value = false;
        }
    }

    /** Open the Creem customer portal (upgrade/downgrade/cancel) of the active organization. */
    async function openCustomerPortal(): Promise<{ url: string }> {
        if (import.meta.server) throw new Error("openCustomerPortal is not available on server");
        isUpdating.value = true;
        try {
            const result = await portalUrl({});
            window.location.href = result.url;
            return result;
        } finally {
            isUpdating.value = false;
        }
    }

    return {
        // State
        subscription,
        hasActiveSubscription,
        hasAccess,
        currentTier,
        isAtelier,
        canManageBilling,
        canUnlockEvents,
        isUpdating,
        planError,

        // Methods
        unlockEvent,
        openCustomerPortal,
        refreshSubscription,
    };
}
