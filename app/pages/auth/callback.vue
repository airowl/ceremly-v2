<script setup lang="ts">
definePageMeta({
    layout: 'auth',
    auth: false
})

const { t } = useI18n()
const { loggedIn, fetchSession } = useAuth()
const router = useRouter()
const route = useRoute()

onMounted(async () => {
    // Fetch the session after OAuth callback
    await fetchSession()

    // Redirect based on authentication status
    if (loggedIn.value) {
        // Solo path relativo same-origin (no open-redirect post-auth).
        const raw = route.query.redirect
        const path = typeof raw === 'string' ? raw : ''
        await router.push(/^\/(?!\/)/.test(path) ? path : '/dashboard')
    } else {
        await router.push('/login')
    }
})
</script>

<template>
    <div class="flex items-center justify-center h-screen">
        <div class="text-center">
            <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary" />
            <p class="mt-4 text-muted">{{ t('ceremly.login.verifying') }}</p>
        </div>
    </div>
</template>
