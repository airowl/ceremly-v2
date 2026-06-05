/**
 * Composable for Two-Factor Authentication operations
 */
export function useTwoFactor() {
    const { twoFactor, user, fetchSession } = useAuth()
    const toast = useToast()
    const { t } = useI18n()

    const isLoading = ref(false)
    const error = ref<string | null>(null)

    // Check if 2FA is enabled for current user
    const isTwoFactorEnabled = computed(() => {
        return (user.value as { twoFactorEnabled?: boolean })?.twoFactorEnabled ?? false
    })

    /**
     * Enable 2FA - returns setup data including secret and QR code
     */
    async function enableTwoFactor(password: string): Promise<{
        totpURI: string
        secret: string
        backupCodes: string[]
    } | null> {
        isLoading.value = true
        error.value = null

        try {
            const result = await twoFactor.enable({ password })

            if (result.error) {
                error.value = result.error.message || t('twoFactor.enableError')
                toast.add({
                    title: t('common.error'),
                    description: error.value,
                    color: 'error',
                })
                return null
            }

            return result.data as {
                totpURI: string
                secret: string
                backupCodes: string[]
            }
        } catch (err) {
            error.value = err instanceof Error ? err.message : t('twoFactor.enableError')
            toast.add({
                title: t('common.error'),
                description: error.value,
                color: 'error',
            })
            return null
        } finally {
            isLoading.value = false
        }
    }

    /**
     * Verify TOTP code during setup or login
     */
    async function verifyTOTP(code: string): Promise<boolean> {
        isLoading.value = true
        error.value = null

        try {
            const result = await twoFactor.verifyTotp({
                code,
            })

            if (result.error) {
                error.value = result.error.message || t('twoFactor.invalidCode')
                toast.add({
                    title: t('common.error'),
                    description: error.value,
                    color: 'error',
                })
                return false
            }

            // Refresh session to update user data
            await fetchSession()

            toast.add({
                title: t('common.success'),
                description: t('twoFactor.enabled'),
                color: 'success',
            })

            return true
        } catch (err) {
            error.value = err instanceof Error ? err.message : t('twoFactor.verifyError')
            toast.add({
                title: t('common.error'),
                description: error.value,
                color: 'error',
            })
            return false
        } finally {
            isLoading.value = false
        }
    }

    /**
     * Disable 2FA
     */
    async function disableTwoFactor(password: string): Promise<boolean> {
        isLoading.value = true
        error.value = null

        try {
            const result = await twoFactor.disable({
                password,
            })

            if (result.error) {
                error.value = result.error.message || t('twoFactor.disableError')
                toast.add({
                    title: t('common.error'),
                    description: error.value,
                    color: 'error',
                })
                return false
            }

            // Refresh session to update user data
            await fetchSession()

            toast.add({
                title: t('common.success'),
                description: t('twoFactor.disabled'),
                color: 'success',
            })

            return true
        } catch (err) {
            error.value = err instanceof Error ? err.message : t('twoFactor.disableError')
            toast.add({
                title: t('common.error'),
                description: error.value,
                color: 'error',
            })
            return false
        } finally {
            isLoading.value = false
        }
    }

    /**
     * Generate new backup codes
     */
    async function generateBackupCodes(password: string): Promise<string[] | null> {
        isLoading.value = true
        error.value = null

        try {
            const result = await twoFactor.generateBackupCodes({
                password,
            })

            if (result.error) {
                error.value = result.error.message || t('twoFactor.generateBackupError')
                toast.add({
                    title: t('common.error'),
                    description: error.value,
                    color: 'error',
                })
                return null
            }

            toast.add({
                title: t('common.success'),
                description: t('twoFactor.backupCodesGenerated'),
                color: 'success',
            })

            return result.data?.backupCodes ?? null
        } catch (err) {
            error.value = err instanceof Error ? err.message : t('twoFactor.generateBackupError')
            toast.add({
                title: t('common.error'),
                description: error.value,
                color: 'error',
            })
            return null
        } finally {
            isLoading.value = false
        }
    }

    /**
     * Verify backup code during login
     */
    async function verifyBackupCode(code: string): Promise<boolean> {
        isLoading.value = true
        error.value = null

        try {
            const result = await twoFactor.verifyBackupCode({
                code,
            })

            if (result.error) {
                error.value = result.error.message || t('twoFactor.invalidBackupCode')
                toast.add({
                    title: t('common.error'),
                    description: error.value,
                    color: 'error',
                })
                return false
            }

            // Refresh session
            await fetchSession()

            return true
        } catch (err) {
            error.value = err instanceof Error ? err.message : t('twoFactor.verifyBackupError')
            toast.add({
                title: t('common.error'),
                description: error.value,
                color: 'error',
            })
            return false
        } finally {
            isLoading.value = false
        }
    }

    function clearError() {
        error.value = null
    }

    return {
        isTwoFactorEnabled,
        isLoading,
        error,
        enableTwoFactor,
        verifyTOTP,
        disableTwoFactor,
        generateBackupCodes,
        verifyBackupCode,
        clearError,
    }
}
