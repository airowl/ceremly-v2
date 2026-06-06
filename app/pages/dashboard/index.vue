<script setup lang="ts">
definePageMeta({
    title: 'Dashboard',
    layout: 'dashboard',
})
</script>

<template>
    <UDashboardPanel id="home">
        <template #header>
            <UDashboardNavbar :ui="{ right: 'gap-3' }">
                <template #leading>
                    <UDashboardSidebarCollapse />
                </template>

                <template #left>
                    <AdminHomeTopBar />
                </template>

                <template #right>
                    <AdminHomeTopBarActions />
                </template>
            </UDashboardNavbar>
        </template>

        <template #body>
            <div class="space-y-6">
                <!-- Stat Cards -->
                <AdminHomeStatCards />

                <!-- Charts Row -->
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div class="lg:col-span-2">
                        <AdminHomeResponseChart />
                    </div>
                    <div class="lg:col-span-1">
                        <AdminHomeDonutChart />
                    </div>
                </div>

            </div>
        </template>
    </UDashboardPanel>
</template>
