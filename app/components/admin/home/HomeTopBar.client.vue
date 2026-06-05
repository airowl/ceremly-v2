<script setup lang="ts">
import { useUserStore } from '~/stores/userStore'

const userStore = useUserStore()
const { t } = useI18n()

const userName = computed(() => {
    const user = userStore.user
    if (!user) return ''
    if (user.name) return user.name
    return user.email?.split('@')[0] || ''
})
</script>

<template>
    <div>
        <h1 class="text-2xl font-extrabold text-highlighted">
            {{ t('dashboard.home.welcome.greeting', { name: userName }) }}
        </h1>
        <p class="text-sm text-muted mt-1">
            {{ t('dashboard.home.welcome.subtitle') }}
        </p>
    </div>
</template>
