<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'

defineProps<{
    title?: string
    breadcrumbs?: BreadcrumbItem[]
    backTo?: string
}>()
</script>

<template>
    <UDashboardNavbar :title="!$slots.title && !breadcrumbs ? title : undefined">
        <template #leading>
            <UButton
                v-if="backTo"
                icon="i-lucide-arrow-left"
                color="neutral"
                variant="ghost"
                size="sm"
                :to="backTo"
            />
            <UDashboardSidebarCollapse v-else />
        </template>
        <template v-if="$slots.title || breadcrumbs" #title>
            <slot v-if="$slots.title" name="title" />
            <UBreadcrumb v-else-if="breadcrumbs" :items="breadcrumbs" />
        </template>
        <template v-if="$slots.actions" #right>
            <slot name="actions" />
        </template>
    </UDashboardNavbar>
</template>
