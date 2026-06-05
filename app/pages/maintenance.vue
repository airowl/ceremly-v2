<script setup lang="ts">
definePageMeta({
    layout: 'maintenance',
    auth: false
});

const { t } = useI18n();

const title = t("maintenance.title");
const description = t("maintenance.description");

useSeoMeta({
    titleTemplate: "",
    title,
    ogTitle: title,
    description,
    ogDescription: description,
});

const features = computed(() => [
    {
        icon: 'i-heroicons-calendar',
        title: t('maintenance.features.feature1.title'),
        description: t('maintenance.features.feature1.description')
    },
    {
        icon: 'i-heroicons-user-group',
        title: t('maintenance.features.feature2.title'),
        description: t('maintenance.features.feature2.description')
    },
    {
        icon: 'i-heroicons-chart-bar',
        title: t('maintenance.features.feature3.title'),
        description: t('maintenance.features.feature3.description')
    }
]);

const stats = computed(() => [
    { label: t('maintenance.stats.stat1'), value: '99.9%' },
    { label: t('maintenance.stats.stat2'), value: '24/7' },
    { label: t('maintenance.stats.stat3'), value: '<30min' }
]);
</script>

<template>
    <div>
            <UContainer class="flex flex-col justify-center items-center py-16 lg:py-24">
                <div class="text-center max-w-4xl mx-auto space-y-8">
                    <!-- Icon -->
                    <div class="flex justify-center">
                        <UIcon name="i-heroicons-wrench-screwdriver" class="w-24 h-24 text-primary animate-pulse" />
                    </div>

                    <!-- Badge -->
                    <UBadge color="primary" variant="subtle" size="lg" class="mb-4">
                        {{ $t('maintenance.badge') }}
                    </UBadge>

                    <!-- Title -->
                    <h1 class="text-4xl lg:text-6xl font-bold text-gray-900 dark:text-white">
                        {{ $t('maintenance.title') }}
                    </h1>

                    <!-- Description -->
                    <p class="text-xl lg:text-2xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
                        {{ $t('maintenance.description') }}
                    </p>

                    <!-- CTA Section -->
                    <div class="flex flex-col sm:flex-row gap-4 justify-center items-center mt-8">
                        <UButton size="xl" color="primary" icon="i-heroicons-bell-alert" :to="'#waiting-list'">
                            {{ $t('maintenance.cta.notify') }}
                        </UButton>

                        <UButton size="xl" color="neutral" variant="outline" icon="i-heroicons-information-circle"
                            external to="mailto:support@example.com">
                            {{ $t('maintenance.cta.contact') }}
                        </UButton>
                    </div>

                    <!-- Stats -->
                    <div class="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-8">
                        <div v-for="(stat, index) in stats" :key="index" class="flex flex-col items-center">
                            <UBadge color="primary" variant="subtle" size="md" class="mb-2">
                                {{ stat.value }}
                            </UBadge>
                            <p class="text-sm text-gray-600 dark:text-gray-400">
                                {{ stat.label }}
                            </p>
                        </div>
                    </div>
                </div>
            </UContainer>

            <!-- Features Preview Section -->
            <UContainer class="py-16 lg:py-24 bg-gray-50 dark:bg-gray-900">
                <div class="text-center mb-12">
                    <h2 class="text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white mb-4">
                        {{ $t('maintenance.features.title') }}
                    </h2>
                    <p class="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
                        {{ $t('maintenance.features.description') }}
                    </p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <UCard v-for="(feature, index) in features" :key="index" class="text-center">
                        <template #header>
                            <div class="flex justify-center mb-4">
                                <UIcon :name="feature.icon" class="w-12 h-12 text-primary" />
                            </div>
                            <h3 class="text-xl font-semibold text-gray-900 dark:text-white">
                                {{ feature.title }}
                            </h3>
                        </template>

                        <p class="text-gray-600 dark:text-gray-300">
                            {{ feature.description }}
                        </p>
                    </UCard>
                </div>
            </UContainer>

            <!-- Waiting List Section -->
            <UContainer id="waiting-list" class="py-16 lg:py-24">
                <LandingNewsletterCTA />
            </UContainer>

            <!-- Footer -->
            <UContainer class="py-8 border-t border-gray-200 dark:border-gray-800">
                <div
                    class="flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                    <p>© 2025 Your Company. {{ $t('maintenance.footer.rights') }}</p>
                    <div class="flex gap-4">
                        <NuxtLink to="/legal/tos" class="hover:text-primary transition-colors">
                            {{ $t('maintenance.footer.terms') }}
                        </NuxtLink>
                        <span>•</span>
                        <a href="mailto:support@example.com" class="hover:text-primary transition-colors">
                            {{ $t('maintenance.footer.contact') }}
                        </a>
                    </div>
                </div>
            </UContainer>
    </div>
</template>
