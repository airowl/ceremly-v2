<script setup lang="ts">
definePageMeta({
    auth: false,
    layout: 'landing',
})

const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { extractTags } = useBlog()
const runtimeConfig = useRuntimeConfig()
const baseUrl = ((runtimeConfig.public.baseURL as string) || '').replace(/\/$/, '')

const currentLocale = computed(() => locale.value.startsWith('it') ? 'it' : 'en')

// SEO
const blogOgImage = computed(() => {
    const suffix = locale.value.startsWith('it') ? 'it' : 'en'
    return `${baseUrl}/og/blog-${suffix}.png`
})

useSeoMeta({
    title: () => t('blog.seo.title'),
    description: () => t('blog.seo.description'),
    ogTitle: () => t('blog.seo.title'),
    ogDescription: () => t('blog.seo.description'),
    ogType: 'website',
    ogImage: blogOgImage,
    twitterCard: 'summary_large_image',
    twitterImage: blogOgImage,
})

// Fetch all published articles
const { data: allArticles } = await useAsyncData('blog-list', () =>
    queryCollection('blog')
        .order('date', 'DESC')
        .all(),
)

// Computed: published articles filtered by current locale
const articles = computed(() => {
    const list = Array.isArray(allArticles.value) ? allArticles.value : []
    return list.filter((a: any) => a.published !== false && a.locale === currentLocale.value)
})

// Tags
const tags = computed(() => extractTags(articles.value))

// Active tag filter from URL
const activeTag = computed(() => (route.query.tag as string) || '')

// Filtered articles
const filteredArticles = computed(() => {
    if (!activeTag.value) return articles.value
    return articles.value.filter((a: any) =>
        a.tags?.includes(activeTag.value),
    )
})

// Featured article (only when no tag filter)
const featuredArticle = computed(() => {
    if (activeTag.value) return null
    return articles.value.find((a: any) => a.featured) || null
})

// Non-featured articles for the grid
const gridArticles = computed(() => {
    const list = filteredArticles.value
    if (featuredArticle.value && !activeTag.value) {
        return list.filter((a: any) => a.path !== featuredArticle.value!.path)
    }
    return list
})

// Pagination
const currentPage = computed(() => Number(route.query.page) || 1)
const perPage = 6
const totalPages = computed(() => Math.ceil(gridArticles.value.length / perPage))
const paginatedArticles = computed(() => {
    const start = (currentPage.value - 1) * perPage
    return gridArticles.value.slice(start, start + perPage)
})

function goToPage(page: number) {
    navigateTo({
        path: route.path,
        query: {
            ...route.query,
            page: page > 1 ? String(page) : undefined,
        },
    })
}
</script>

<template>
    <div class="min-h-screen bg-[#FAF9F6]">
        <!-- Hero -->
        <section class="border-b border-primary-200 bg-papaya-50 py-16 md:py-20">
            <div class="mx-auto max-w-7xl px-6 text-center lg:px-8">
                <div
                    class="mb-4 inline-flex items-center gap-2 rounded-full border border-primary-500/20 bg-primary-500/5 px-4 py-1.5 text-sm font-medium text-primary-500">
                    <span class="material-symbols-outlined text-base">auto_stories</span>
                    {{ t('blog.hero.badge') }}
                </div>
                <h1 class="mx-auto max-w-3xl text-3xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
                    {{ t('blog.hero.title') }}
                </h1>
                <p class="mx-auto mt-4 max-w-2xl text-lg text-gray-500">
                    {{ t('blog.hero.subtitle') }}
                </p>
            </div>
        </section>

        <!-- Tag Filter -->
        <BlogTagFilter v-if="tags.length" :tags="tags" />

        <div class="mx-auto max-w-7xl px-6 py-12 lg:px-8">
            <!-- Featured Card -->
            <BlogFeaturedCard v-if="featuredArticle" :article="featuredArticle" class="mb-12" />

            <!-- Filter status -->
            <div v-if="activeTag" class="mb-8 flex items-center justify-between">
                <p class="text-sm text-gray-500">
                    {{ t('blog.filter.showing') }}
                    <span class="font-semibold text-gray-900">{{ activeTag }}</span>
                    ({{ filteredArticles.length }})
                </p>
                <button class="text-sm font-medium text-primary-500 hover:text-primary-600 transition-colors"
                    @click="navigateTo({ path: route.path })">
                    {{ t('blog.filter.clearFilter') }}
                </button>
            </div>

            <!-- No results -->
            <div v-if="!paginatedArticles.length" class="py-20 text-center">
                <span class="material-symbols-outlined mb-4 text-5xl text-gray-300">search_off</span>
                <p class="text-lg font-medium text-gray-500">{{ t('blog.filter.noResults') }}</p>
            </div>

            <!-- Article Grid -->
            <div v-else class="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                <BlogArticleCard v-for="article in paginatedArticles" :key="article.path" :article="article" />
            </div>

            <!-- Pagination -->
            <nav v-if="totalPages > 1" class="mt-12 flex items-center justify-center gap-2">
                <button :disabled="currentPage <= 1"
                    class="flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40"
                    :class="currentPage > 1 ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-400'"
                    @click="goToPage(currentPage - 1)">
                    <span class="material-symbols-outlined text-base">chevron_left</span>
                    {{ t('blog.pagination.previous') }}
                </button>

                <div class="flex gap-1">
                    <button v-for="page in totalPages" :key="page"
                        class="h-10 w-10 rounded-lg text-sm font-medium transition-colors" :class="page === currentPage
                            ? 'bg-gray-900 text-white'
                            : 'text-gray-700 hover:bg-gray-100'" @click="goToPage(page)">
                        {{ page }}
                    </button>
                </div>

                <button :disabled="currentPage >= totalPages"
                    class="flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40"
                    :class="currentPage < totalPages ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-400'"
                    @click="goToPage(currentPage + 1)">
                    {{ t('blog.pagination.next') }}
                    <span class="material-symbols-outlined text-base">chevron_right</span>
                </button>
            </nav>
        </div>

        <!-- Newsletter CTA -->
        <!-- <div class="mx-auto max-w-7xl px-6 lg:px-8">
            <BlogNewsletter />
        </div> -->
    </div>
</template>
