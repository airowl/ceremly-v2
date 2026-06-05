<script setup lang="ts">
definePageMeta({
    layout: 'auth',
    auth: false
})

useSeoMeta({
    title: 'Logout',
    description: 'Logging out of your account'
})

const { signOut } = useAuth()

onMounted(async () => {
    await signOut({ redirectTo: '/login' })
})
</script>

<template>
    <div class="flex items-center justify-center h-screen">
        <div class="text-center">
            <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary" />
            <p class="mt-4 text-muted">Logging out...</p>
        </div>
    </div>
</template>
