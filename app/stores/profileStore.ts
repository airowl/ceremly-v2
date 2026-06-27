import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface UserProfile {
    id: string;
    email: string;
    fullName: string | null;
    phone: string | null;
    bio: string | null;
    image: string | null;
    timezone: string | null;
    createdAt: string;
    updatedAt: string;
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

export const useProfileStore = defineStore('profile', () => {
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

            // Fetch profile + auth provider from API. Il server determina il provider
            // reale (email/password vs OAuth-only) leggendo la tabella account.
            const data = await $fetch<{ profile: UserProfile; authProvider?: AuthProvider }>('/api/user/profile');

            if (data.profile) {
                profile.value = data.profile;
            }
            authProvider.value = data.authProvider ?? 'email';
            return profile.value;
        } catch (err) {
            error.value = err instanceof Error ? err.message : 'Failed to fetch profile';
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
            const result = await $fetch<{ success: boolean; profile: UserProfile }>(
                '/api/user/profile',
                {
                    method: 'PATCH',
                    body: data,
                }
            );

            if (result.profile) {
                profile.value = result.profile;
            }

            return result.success;
        } catch (err) {
            error.value = err instanceof Error ? err.message : 'Failed to update profile';
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

            // Call API to delete account (critical step). On success the server
            // bans the user and REVOKES the session immediately (deleteSessions).
            await $fetch('/api/user/account', {
                method: 'DELETE',
            });

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
            error.value = err instanceof Error ? err.message : 'Failed to delete account';
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
