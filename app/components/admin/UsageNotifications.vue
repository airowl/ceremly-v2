<script setup lang="ts">
import { useUsageNotifications } from '~/composables/useUsageNotifications';

const {
    warningNotifications,
    errorNotifications,
    dismissNotification
} = useUsageNotifications();
</script>

<template>
    <div class="space-y-3">
        <!-- Notifiche di errore (limiti raggiunti) -->
        <div
v-for="notification in errorNotifications" :key="notification.id"
             class="p-4 border border-red-200 bg-red-50 rounded-lg">
            <div class="flex items-start gap-3">
                <UIcon name="i-lucide-alert-triangle" class="size-5 text-red-600 shrink-0 mt-0.5" />
                <div class="flex-1">
                    <h4 class="font-medium text-red-900">{{ notification.title }}</h4>
                    <p class="text-sm text-red-700 mt-1">{{ notification.message }}</p>
                    <div v-if="notification.actionUrl" class="mt-3">
                        <NuxtLink
                            :to="notification.actionUrl"
                            class="inline-flex items-center px-3 py-1.5 text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-md transition-colors"
                        >
                            {{ notification.actionText || 'Azione' }}
                            <UIcon name="i-lucide-arrow-right" class="size-3 ml-1" />
                        </NuxtLink>
                    </div>
                </div>
                <UButton
                    icon="i-lucide-x"
                    size="xs"
                    variant="ghost"
                    color="error"
                    @click="dismissNotification(notification.id)"
                />
            </div>
        </div>

        <!-- Notifiche di avviso (limiti vicini) -->
        <div
v-for="notification in warningNotifications" :key="notification.id"
             class="p-4 border border-yellow-200 bg-yellow-50 rounded-lg">
            <div class="flex items-start gap-3">
                <UIcon name="i-lucide-alert-circle" class="size-5 text-yellow-600 shrink-0 mt-0.5" />
                <div class="flex-1">
                    <h4 class="font-medium text-yellow-900">{{ notification.title }}</h4>
                    <p class="text-sm text-yellow-700 mt-1">{{ notification.message }}</p>
                    <div v-if="notification.actionUrl" class="mt-3">
                        <NuxtLink
                            :to="notification.actionUrl"
                            class="inline-flex items-center px-3 py-1.5 text-xs font-medium text-yellow-700 bg-yellow-100 hover:bg-yellow-200 rounded-md transition-colors"
                        >
                            {{ notification.actionText || 'Azione' }}
                            <UIcon name="i-lucide-arrow-right" class="size-3 ml-1" />
                        </NuxtLink>
                    </div>
                </div>
                <UButton
                    icon="i-lucide-x"
                    size="xs"
                    variant="ghost"
                    color="warning"
                    @click="dismissNotification(notification.id)"
                />
            </div>
        </div>
    </div>
</template>