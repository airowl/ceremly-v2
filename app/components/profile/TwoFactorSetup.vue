<script setup lang="ts">
const { t } = useI18n()
const profileStore = useProfileStore()
const {
    isTwoFactorEnabled,
    isLoading,
    enableTwoFactor,
    verifyTOTP,
    disableTwoFactor,
    generateBackupCodes,
} = useTwoFactor()

// Local state
const setupStep = ref<'initial' | 'qr' | 'verify' | 'backup' | 'complete'>('initial')
const totpURI = ref('')
const secret = ref('')
const backupCodes = ref<string[]>([])
const verificationCode = ref('')
const showDisableModal = ref(false)
const showBackupModal = ref(false)
const showEnableModal = ref(false)
const showOAuthInfoModal = ref(false)
const disablePassword = ref('')
const backupPassword = ref('')
const enablePassword = ref('')

// OAuth-only users (no password) can't use app-level 2FA. The real provider is
// resolved server-side from the account table and exposed via the profile store
// (authProvider). The parent profile page calls fetchProfile() on mount.
const isOAuthUser = computed(() => profileStore.isOAuthUser)

// OAuth provider name (Google is the only configured provider)
const oauthProvider = 'Google'

// Google security settings URL
const googleSecurityUrl = 'https://myaccount.google.com/security'

// Open enable modal
function openEnableModal() {
    if (isOAuthUser.value) {
        // OAuth users: show informative modal about provider's 2FA
        showOAuthInfoModal.value = true
    } else {
        showEnableModal.value = true
    }
}

// Start 2FA setup with password
async function startSetupWithPassword(password: string) {
    const result = await enableTwoFactor(password)
    if (result) {
        totpURI.value = result.totpURI
        secret.value = result.secret
        backupCodes.value = result.backupCodes
        setupStep.value = 'qr'
        showEnableModal.value = false
        enablePassword.value = ''
    }
}

// Handle enable from modal
async function handleEnable() {
    if (!isOAuthUser.value && !enablePassword.value) return
    await startSetupWithPassword(enablePassword.value)
}

// Verify TOTP code
async function handleVerify() {
    if (verificationCode.value.length !== 6) return

    const success = await verifyTOTP(verificationCode.value)
    if (success) {
        setupStep.value = 'backup'
    }
}

// Complete setup
function completeSetup() {
    setupStep.value = 'complete'
    setTimeout(() => {
        setupStep.value = 'initial'
    }, 2000)
}

// Disable 2FA
async function handleDisable() {
    if (isOAuthUser.value) {
        // For OAuth users, we might need different handling
        // For now, just disable without password
        const success = await disableTwoFactor('')
        if (success) {
            showDisableModal.value = false
            disablePassword.value = ''
        }
    } else {
        if (!disablePassword.value) return
        const success = await disableTwoFactor(disablePassword.value)
        if (success) {
            showDisableModal.value = false
            disablePassword.value = ''
        }
    }
}

// Generate new backup codes
async function handleGenerateBackup() {
    if (!backupPassword.value && !isOAuthUser.value) return

    const codes = await generateBackupCodes(backupPassword.value)
    if (codes) {
        backupCodes.value = codes
        showBackupModal.value = false
        backupPassword.value = ''
        setupStep.value = 'backup'
    }
}

// Copy backup codes to clipboard
async function copyBackupCodes() {
    const codesText = backupCodes.value.join('\n')
    await navigator.clipboard.writeText(codesText)
    useToast().add({
        title: t('common.success'),
        description: t('twoFactor.backupCodesCopied'),
        color: 'success',
    })
}

// Download backup codes
function downloadBackupCodes() {
    const codesText = `${t('twoFactor.backupCodesTitle')}\n\n${backupCodes.value.join('\n')}\n\n${t('twoFactor.backupCodesWarning')}`
    const blob = new Blob([codesText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'backup-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
}
</script>

<template>
    <UPageCard :title="t('twoFactor.title')" :description="t('twoFactor.description')" variant="subtle">
        <!-- 2FA Enabled State -->
        <div v-if="isTwoFactorEnabled && setupStep === 'initial'" class="space-y-4">
            <div class="flex items-center gap-3 p-4 rounded-lg bg-success/10 border border-success/20">
                <UIcon name="i-lucide-shield-check" class="w-6 h-6 text-success" />
                <div>
                    <p class="font-medium text-success">{{ t('twoFactor.enabledStatus') }}</p>
                    <p class="text-sm text-muted">{{ t('twoFactor.enabledDescription') }}</p>
                </div>
            </div>

            <div class="flex gap-3">
                <UButton
                    :label="t('twoFactor.regenerateBackupCodes')"
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-key"
                    @click="showBackupModal = true"
                />
                <UButton
                    :label="t('twoFactor.disable')"
                    color="error"
                    variant="outline"
                    icon="i-lucide-shield-off"
                    @click="showDisableModal = true"
                />
            </div>
        </div>

        <!-- 2FA Disabled State -->
        <div v-else-if="!isTwoFactorEnabled && setupStep === 'initial'" class="space-y-4">
            <div class="flex items-center gap-3 p-4 rounded-lg bg-warning/10 border border-warning/20">
                <UIcon name="i-lucide-shield-alert" class="w-6 h-6 text-warning" />
                <div>
                    <p class="font-medium text-warning">{{ t('twoFactor.disabledStatus') }}</p>
                    <p class="text-sm text-muted">{{ t('twoFactor.disabledDescription') }}</p>
                </div>
            </div>

            <UButton
                :label="t('twoFactor.enable')"
                color="primary"
                icon="i-lucide-shield-plus"
                :loading="isLoading"
                @click="openEnableModal"
            />
        </div>

        <!-- QR Code Step -->
        <div v-else-if="setupStep === 'qr'" class="space-y-6">
            <div class="text-center">
                <h3 class="text-lg font-semibold mb-2">{{ t('twoFactor.scanQRCode') }}</h3>
                <p class="text-sm text-muted mb-4">{{ t('twoFactor.scanQRCodeDescription') }}</p>

                <!-- QR Code Display -->
                <div class="flex justify-center mb-4">
                    <div class="p-4 bg-white rounded-lg">
                        <ProfileTwoFactorQRCode :uri="totpURI" />
                    </div>
                </div>

                <!-- Manual Entry -->
                <div class="p-4 rounded-lg bg-muted/30">
                    <p class="text-sm text-muted mb-2">{{ t('twoFactor.manualEntry') }}</p>
                    <code class="text-sm font-mono select-all break-all">{{ secret }}</code>
                </div>
            </div>

            <UButton
                :label="t('common.continue')"
                color="primary"
                class="w-full"
                @click="setupStep = 'verify'"
            />
        </div>

        <!-- Verification Step -->
        <div v-else-if="setupStep === 'verify'" class="space-y-6">
            <div class="text-center">
                <h3 class="text-lg font-semibold mb-2">{{ t('twoFactor.enterCode') }}</h3>
                <p class="text-sm text-muted mb-4">{{ t('twoFactor.enterCodeDescription') }}</p>
            </div>

            <UFormField :label="t('twoFactor.verificationCode')">
                <UInput
                    v-model="verificationCode"
                    :placeholder="t('twoFactor.codePlaceholder')"
                    class="text-center text-2xl tracking-widest"
                    maxlength="6"
                    autocomplete="one-time-code"
                    @keyup.enter="handleVerify"
                />
            </UFormField>

            <div class="flex gap-3">
                <UButton
                    :label="t('common.back')"
                    color="neutral"
                    variant="outline"
                    class="flex-1"
                    @click="setupStep = 'qr'"
                />
                <UButton
                    :label="t('twoFactor.verify')"
                    color="primary"
                    class="flex-1"
                    :loading="isLoading"
                    :disabled="verificationCode.length !== 6"
                    @click="handleVerify"
                />
            </div>
        </div>

        <!-- Backup Codes Step -->
        <div v-else-if="setupStep === 'backup'" class="space-y-6">
            <div class="text-center">
                <h3 class="text-lg font-semibold mb-2">{{ t('twoFactor.saveBackupCodes') }}</h3>
                <p class="text-sm text-muted mb-4">{{ t('twoFactor.saveBackupCodesDescription') }}</p>
            </div>

            <ProfileBackupCodesDisplay :codes="backupCodes" />

            <div class="flex gap-3">
                <UButton
                    :label="t('twoFactor.copyAll')"
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-copy"
                    class="flex-1"
                    @click="copyBackupCodes"
                />
                <UButton
                    :label="t('twoFactor.download')"
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-download"
                    class="flex-1"
                    @click="downloadBackupCodes"
                />
            </div>

            <UAlert
                color="warning"
                variant="subtle"
                icon="i-lucide-alert-triangle"
                :title="t('twoFactor.importantNote')"
                :description="t('twoFactor.backupCodesWarning')"
            />

            <UButton
                :label="t('twoFactor.iSavedMyCodes')"
                color="primary"
                class="w-full"
                @click="completeSetup"
            />
        </div>

        <!-- Complete Step -->
        <div v-else-if="setupStep === 'complete'" class="text-center py-8">
            <UIcon name="i-lucide-check-circle" class="w-16 h-16 text-success mx-auto mb-4" />
            <h3 class="text-lg font-semibold text-success">{{ t('twoFactor.setupComplete') }}</h3>
            <p class="text-sm text-muted mt-2">{{ t('twoFactor.setupCompleteDescription') }}</p>
        </div>
    </UPageCard>

    <!-- Enable 2FA Modal (password confirmation) -->
    <UModal v-model:open="showEnableModal">
        <template #content>
            <UCard>
                <template #header>
                    <div class="flex items-center gap-3">
                        <UIcon name="i-lucide-shield-plus" class="w-6 h-6 text-primary" />
                        <h3 class="text-lg font-semibold">{{ t('twoFactor.enableTitle') }}</h3>
                    </div>
                </template>

                <div class="space-y-4">
                    <p class="text-sm text-muted">{{ t('twoFactor.enablePasswordDescription') }}</p>

                    <UFormField :label="t('twoFactor.confirmPassword')">
                        <UInput
                            v-model="enablePassword"
                            type="password"
                            :placeholder="t('twoFactor.enterPassword')"
                            autocomplete="current-password"
                            @keyup.enter="handleEnable"
                        />
                    </UFormField>
                </div>

                <template #footer>
                    <div class="flex justify-end gap-3">
                        <UButton
                            :label="t('common.cancel')"
                            color="neutral"
                            variant="outline"
                            @click="showEnableModal = false"
                        />
                        <UButton
                            :label="t('common.continue')"
                            color="primary"
                            :loading="isLoading"
                            :disabled="!enablePassword"
                            @click="handleEnable"
                        />
                    </div>
                </template>
            </UCard>
        </template>
    </UModal>

    <!-- Disable 2FA Modal -->
    <UModal v-model:open="showDisableModal">
        <template #content>
            <UCard>
                <template #header>
                    <div class="flex items-center gap-3">
                        <UIcon name="i-lucide-shield-off" class="w-6 h-6 text-error" />
                        <h3 class="text-lg font-semibold">{{ t('twoFactor.disableTitle') }}</h3>
                    </div>
                </template>

                <div class="space-y-4">
                    <UAlert
                        color="warning"
                        variant="subtle"
                        icon="i-lucide-alert-triangle"
                        :description="t('twoFactor.disableWarning')"
                    />

                    <UFormField v-if="!isOAuthUser" :label="t('twoFactor.confirmPassword')">
                        <UInput
                            v-model="disablePassword"
                            type="password"
                            :placeholder="t('twoFactor.enterPassword')"
                            autocomplete="current-password"
                        />
                    </UFormField>
                </div>

                <template #footer>
                    <div class="flex justify-end gap-3">
                        <UButton
                            :label="t('common.cancel')"
                            color="neutral"
                            variant="outline"
                            @click="showDisableModal = false"
                        />
                        <UButton
                            :label="t('twoFactor.disable')"
                            color="error"
                            :loading="isLoading"
                            :disabled="!isOAuthUser && !disablePassword"
                            @click="handleDisable"
                        />
                    </div>
                </template>
            </UCard>
        </template>
    </UModal>

    <!-- Generate Backup Codes Modal -->
    <UModal v-model:open="showBackupModal">
        <template #content>
            <UCard>
                <template #header>
                    <div class="flex items-center gap-3">
                        <UIcon name="i-lucide-key" class="w-6 h-6 text-primary" />
                        <h3 class="text-lg font-semibold">{{ t('twoFactor.regenerateBackupCodes') }}</h3>
                    </div>
                </template>

                <div class="space-y-4">
                    <p class="text-sm text-muted">{{ t('twoFactor.regenerateBackupDescription') }}</p>

                    <UAlert
                        color="warning"
                        variant="subtle"
                        icon="i-lucide-alert-triangle"
                        :description="t('twoFactor.regenerateBackupWarning')"
                    />

                    <UFormField v-if="!isOAuthUser" :label="t('twoFactor.confirmPassword')">
                        <UInput
                            v-model="backupPassword"
                            type="password"
                            :placeholder="t('twoFactor.enterPassword')"
                            autocomplete="current-password"
                        />
                    </UFormField>
                </div>

                <template #footer>
                    <div class="flex justify-end gap-3">
                        <UButton
                            :label="t('common.cancel')"
                            color="neutral"
                            variant="outline"
                            @click="showBackupModal = false"
                        />
                        <UButton
                            :label="t('twoFactor.generate')"
                            color="primary"
                            :loading="isLoading"
                            :disabled="!isOAuthUser && !backupPassword"
                            @click="handleGenerateBackup"
                        />
                    </div>
                </template>
            </UCard>
        </template>
    </UModal>

    <!-- OAuth Provider Info Modal -->
    <UModal v-model:open="showOAuthInfoModal">
        <template #content>
            <UCard>
                <template #header>
                    <div class="flex items-center gap-3">
                        <UIcon name="i-lucide-shield-check" class="w-6 h-6 text-success" />
                        <h3 class="text-lg font-semibold">{{ t('twoFactor.oauthProviderTitle', { provider: oauthProvider }) }}</h3>
                    </div>
                </template>

                <div class="space-y-4">
                    <p class="text-sm text-muted">
                        {{ t('twoFactor.oauthProviderDescription', { provider: oauthProvider }) }}
                    </p>

                    <div class="p-4 rounded-lg bg-success/10 border border-success/20">
                        <p class="text-sm">
                            {{ t('twoFactor.oauthProviderInfo', { provider: oauthProvider }) }}
                        </p>
                    </div>

                    <div class="space-y-2">
                        <p class="text-sm font-medium">{{ t('twoFactor.oauthProviderFeatures', { provider: oauthProvider }) }}</p>
                        <ul class="space-y-2 text-sm text-muted">
                            <li class="flex items-center gap-2">
                                <UIcon name="i-lucide-check" class="w-4 h-4 text-success" />
                                {{ t('twoFactor.oauthFeature1') }}
                            </li>
                            <li class="flex items-center gap-2">
                                <UIcon name="i-lucide-check" class="w-4 h-4 text-success" />
                                {{ t('twoFactor.oauthFeature2') }}
                            </li>
                            <li class="flex items-center gap-2">
                                <UIcon name="i-lucide-check" class="w-4 h-4 text-success" />
                                {{ t('twoFactor.oauthFeature3') }}
                            </li>
                        </ul>
                    </div>
                </div>

                <template #footer>
                    <div class="flex justify-end gap-3">
                        <UButton
                            :label="t('twoFactor.oauthProviderClose')"
                            color="neutral"
                            variant="outline"
                            @click="showOAuthInfoModal = false"
                        />
                        <UButton
                            :label="t('twoFactor.oauthProviderManage', { provider: oauthProvider })"
                            color="primary"
                            icon="i-lucide-external-link"
                            trailing
                            tag="a"
                            :href="googleSecurityUrl"
                            target="_blank"
                            @click="showOAuthInfoModal = false"
                        />
                    </div>
                </template>
            </UCard>
        </template>
    </UModal>
</template>
