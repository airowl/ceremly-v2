<script setup lang="ts">
const props = defineProps<{
    open: boolean
}>()

const emit = defineEmits<{
    'update:open': [value: boolean]
    'verified': []
}>()

const { t } = useI18n()
const { verifyTOTP, verifyBackupCode, isLoading, error, clearError } = useTwoFactor()

const code = ref('')
const useBackupCode = ref(false)

const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value),
})

watch(isOpen, (newVal) => {
    if (!newVal) {
        // Reset state when modal closes
        code.value = ''
        useBackupCode.value = false
        clearError()
    }
})

async function handleVerify() {
    if (!code.value) return

    let success = false

    if (useBackupCode.value) {
        success = await verifyBackupCode(code.value)
    } else {
        // Login challenge: suppress the setup-only "2FA enabled" toast.
        success = await verifyTOTP(code.value, { silent: true })
    }

    if (success) {
        emit('verified')
        isOpen.value = false
    }
}

function toggleMode() {
    useBackupCode.value = !useBackupCode.value
    code.value = ''
    clearError()
}
</script>

<template>
    <UModal v-model:open="isOpen" :close-on-outside-click="false" :close-on-escape="false">
        <template #content>
            <UCard>
                <template #header>
                    <div class="flex items-center gap-3">
                        <UIcon name="i-lucide-shield" class="w-6 h-6 text-primary" />
                        <h3 class="text-lg font-semibold">{{ t('twoFactor.verifyTitle') }}</h3>
                    </div>
                </template>

                <div class="space-y-4">
                    <p class="text-sm text-muted">
                        {{ useBackupCode
                            ? t('twoFactor.enterBackupCodeDescription')
                            : t('twoFactor.enterCodeFromApp')
                        }}
                    </p>

                    <UFormField
                        :label="useBackupCode ? t('twoFactor.backupCode') : t('twoFactor.verificationCode')"
                        :error="error || undefined"
                    >
                        <UInput
                            v-model="code"
                            :placeholder="useBackupCode ? t('twoFactor.backupCodePlaceholder') : t('twoFactor.codePlaceholder')"
                            :class="useBackupCode ? '' : 'text-center text-2xl tracking-widest'"
                            :maxlength="useBackupCode ? undefined : 6"
                            autocomplete="one-time-code"
                            @keyup.enter="handleVerify"
                        />
                    </UFormField>

                    <button
                        type="button"
                        class="text-sm text-primary hover:underline"
                        @click="toggleMode"
                    >
                        {{ useBackupCode
                            ? t('twoFactor.useAuthenticatorApp')
                            : t('twoFactor.useBackupCode')
                        }}
                    </button>
                </div>

                <template #footer>
                    <div class="flex justify-end gap-3">
                        <UButton
                            :label="t('common.cancel')"
                            color="neutral"
                            variant="outline"
                            @click="isOpen = false"
                        />
                        <UButton
                            :label="t('twoFactor.verify')"
                            color="primary"
                            :loading="isLoading"
                            :disabled="!code || (!useBackupCode && code.length !== 6)"
                            @click="handleVerify"
                        />
                    </div>
                </template>
            </UCard>
        </template>
    </UModal>
</template>
