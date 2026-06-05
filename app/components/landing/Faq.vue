<script setup lang="ts">
const { t } = useI18n();

const faqItems = computed(() => [
    {
        label: t('landing.faq.questions.q1.question'),
        content: t('landing.faq.questions.q1.answer'),
        icon: 'i-heroicons-device-phone-mobile'
    },
    {
        label: t('landing.faq.questions.q2.question'),
        content: t('landing.faq.questions.q2.answer'),
        icon: 'i-heroicons-arrow-up-tray'
    },
    {
        label: t('landing.faq.questions.q3.question'),
        content: t('landing.faq.questions.q3.answer'),
        icon: 'i-heroicons-envelope'
    },
    {
        label: t('landing.faq.questions.q4.question'),
        content: t('landing.faq.questions.q4.answer'),
        icon: 'i-heroicons-photo'
    },
    {
        label: t('landing.faq.questions.q5.question'),
        content: t('landing.faq.questions.q5.answer'),
        icon: 'i-heroicons-arrow-path'
    },
    {
        label: t('landing.faq.questions.q6.question'),
        content: t('landing.faq.questions.q6.answer'),
        icon: 'i-heroicons-sparkles'
    }
]);
</script>

<template>
    <UPageSection class="relative overflow-hidden">
        <template #header>
            <div class="text-center space-y-4 animate-fade-in">
                <span class="text-primary font-semibold text-sm uppercase tracking-wider block">
                    FAQ
                </span>
                <h2 class="text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white animate-slide-up">
                    {{ t('landing.faq.title') }}
                </h2>
                <p class="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto animate-slide-up animation-delay-100">
                    {{ t('landing.faq.subtitle') }}
                </p>
            </div>
        </template>

        <div class="mt-12 w-full max-w-4xl mx-auto animate-fade-in animation-delay-200">
            <UAccordion
                :items="faqItems"
                type="multiple"
                :ui="{
                    root: 'space-y-2 w-full',
                    item: 'w-full border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden hover:shadow-md hover:border-primary/30',
                    header: 'min-h-[88px] flex items-center',
                    trigger: 'flex-1 flex items-center gap-3 px-5 py-6 text-left hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors duration-200',
                    content: 'border-t border-gray-200 dark:border-gray-800',
                    body: 'px-5 py-4 text-gray-600 dark:text-gray-400 leading-relaxed',
                    leadingIcon: 'hidden',
                    trailingIcon: 'w-5 h-5 text-gray-400 transition-transform duration-200 shrink-0'
                }"
            >
                <template #leading="{ item }">
                    <div class="shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <UIcon
                            :name="item.icon"
                            class="w-5 h-5 text-primary"
                        />
                    </div>
                </template>

                <template #default="{ item }">
                    <span class="text-base font-semibold text-gray-900 dark:text-white leading-tight">
                        {{ item.label }}
                    </span>
                </template>
            </UAccordion>
        </div>

        <!-- Decorative elements -->
        <div class="absolute top-0 left-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl -z-10 animate-pulse-slow pointer-events-none" />
        <div class="absolute bottom-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl -z-10 animate-pulse-slow animation-delay-1000 pointer-events-none" />
    </UPageSection>
</template>

<style scoped>
@keyframes fade-in {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}

@keyframes slide-up {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes pulse-slow {
    0%, 100% {
        opacity: 0.3;
    }
    50% {
        opacity: 0.5;
    }
}

.animate-fade-in {
    animation: fade-in 0.6s ease-out forwards;
}

.animate-slide-up {
    animation: slide-up 0.6s ease-out forwards;
}

.animate-pulse-slow {
    animation: pulse-slow 4s ease-in-out infinite;
}

.animation-delay-100 {
    animation-delay: 0.1s;
}

.animation-delay-200 {
    animation-delay: 0.2s;
}

.animation-delay-1000 {
    animation-delay: 1s;
}
</style>
