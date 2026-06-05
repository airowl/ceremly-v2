<script setup lang="ts">
import { useUserStore } from '~/stores/userStore'

const { t } = useI18n()
const userStore = useUserStore()

const isModalOpen = ref(false)

const userInitials = computed(() => {
    const name = userStore.user?.name || userStore.user?.email || ''
    return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
})
</script>

<template>
    <div class="flex items-center gap-3">
        <UInput
            :placeholder="t('dashboard.home.search.placeholder')"
            icon="i-lucide-search"
            size="sm"
            variant="outline"
            class="w-64 hidden sm:block"
        />

        <UButton
            :label="t('dashboard.home.newEvent')"
            icon="i-lucide-plus"
            color="primary"
            size="sm"
            class="font-bold"
            @click="isModalOpen = true"
        />

        <div class="flex items-center gap-3 pl-4 border-l border-default">
            <div class="relative">
                <UButton
                    icon="i-lucide-bell"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    square
                />
                <span class="absolute top-0.5 right-0.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-[var(--ui-bg)]" />
            </div>

            <UAvatar
                :text="userInitials"
                :alt="userStore.user?.name || ''"
                size="sm"
                class="cursor-pointer ring-2 ring-primary/20"
            />
        </div>

        <AdminHomeCreateEventModal v-model="isModalOpen" />
    </div>
</template>
