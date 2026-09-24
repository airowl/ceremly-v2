import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useConvexClient, useConvexMutation } from 'convex-vue';
import { api } from '~~/convex/_generated/api';
import { convexErrorMessage } from '~/composables/useConvexError';

export interface UserProfile {
    id: string;
    email: string;
    fullName: string | null;
    phone: string | null;
    bio: string | null;
    image: string | null;
    locale?: string;
    timezone: string | null;
    // `null` when the Better Auth row has no timestamp (never for a real account).
    createdAt: string | null;
    updatedAt: string | null;
}

export interface UpdateProfileData {
    fullName?: string;
    phone?: string;
    bio?: string;
    locale?: string;
    timezone?: string | null;
    image?: string | null;
}

/**
 * Auth provider type
 */
export type AuthProvider = 'email' | 'google' | 'github' | 'apple' | 'facebook' | string;

/**
 * Profile store — Task 14, part c.
 *
 * Before: `GET/PATCH /api/user/profile` and `DELETE /api/user/account` on the
 * Nuxt runtime. Now `api.profile.*`:
 *
 * - `fetchProfile` reads **once** (`convex.query(api.profile.current)`): the page
 *   copies the profile into an editable form, and a live query would rewrite the
 *   fields under the user's fingers (the `getEventOnce` rule).
 * - `updateProfile` is `api.profile.update` (validated and audited server-side;
 *   `email` and `role` are not in its contract).
 * - `deleteAccount` is `api.profile.requestDeletion`: deferred purge (30 days),
 *   account blocked at once, sessions revoked, audited.
 *
 * Email and password changes stay Better Auth flows (`client.changeEmail`,
 * `client.changePassword`): verification and hashing belong to the identity
 * provider.
 *
 * CSR only (the dashboard is `ssr: false`): the store takes the browser client
 * when it is created.
 */
export const useProfileStore = defineStore('profile', () => {
    const convex = useConvexClient();
    const updateMutation = useConvexMutation(api.profile.update);
    const requestDeletionMutation = useConvexMutation(api.profile.requestDeletion);

    const profile = ref<UserProfile | null>(null);
    const isLoading = ref(false);
    const error = ref<string | null>(null);
    const authProvider = ref<AuthProvider | null>(null);

    // Computed getters
    const getProfile = computed(() => profile.value);
    const getIsLoading = computed(() => isLoading.value);
    const getError = computed(() => error.value);

    /**
     * Check if user registered via OAuth (Google, GitHub, etc.)
     * OAuth users cannot change password
     */
    const isOAuthUser = computed(() => {
        return authProvider.value !== null && authProvider.value !== 'email';
    });

    /**
     * Fetch current user profile from API
     */
    async function fetchProfile(): Promise<UserProfile | null> {
        if (import.meta.server) return null;

        isLoading.value = true;
        error.value = null;

        try {
            const { user: authUser } = useAuth();

            if (!authUser.value) {
                return null;
            }

            // The server decides the real provider (email/password vs OAuth-only)
            // from the Better Auth accounts, as the legacy route did.
            const data = await convex.query(api.profile.current, {});

            profile.value = data.profile;
            authProvider.value = data.authProvider ?? 'email';
            return profile.value;
        } catch (err) {
            error.value = convexErrorMessage(err, 'Failed to fetch profile');
            console.error('fetchProfile error:', err);
            return null;
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * Update user profile via API
     */
    async function updateProfile(data: UpdateProfileData): Promise<boolean> {
        if (import.meta.server) return false;

        isLoading.value = true;
        error.value = null;

        try {
            const result = await updateMutation.mutate({ input: data });

            // The mutation answers `{ success }` only: apply the accepted patch to
            // the local copy (the legacy route echoed the whole row back).
            if (result.success && profile.value) {
                profile.value = {
                    ...profile.value,
                    ...(data.fullName !== undefined && { fullName: data.fullName.trim() }),
                    ...(data.phone !== undefined && { phone: data.phone.trim() }),
                    ...(data.bio !== undefined && { bio: data.bio.trim() }),
                    ...(data.locale !== undefined && { locale: data.locale }),
                    ...(data.timezone !== undefined && { timezone: data.timezone }),
                    ...(data.image !== undefined && { image: data.image }),
                };
            }

            return result.success;
        } catch (err) {
            error.value = convexErrorMessage(err, 'Failed to update profile');
            console.error('updateProfile error:', err);
            return false;
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * Update user email using Better Auth
     */
    async function updateEmail(newEmail: string): Promise<boolean> {
        if (import.meta.server) return false;

        isLoading.value = true;
        error.value = null;

        try {
            const { client } = useAuth();

            const result = await client.changeEmail({
                newEmail,
            });

            if (result.error) {
                throw new Error(result.error.message || 'Failed to update email');
            }

            return true;
        } catch (err) {
            error.value = err instanceof Error ? err.message : 'Failed to update email';
            console.error('updateEmail error:', err);
            return false;
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * Update user password using Better Auth
     */
    async function updatePassword(currentPassword: string, newPassword: string): Promise<boolean> {
        if (import.meta.server) return false;

        isLoading.value = true;
        error.value = null;

        try {
            const { client } = useAuth();

            const result = await client.changePassword({
                currentPassword,
                newPassword,
            });

            if (result.error) {
                throw new Error(result.error.message || 'Failed to update password');
            }

            return true;
        } catch (err) {
            error.value = err instanceof Error ? err.message : 'Failed to update password';
            console.error('updatePassword error:', err);
            return false;
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * Verify current password by attempting to re-authenticate
     */
    async function verifyCurrentPassword(currentPassword: string): Promise<boolean> {
        if (import.meta.server) return false;

        try {
            const { user: authUser, signIn } = useAuth();
            const email = authUser.value?.email;

            if (!email) return false;

            // Attempt to sign in with current credentials
            const result = await signIn.email({
                email,
                password: currentPassword,
            });

            return !result.error;
        } catch {
            return false;
        }
    }

    /**
     * Delete user account via API
     */
    async function deleteAccount(): Promise<boolean> {
        if (import.meta.server) return false;

        isLoading.value = true;
        error.value = null;

        try {
            const { signOut } = useAuth();

            // Critical step. On success the account is blocked at once, the purge is
            // scheduled (30-day grace) and every session is revoked server-side.
            await requestDeletionMutation.mutate({});

            // Clear local state
            profile.value = null;

            // Sign out is best-effort cleanup: the server already revoked the
            // session above, so signOut may reject on an invalid session. The
            // account is already deleted — never surface that as a failure.
            try {
                await signOut();
            } catch {
                // session already invalidated server-side — safe to ignore
            }

            return true;
        } catch (err) {
            error.value = convexErrorMessage(err, 'Failed to delete account');
            console.error('deleteAccount error:', err);
            return false;
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * Clear profile state (used on logout)
     */
    function clearProfile() {
        profile.value = null;
        error.value = null;
        authProvider.value = null;
    }

    /**
     * Clear error state
     */
    function clearError() {
        error.value = null;
    }

    return {
        // State
        profile,
        isLoading,
        error,
        authProvider,
        // Getters
        getProfile,
        getIsLoading,
        getError,
        isOAuthUser,
        // Actions
        fetchProfile,
        updateProfile,
        updateEmail,
        updatePassword,
        verifyCurrentPassword,
        deleteAccount,
        clearProfile,
        clearError,
    };
});
