import { defineStore } from "pinia";
import { computed } from "vue";

export const useUserStore = defineStore("user", () => {
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

    // Aliases
    const user = computed(() => getUser.value);
    const isAuthenticated = computed(() => getIsAuthenticated.value);

    // No `subscription` here any more (Task 14, part b): the plan belongs to the
    // active organization and is a live Convex query in `useSubscription()`,
    // which needs a component setup context — it cannot run inside a computed.

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
        // Stato locale già derivato da useAuth(): nulla da resettare qui.
    }

    async function logout() {
        if (import.meta.server) throw new Error('Logout not available on server');
        const { signOut } = useAuth();

        await signOut({ redirectTo: '/login' });
    }

    return {
        // State (computed from useAuth)
        user,
        isAuthenticated,
        // Getters
        getUser,
        getIsAuthenticated,
        // Auth actions
        initializeAuth,
        login,
        loginOAuth,
        signup,
        logout,
        forceLogout,
    };
});
