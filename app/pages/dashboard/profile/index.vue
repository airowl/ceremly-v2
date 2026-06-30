<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent, FormError } from '@nuxt/ui'

const { t, locale, setLocale } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const profileStore = useProfileStore()

// --- Timezone options ---
const timezoneOptions = [
    { label: '(GMT+01:00) Rome, Paris, Berlin', value: 'Europe/Rome' },
    { label: '(GMT+00:00) London, Lisbon', value: 'Europe/London' },
    { label: '(GMT+01:00) Amsterdam, Brussels', value: 'Europe/Amsterdam' },
    { label: '(GMT+01:00) Madrid, Barcelona', value: 'Europe/Madrid' },
    { label: '(GMT+02:00) Athens, Helsinki', value: 'Europe/Athens' },
    { label: '(GMT+02:00) Bucharest, Sofia', value: 'Europe/Bucharest' },
    { label: '(GMT+03:00) Moscow, Istanbul', value: 'Europe/Moscow' },
    { label: '(GMT-05:00) New York, Toronto', value: 'America/New_York' },
    { label: '(GMT-06:00) Chicago, Mexico City', value: 'America/Chicago' },
    { label: '(GMT-07:00) Denver, Phoenix', value: 'America/Denver' },
    { label: '(GMT-08:00) Los Angeles, Vancouver', value: 'America/Los_Angeles' },
    { label: '(GMT+08:00) Singapore, Hong Kong', value: 'Asia/Singapore' },
    { label: '(GMT+09:00) Tokyo, Seoul', value: 'Asia/Tokyo' },
    { label: '(GMT+10:00) Sydney, Melbourne', value: 'Australia/Sydney' },
]

const languageOptions = [
    { label: 'Italiano', value: 'it' },
    { label: 'English (US)', value: 'en' },
]

// --- Profile form ---
const profileSchema = z.object({
    fullName: z.string().min(2, t('profile.validation.nameTooShort')),
    email: z.string().email(t('profile.validation.invalidEmail')),
    phone: z.string().optional(),
})

type ProfileSchema = z.output<typeof profileSchema>

const profile = reactive<Partial<ProfileSchema>>({
    fullName: '',
    email: '',
    phone: '',
})

const selectedLocale = ref<string>(locale.value)
const selectedTimezone = ref<string>('Europe/Rome')
const isSubmitting = ref(false)

// --- Password form ---
const passwordSchema = z.object({
    current: z.string().min(8, t('profile.validation.passwordTooShort')),
    new: z.string().min(8, t('profile.validation.passwordTooShort')),
    confirm: z.string().min(8, t('profile.validation.passwordTooShort')),
})

type PasswordSchema = z.output<typeof passwordSchema>

const password = reactive<Partial<PasswordSchema>>({
    current: undefined,
    new: undefined,
    confirm: undefined,
})

const isPasswordSubmitting = ref(false)

const validatePassword = (state: Partial<PasswordSchema>): FormError[] => {
    const errors: FormError[] = []
    if (state.current && state.new && state.current === state.new) {
        errors.push({ name: 'new', message: t('profile.validation.passwordsMustDiffer') })
    }
    if (state.new && state.confirm && state.new !== state.confirm) {
        errors.push({ name: 'confirm', message: t('profile.validation.passwordsMustMatch') })
    }
    return errors
}

// --- Avatar upload ---
const fileInputRef = ref<HTMLInputElement | null>(null)
const avatarUrl = ref<string | null>(null)
const isUploading = ref(false)

function triggerFileInput() {
    fileInputRef.value?.click()
}

async function onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
        toast.add({
            title: t('common.error'),
            description: t('profile.photoDescription'),
            icon: 'i-lucide-alert-circle',
            color: 'error',
        })
        return
    }

    if (file.size > 5 * 1024 * 1024) {
        toast.add({
            title: t('common.error'),
            description: t('profile.photoDescription'),
            icon: 'i-lucide-alert-circle',
            color: 'error',
        })
        return
    }

    isUploading.value = true

    try {
        const formData = new FormData()
        formData.append('file', file)

        const result = await $fetch<{ success: boolean; file: { url: string } }>('/api/file/upload', {
            method: 'POST',
            body: formData,
        })

        if (result.success && result.file?.url) {
            avatarUrl.value = result.file.url
            await profileStore.updateProfile({ image: result.file.url })
            toast.add({
                title: t('common.success'),
                description: t('profile.updateSuccess'),
                icon: 'i-lucide-check',
                color: 'success',
            })
        }
    } catch {
        toast.add({
            title: t('common.error'),
            description: t('profile.updateError'),
            icon: 'i-lucide-alert-circle',
            color: 'error',
        })
    } finally {
        isUploading.value = false
        if (fileInputRef.value) fileInputRef.value.value = ''
    }
}

async function removeAvatar() {
    try {
        await profileStore.updateProfile({ image: null })
        avatarUrl.value = null
        toast.add({
            title: t('common.success'),
            description: t('profile.updateSuccess'),
            icon: 'i-lucide-check',
            color: 'success',
        })
    } catch {
        toast.add({
            title: t('common.error'),
            description: t('profile.updateError'),
            icon: 'i-lucide-alert-circle',
            color: 'error',
        })
    }
}

// --- Load profile data ---
onMounted(async () => {
    const userData = await profileStore.fetchProfile()
    if (userData) {
        profile.fullName = userData.fullName || ''
        profile.email = userData.email
        profile.phone = userData.phone || ''
        avatarUrl.value = userData.image || null
        selectedTimezone.value = userData.timezone || 'Europe/Rome'
    }
})

// --- Profile submit ---
async function onProfileSubmit(event: FormSubmitEvent<ProfileSchema>) {
    isSubmitting.value = true
    profileStore.clearError()

    try {
        const success = await profileStore.updateProfile({
            fullName: event.data.fullName,
            phone: event.data.phone || undefined,
        })

        // Update email if changed
        const currentProfile = profileStore.getProfile
        if (currentProfile && event.data.email !== currentProfile.email) {
            const emailSuccess = await profileStore.updateEmail(event.data.email)
            if (emailSuccess) {
                toast.add({
                    title: t('profile.emailUpdateRequested'),
                    description: t('profile.emailConfirmationSent'),
                    icon: 'i-lucide-mail',
                    color: 'info',
                })
            }
        }

        if (success) {
            toast.add({
                title: t('common.success'),
                description: t('profile.updateSuccess'),
                icon: 'i-lucide-check',
                color: 'success',
            })
        }
    } catch {
        toast.add({
            title: t('common.error'),
            description: profileStore.getError || t('profile.updateError'),
            icon: 'i-lucide-alert-circle',
            color: 'error',
        })
    } finally {
        isSubmitting.value = false
    }
}

// --- Locale change ---
async function onLocaleChange(value: string) {
    selectedLocale.value = value
    setLocale(value as 'it' | 'en')
    await profileStore.updateProfile({ locale: value })
}

// --- Timezone change ---
async function onTimezoneChange(value: string) {
    selectedTimezone.value = value
    await profileStore.updateProfile({ timezone: value })
}

// --- Password submit ---
async function onPasswordSubmit(event: FormSubmitEvent<PasswordSchema>) {
    isPasswordSubmitting.value = true
    profileStore.clearError()

    try {
        const isValid = await profileStore.verifyCurrentPassword(event.data.current)
        if (!isValid) {
            toast.add({
                title: t('common.error'),
                description: t('profile.invalidCurrentPassword'),
                icon: 'i-lucide-alert-circle',
                color: 'error',
            })
            return
        }

        const success = await profileStore.updatePassword(event.data.current, event.data.new)

        if (success) {
            toast.add({
                title: t('common.success'),
                description: t('profile.passwordUpdateSuccess'),
                icon: 'i-lucide-check',
                color: 'success',
            })
            password.current = undefined
            password.new = undefined
            password.confirm = undefined
        } else {
            toast.add({
                title: t('common.error'),
                description: profileStore.getError || t('profile.passwordUpdateError'),
                icon: 'i-lucide-alert-circle',
                color: 'error',
            })
        }
    } catch {
        toast.add({
            title: t('common.error'),
            description: t('profile.passwordUpdateError'),
            icon: 'i-lucide-alert-circle',
            color: 'error',
        })
    } finally {
        isPasswordSubmitting.value = false
    }
}

// --- Delete account (GDPR Art. 17) ---
const isDeleteModalOpen = ref(false)
const isDeleting = ref(false)

async function onDeleteAccount() {
    isDeleting.value = true
    profileStore.clearError()

    try {
        const success = await profileStore.deleteAccount()
        if (success) {
            isDeleteModalOpen.value = false
            toast.add({
                title: t('common.success'),
                description: t('profile.deleteAccountSuccess'),
                icon: 'i-lucide-check',
                color: 'success',
            })
            await navigateTo(localePath('/'))
        } else {
            toast.add({
                title: t('common.error'),
                description: profileStore.getError || t('profile.deleteAccountError'),
                icon: 'i-lucide-alert-circle',
                color: 'error',
            })
        }
    } catch {
        toast.add({
            title: t('common.error'),
            description: t('profile.deleteAccountError'),
            icon: 'i-lucide-alert-circle',
            color: 'error',
        })
    } finally {
        isDeleting.value = false
    }
}
</script>

<template>
    <UDashboardPanel id="profile" :ui="{ body: 'lg:py-12' }">
        <template #header>
            <UDashboardNavbar :title="t('profile.title')">
                <template #leading>
                    <UDashboardSidebarCollapse />
                </template>
            </UDashboardNavbar>
        </template>

        <template #body>
            <div class="flex flex-col gap-4 sm:gap-6 lg:gap-12 w-full lg:max-w-2xl mx-auto">
    <div class="space-y-8">
        <!-- Section: Personal Information -->
        <UPageCard :title="t('profile.personalInfo')" variant="subtle">
            <UForm :schema="profileSchema" :state="profile" @submit="onProfileSubmit">
                <!-- Avatar Upload -->
                <div class="flex flex-col sm:flex-row items-start sm:items-center gap-6 mb-6">
                    <div class="relative group">
                        <div
                            class="size-24 rounded-full bg-default-100 overflow-hidden border-2 border-default-200 flex items-center justify-center">
                            <img
v-if="avatarUrl" :src="avatarUrl" :alt="t('profile.profilePhoto')"
                                class="w-full h-full object-cover" >
                            <UIcon v-else name="i-lucide-user" class="size-10 text-default-400" />
                        </div>
                        <button
type="button"
                            class="absolute bottom-0 right-0 bg-primary text-white p-1.5 rounded-full shadow-lg hover:scale-105 transition-transform"
                            :disabled="isUploading" @click="triggerFileInput">
                            <UIcon name="i-lucide-pencil" class="size-3.5" />
                        </button>
                    </div>
                    <div class="flex-1">
                        <h4 class="font-semibold text-default-900">{{ t('profile.profilePhoto') }}</h4>
                        <p class="text-sm text-default-500 mb-3">{{ t('profile.photoDescription') }}</p>
                        <div class="flex gap-2">
                            <UButton
:label="t('profile.uploadNew')" color="primary" size="sm" :loading="isUploading"
                                @click="triggerFileInput" />
                            <UButton
v-if="avatarUrl" :label="t('profile.removePhoto')" color="neutral" variant="soft"
                                size="sm" @click="removeAvatar" />
                        </div>
                    </div>
                    <input
ref="fileInputRef" type="file" accept="image/jpeg,image/png,image/gif,image/webp"
                        class="hidden" @change="onFileSelected" >
                </div>

                <USeparator class="mb-6" />

                <!-- Name, Email, Phone Grid -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <UFormField name="fullName" :label="t('profile.name')" required>
                        <UInput
v-model="profile.fullName" autocomplete="off" class="w-full"
                            :disabled="profileStore.isLoading" />
                    </UFormField>

                    <UFormField
name="email" :label="t('profile.email')" required
                        :help="profileStore.isOAuthUser ? t('profile.oauthEmailInfo') : undefined">
                        <UInput
v-model="profile.email" type="email" autocomplete="off" class="w-full"
                            :disabled="profileStore.isLoading || profileStore.isOAuthUser" />
                    </UFormField>

                    <UFormField name="phone" :label="t('profile.phone')">
                        <UInput
v-model="profile.phone" type="tel" autocomplete="off" class="w-full"
                            :disabled="profileStore.isLoading" />
                    </UFormField>

                    <div class="flex items-end">
                        <UButton
:label="t('common.saveChanges')" color="primary" type="submit"
                            :loading="isSubmitting || profileStore.isLoading"
                            :disabled="isSubmitting || profileStore.isLoading" class="w-full sm:w-auto" />
                    </div>
                </div>
            </UForm>
        </UPageCard>

        <!-- Section: Account Preferences -->
        <UPageCard :title="t('profile.preferences')" variant="subtle">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <UFormField :label="t('profile.language')">
                    <USelect
v-model="selectedLocale" :items="languageOptions" value-key="value" class="w-full"
                        @update:model-value="onLocaleChange" />
                </UFormField>

                <UFormField :label="t('profile.timezone')">
                    <USelect
v-model="selectedTimezone" :items="timezoneOptions" value-key="value" class="w-full"
                        @update:model-value="onTimezoneChange" />
                </UFormField>
            </div>
        </UPageCard>

        <!-- Section: Security -->
        <UPageCard :title="t('profile.security')" variant="subtle">
            <template v-if="!profileStore.isOAuthUser">
                <UForm
:schema="passwordSchema" :state="password" :validate="validatePassword"
                    @submit="onPasswordSubmit">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <UFormField name="current" :label="t('profile.currentPassword')">
                            <UInput
v-model="password.current" type="password" placeholder="••••••••" class="w-full"
                                autocomplete="current-password"
                                :disabled="isPasswordSubmitting || profileStore.isLoading" />
                        </UFormField>

                        <UFormField name="new" :label="t('profile.newPassword')">
                            <UInput
v-model="password.new" type="password"
                                :placeholder="t('profile.validation.passwordTooShort')" class="w-full"
                                autocomplete="new-password"
                                :disabled="isPasswordSubmitting || profileStore.isLoading" />
                        </UFormField>

                        <UFormField name="confirm" :label="t('profile.confirmPassword')">
                            <UInput
v-model="password.confirm" type="password" placeholder="••••••••" class="w-full"
                                autocomplete="new-password"
                                :disabled="isPasswordSubmitting || profileStore.isLoading" />
                        </UFormField>
                    </div>

                    <div class="flex justify-end mt-4">
                        <UButton
:label="t('profile.updatePassword')" color="neutral" type="submit"
                            :loading="isPasswordSubmitting || profileStore.isLoading"
                            :disabled="isPasswordSubmitting || profileStore.isLoading" />
                    </div>
                </UForm>
            </template>

            <template v-else>
                <div class="flex items-center gap-3 text-default-500">
                    <UIcon name="i-lucide-info" class="w-5 h-5 shrink-0" />
                    <p>{{ t('profile.oauthPasswordInfo') }}</p>
                </div>
            </template>
        </UPageCard>

        <!-- Section: Two-Factor Authentication -->
        <ProfileTwoFactorSetup />

        <!-- Section: Data Export (GDPR Art. 20) -->
        <ProfileDataExportSection />

        <!-- Section: Danger Zone (GDPR Art. 17) -->
        <UPageCard :title="t('profile.dangerZone')" variant="subtle">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h4 class="font-semibold text-default-900">{{ t('profile.deleteAccount') }}</h4>
                    <p class="text-sm text-default-500">{{ t('profile.deleteAccountDescription') }}</p>
                </div>
                <UButton
                    :label="t('profile.deleteAccount')" color="error" variant="soft"
                    icon="i-lucide-trash-2" class="shrink-0" @click="isDeleteModalOpen = true" />
            </div>
        </UPageCard>
    </div>
            </div>
        </template>

        <UModal v-model:open="isDeleteModalOpen">
            <template #content>
                <div class="p-6 space-y-5">
                    <div class="flex items-start gap-3">
                        <div class="flex items-center justify-center size-10 rounded-full bg-error/10 shrink-0">
                            <UIcon name="i-lucide-alert-triangle" class="size-5 text-error" />
                        </div>
                        <div>
                            <h3 class="font-semibold text-default-900">{{ t('profile.deleteAccountConfirmTitle') }}</h3>
                            <p class="text-sm text-default-500 mt-1">{{ t('profile.deleteAccountWarning') }}</p>
                        </div>
                    </div>
                    <div class="flex justify-end gap-2">
                        <UButton
                            :label="t('common.cancel')" color="neutral" variant="ghost"
                            :disabled="isDeleting" @click="isDeleteModalOpen = false" />
                        <UButton
                            :label="t('profile.deleteAccountConfirm')" color="error"
                            :loading="isDeleting" :disabled="isDeleting" @click="onDeleteAccount" />
                    </div>
                </div>
            </template>
        </UModal>
    </UDashboardPanel>
</template>
