<script setup lang="ts">
import type { BlogTag } from '~/shared/utils/blog'

const { t, locale } = useI18n()
const localePath = useLocalePath()
const toast = useToast()

defineProps<{
    tags: BlogTag[]
}>()

const email = ref('')
const honeypot = ref('')
const loading = ref(false)
const submitted = ref(false)
const formLoadedAt = ref(0)

onMounted(() => {
    formLoadedAt.value = Date.now()
})

async function onSubmit() {
    if (!email.value || submitted.value) return

    loading.value = true
    try {
        const language = locale.value.startsWith('it') ? 'it' : 'en'
        const data = await $fetch('/api/waiting-list/subscribe', {
            method: 'POST',
            body: {
                email: email.value,
                language,
                website: honeypot.value,
                _t: formLoadedAt.value,
                source: 'blog-sidebar',
            },
        })

        if (data?.alreadySubscribed) {
            toast.add({ title: t('blog.newsletter.alreadySubscribed'), color: 'warning' })
        } else {
            toast.add({
                title: t('blog.newsletter.successTitle'),
                description: t('blog.newsletter.successDescription'),
                color: 'success',
                icon: 'i-lucide-check-circle',
            })
            submitted.value = true
        }
        email.value = ''
    } catch {
        toast.add({
            title: t('blog.newsletter.errorTitle'),
            description: t('blog.newsletter.errorDescription'),
            color: 'error',
        })
    } finally {
        loading.value = false
    }
}
</script>

<template>
    <aside class="sticky top-24 space-y-8">
        <!-- Newsletter CTA -->
        <!-- <div class="rounded-2xl bg-gray-900 p-6 text-white">
            <h3 class="mb-2 text-lg font-bold">
                {{ t('blog.sidebar.ctaTitle') }}
            </h3>
            <p class="mb-4 text-sm text-gray-400">
                {{ t('blog.sidebar.ctaDescription') }}
            </p>

            <form class="space-y-3" @submit.prevent="onSubmit">
                <div class="sidebar-hp" aria-hidden="true" tabindex="-1">
                    <input v-model="honeypot" type="text" name="website" autocomplete="off" tabindex="-1">
                </div>

                <input v-model="email" type="email" :placeholder="t('blog.newsletter.placeholder')" required
                    :disabled="loading || submitted"
                    class="w-full rounded-lg border-0 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:ring-2 focus:ring-primary-500">

                <button type="submit" :disabled="loading || submitted || !email"
                    class="w-full rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-600 transition-colors disabled:opacity-60">
                    {{ submitted ? t('blog.newsletter.subscribed') : t('blog.sidebar.ctaButton') }}
                </button>
            </form>
        </div> -->

        <!-- Category Explorer -->
        <div class="rounded-2xl bg-white p-6 ring-1 ring-gray-100">
            <h3 class="mb-4 text-base font-bold text-gray-900">
                {{ t('blog.sidebar.categoriesTitle') }}
            </h3>

            <div class="space-y-2">
                <NuxtLink v-for="tag in tags" :key="tag.name"
                    :to="{ path: localePath('/blogs'), query: { tag: tag.name } }"
                    class="flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-gray-50">
                    <span class="font-medium text-gray-700">{{ tag.name }}</span>
                    <span class="text-xs text-gray-400">{{ tag.count }}</span>
                </NuxtLink>
            </div>
        </div>
    </aside>
</template>

<style scoped>
.sidebar-hp {
    position: absolute;
    left: -9999px;
    top: -9999px;
    width: 0;
    height: 0;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
}
</style>
