<script setup lang="ts">
definePageMeta({
    layout: 'auth',
    auth: false
})

const { loggedIn, fetchSession } = useAuth()
const router = useRouter()
const route = useRoute()

onMounted(async () => {
    // Fetch the session after OAuth callback
    await fetchSession()

    // Redirect based on authentication status
    if (loggedIn.value) {
        const redirectTo = (route.query.redirect as string) || '/dashboard'
        await router.push(redirectTo)
    } else {
        await router.push('/login')
    }
})
</script>

<template>
    <div class="flex items-center justify-center h-screen">
        <div class="text-center">
            <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary" />
            <p class="mt-4 text-muted">Verifying login...</p>
        </div>
    </div>
</template>
