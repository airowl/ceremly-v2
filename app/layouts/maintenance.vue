<template>
    <div class="min-h-screen flex flex-col bg-[#FAF9F6] dark:bg-gray-950">
        <MaintenanceHeader />

        <UMain class="flex-1">
            <slot />
        </UMain>
    </div>
</template>
