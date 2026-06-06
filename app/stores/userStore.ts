import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { PlanLimits } from "~~/shared/constants/pricing";

// ─── Limits Response Types ──────────────────────────────────────────
export interface ResourceLimit {
    current: number;
    limit: number;
    allowed: boolean;
}

export interface StorageLimit {
    currentMB: number;
    limitMB: number;
    allowed: boolean;
}

export interface LimitsResponse {
    plan: string;
    limits: PlanLimits;
    usage: {
        organizations: ResourceLimit;
        pages: ResourceLimit | null;
        team: ResourceLimit | null;
        storage: StorageLimit | null;
    };
}

export const useUserStore = defineStore("user", () => {
    // ─── State ───────────────────────────────────────────────────────
    const limitsData = ref<LimitsResponse | null>(null);
    const _lastEventId = ref<string | undefined>(undefined);

    // ─── Computed from useAuth() ─────────────────────────────────────
    const getUser = computed(() => {
        if (import.meta.server) return null;
        const { user } = useAuth();
        return user.value;
    });

    const getIsAuthenticated = computed(() => {
        if (import.meta.server) return false;
        const { loggedIn } = useAuth();
        return loggedIn.value;
    });

    const getSubscription = computed(() => {
        if (import.meta.server) return null;
        const { subscription } = useSubscription();
        return subscription.value;
    });

    // Aliases
    const user = computed(() => getUser.value);
    const isAuthenticated = computed(() => getIsAuthenticated.value);
    const subscription = computed(() => getSubscription.value);

    // ─── Auth Actions ────────────────────────────────────────────────

    async function initializeAuth() {
        if (import.meta.server) return;
        const { fetchSession } = useAuth();
        await fetchSession();
    }

    async function login(email: string, password: string) {
        if (import.meta.server) throw new Error('Login not available on server');
        const { signIn, fetchSession } = useAuth();

        const result = await signIn.email({ email, password });

        if (result.error) {
            throw new Error(result.error.message || 'Login failed');
        }

        await fetchSession();
        return result.data;
    }

    async function loginOAuth(provider: "google" | "github") {
        if (import.meta.server) throw new Error('OAuth login not available on server');
        const { signIn } = useAuth();

        const result = await signIn.social({
            provider,
            callbackURL: window.location.origin + "/auth/callback",
        });

        if (result.error) {
            throw new Error(result.error.message || 'OAuth login failed');
        }

        return result.data;
    }

    async function signup(email: string, password: string, options?: { name?: string }) {
        if (import.meta.server) throw new Error('Signup not available on server');
        const { signUp } = useAuth();

        const result = await signUp.email({
            email,
            password,
            name: options?.name || email.split('@')[0] || email,
        });

        if (result.error) {
            throw new Error(result.error.message || 'Signup failed');
        }

        return result.data;
    }

    function forceLogout() {
        limitsData.value = null;
        _lastEventId.value = undefined;
    }

    async function logout() {
        if (import.meta.server) throw new Error('Logout not available on server');
        const { signOut } = useAuth();

        limitsData.value = null;
        _lastEventId.value = undefined;

        await signOut({ redirectTo: '/login' as any });
    }

    async function fetchSubscription() {
        if (import.meta.server) return null;
        const { refreshSubscription, subscription } = useSubscription();
        await refreshSubscription();
        return subscription.value;
    }

    // ─── Plan Limits (Single Consolidated Call) ──────────────────────

    /**
     * Fetch all limits in one call. Caches the result.
     * - Without eventId → plan info + events count
     * - With eventId → plan info + events count + event-scoped (pages, team, storage)
     */
    async function fetchLimits(eventId?: string): Promise<LimitsResponse | null> {
        if (import.meta.server) return null;

        try {
            const data = await $fetch<LimitsResponse>('/api/limits', {
                query: eventId ? { eventId } : undefined,
            });

            limitsData.value = data;
            _lastEventId.value = eventId;
            return data;
        } catch (error) {
            console.warn('fetchLimits error:', error);
            return null;
        }
    }

    /**
     * Re-fetch limits with the last used eventId
     */
    async function refreshLimits(): Promise<LimitsResponse | null> {
        return fetchLimits(_lastEventId.value);
    }

    /**
     * Invalidate cached limits
     */
    function invalidateLimits() {
        limitsData.value = null;
        _lastEventId.value = undefined;
    }

    /**
     * Check if user can create a new organization.
     * Uses cached data if available, otherwise fetches.
     */
    async function checkOrgCreationLimit(): Promise<ResourceLimit> {
        if (import.meta.server) return { allowed: false, current: 0, limit: 0 };

        if (!limitsData.value) {
            await fetchLimits();
        }

        // Defensive read: 1c renames `usage.events` → `usage.organizations` server-side.
        const usage = limitsData.value?.usage as Record<string, ResourceLimit> | undefined;
        return usage?.organizations ?? usage?.events ?? { allowed: false, current: 0, limit: 0 };
    }

    // ─── Permission Helpers ──────────────────────────────────────────

    function hasWritePermissions(): boolean {
        const sub = subscription.value;
        if (!sub) return false;
        const plan = sub.plan;
        return plan === 'starter' || plan === 'premium' || plan === 'agency';
    }

    function isReadOnlyPlan(): boolean {
        const sub = subscription.value;
        if (!sub) return true;
        const plan = sub.plan;
        return !plan;
    }

    /**
     * Validate if user can downgrade to a new plan
     */
    async function validatePlanDowngrade(newPlan: string): Promise<{
        allowed: boolean;
        reason?: string;
        violations?: Array<{ resource: string; current: number; limit: number; message: string }>
    }> {
        if (import.meta.server) return { allowed: false, reason: 'Not available on server' };

        try {
            const data = await $fetch<{
                allowed: boolean;
                reason?: string;
                violations?: Array<{ resource: string; current: number; limit: number; message: string }>
            }>(`/api/limits/validate-downgrade`, {
                method: 'POST',
                body: { newPlan }
            });
            return data;
        } catch (error) {
            console.warn('validatePlanDowngrade error:', error);
            return { allowed: false, reason: 'Validation error' };
        }
    }

    return {
        // State (computed from useAuth)
        user,
        isAuthenticated,
        subscription,
        // Limits state
        limitsData,
        // Getters
        getUser,
        getIsAuthenticated,
        getSubscription,
        // Auth actions
        initializeAuth,
        login,
        loginOAuth,
        signup,
        logout,
        forceLogout,
        fetchSubscription,
        // Limits actions
        fetchLimits,
        refreshLimits,
        invalidateLimits,
        checkOrgCreationLimit,
        validatePlanDowngrade,
        // Permission helpers
        hasWritePermissions,
        isReadOnlyPlan,
    };
});
