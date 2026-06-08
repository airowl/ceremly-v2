<script setup lang="ts">
definePageMeta({
    auth: false,
    layout: 'landing',
})

const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const slug = route.params.slug as string
const { formatArticleDate, calculateReadingTime, extractTags } = useBlog()
const runtimeConfig = useRuntimeConfig()
const baseUrl = ((runtimeConfig.public.baseURL as string) || '').replace(/\/$/, '')

const currentLocale = computed(() => locale.value.startsWith('it') ? 'it' : 'en')

// Fetch article
const { data: article } = await useAsyncData(`blog-${slug}`, () =>
    queryCollection('blog').path(`/blogs/${slug}`).first(),
)

if (!article.value) {
    throw createError({ statusCode: 404, statusMessage: 'Article not found' })
}

// Fetch all articles for related + sidebar tags
const { data: allArticles } = await useAsyncData('blog-all-for-related', () =>
    queryCollection('blog').order('date', 'DESC').all(),
)

const publishedArticles = computed(() => {
    const list = Array.isArray(allArticles.value) ? allArticles.value : []
    return list.filter((a: any) => a.published !== false)
})

// Filter by current locale for sidebar tags and related articles
const localeArticles = computed(() =>
    publishedArticles.value.filter((a: any) => a.locale === currentLocale.value),
)

const allTags = computed(() => extractTags(localeArticles.value))

// Related articles (same first tag, same locale, excluding current)
const relatedArticles = computed(() => {
    const firstTag = article.value?.tags?.[0]
    if (!firstTag) return []
    return localeArticles.value
        .filter((a: any) => a.path !== article.value!.path && a.tags?.includes(firstTag))
        .slice(0, 3)
})

// Find translated version of this article
const translatedArticle = computed(() => {
    const slug = article.value?.translationSlug
    if (!slug) return null
    return publishedArticles.value.find(
        (a: any) => a.translationSlug === slug && a.path !== article.value!.path,
    ) || null
})

const formattedDate = computed(() => {
    if (!article.value?.date) return ''
    return formatArticleDate(article.value.date, locale.value)
})

const readingTime = computed(() => {
    const text = (article.value as any)?.body?.rawText || article.value?.description || ''
    return calculateReadingTime(text)
})

const firstTag = computed(() => article.value?.tags?.[0] || '')

// Watch locale changes and redirect to translated article
watch(locale, (newLocale) => {
    const targetLocale = newLocale.startsWith('it') ? 'it' : 'en'
    if (article.value?.locale !== targetLocale && translatedArticle.value) {
        navigateTo(localePath(translatedArticle.value.path, targetLocale), { replace: true })
    }
})

// SEO — prefer dedicated OG image from /og/ folder, fallback to article cover
const knownOgSlugs = new Set<string>([])

const articleOgImage = computed(() => {
    if (knownOgSlugs.has(slug)) {
        return `${baseUrl}/og/${slug}.png`
    }
    return article.value?.cover ? `${baseUrl}${article.value.cover}` : undefined
})

useSeoMeta({
    title: () => article.value?.title || '',
    description: () => article.value?.description || '',
    ogTitle: () => article.value?.title || '',
    ogDescription: () => article.value?.description || '',
    ogType: 'article',
    ogImage: articleOgImage,
    ogImageAlt: () => article.value?.coverAlt || article.value?.title || '',
    twitterCard: 'summary_large_image',
    twitterImage: articleOgImage,
})

// Structured Data via nuxt-schema-org
useSchemaOrg([
    defineArticle({
        '@type': 'BlogPosting',
        'headline': computed(() => article.value?.title || ''),
        'description': computed(() => article.value?.description || ''),
        'datePublished': computed(() => article.value?.date || ''),
        'author': computed(() => ({
            name: article.value?.author || '',
        })),
        'image': computed(() => article.value?.cover ? `${baseUrl}${article.value.cover}` : undefined),
        'keywords': computed(() => article.value?.tags || []),
        'inLanguage': computed(() => article.value?.locale === 'en' ? 'en-US' : 'it-IT'),
    }),
])

// Share
const shareUrl = computed(() => `${baseUrl}${article.value?.locale === 'en' ? '/en' : ''}${article.value?.path || ''}`)
const shareTitle = computed(() => article.value?.title || '')
const linkCopied = ref(false)

function shareOnWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${shareTitle.value} ${shareUrl.value}`)}`, '_blank')
}
function shareOnX() {
    window.open(`https://x.com/intent/tweet?url=${encodeURIComponent(shareUrl.value)}&text=${encodeURIComponent(shareTitle.value)}`, '_blank')
}
function shareOnFacebook() {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl.value)}`, '_blank')
}
function shareOnLinkedIn() {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl.value)}`, '_blank')
}
async function copyLink() {
    await navigator.clipboard.writeText(shareUrl.value)
    linkCopied.value = true
    setTimeout(() => linkCopied.value = false, 2000)
}

// Hreflang for translated blog articles (different slugs, not auto-detected by i18n)
useHead({
    link: computed(() => {
        const links: Array<{ rel: string, hreflang: string, href: string }> = []
        if (translatedArticle.value) {
            const translatedLocale = article.value?.locale === 'it' ? 'en' : 'it'
            const hreflang = translatedLocale === 'en' ? 'en-US' : 'it-IT'
            links.push({
                rel: 'alternate',
                hreflang,
                href: `${baseUrl}${translatedLocale === 'en' ? '/en' : ''}${translatedArticle.value.path}`,
            })
        }
        return links
    }),
})
</script>

<template>
    <div v-if="article" class="min-h-screen bg-[#FAF9F6]">
        <!-- Breadcrumb -->
        <div class="border-b border-primary-200 bg-papaya-50">
            <div class="mx-auto max-w-7xl px-6 py-4 lg:px-8">
                <nav class="flex items-center gap-2 text-sm text-gray-500">
                    <NuxtLink :to="localePath('/')" class="hover:text-gray-700 transition-colors">
                        {{ t('blog.article.breadcrumbHome') }}
                    </NuxtLink>
                    <span class="material-symbols-outlined text-xs">chevron_right</span>
                    <NuxtLink :to="localePath('/blogs')" class="hover:text-gray-700 transition-colors">
                        Blog
                    </NuxtLink>
                    <span v-if="firstTag" class="material-symbols-outlined text-xs">chevron_right</span>
                    <NuxtLink v-if="firstTag" :to="{ path: localePath('/blogs'), query: { tag: firstTag } }"
                        class="hover:text-gray-700 transition-colors">
                        {{ firstTag }}
                    </NuxtLink>
                </nav>
            </div>
        </div>

        <!-- Article Header -->
        <header class="border-b border-primary-200 bg-papaya-50 py-12 md:py-16">
            <div class="mx-auto max-w-3xl px-6 text-center lg:px-8">
                <div v-if="firstTag" class="mb-4">
                    <NuxtLink :to="{ path: localePath('/blogs'), query: { tag: firstTag } }"
                        class="inline-flex items-center rounded-full bg-primary-50 px-3 py-1 text-sm font-semibold text-primary-600 hover:bg-primary-100 transition-colors">
                        {{ firstTag }}
                    </NuxtLink>
                </div>

                <h1 class="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl lg:text-5xl leading-tight">
                    {{ article.title }}
                </h1>

                <div class="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm text-gray-500">
                    <div class="flex items-center gap-2">
                        <div
                            class="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-600">
                            <span class="material-symbols-outlined text-base">person</span>
                        </div>
                        <span class="font-medium text-gray-700">{{ article.author }}</span>
                    </div>
                    <span class="text-gray-300">&middot;</span>
                    <span>{{ formattedDate }}</span>
                    <span class="text-gray-300">&middot;</span>
                    <span>{{ readingTime }} {{ t('blog.card.minRead') }}</span>
                </div>
            </div>
        </header>

        <!-- Language Switch Banner -->
        <div v-if="translatedArticle" class="border-b border-primary-100 bg-primary-50/50">
            <div class="mx-auto max-w-7xl px-6 py-3 lg:px-8">
                <div class="flex items-center justify-center gap-2 text-sm">
                    <span class="material-symbols-outlined text-base text-primary-500">translate</span>
                    <span class="text-gray-600">
                        {{ article.locale === 'it' ? t('blog.article.readInEnglish') : t('blog.article.readInItalian') }}
                    </span>
                    <NuxtLink
                        :to="localePath(translatedArticle.path, article.locale === 'it' ? 'en' : 'it')"
                        class="font-semibold text-primary-600 hover:text-primary-700 transition-colors underline underline-offset-2">
                        {{ translatedArticle.title }}
                    </NuxtLink>
                </div>
            </div>
        </div>

        <!-- Cover Image -->
        <div class="mx-auto -mt-1 max-w-5xl px-6 py-8 lg:px-8">
            <div class="aspect-[21/9] overflow-hidden rounded-3xl shadow-2xl"
                :class="{ 'bg-gradient-to-br from-primary-500 to-primary-700': !article.cover }">
                <NuxtImg v-if="article.cover" :src="article.cover" :alt="article.coverAlt || article.title"
                    class="h-full w-full object-cover" format="webp" quality="85"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1024px"
                    loading="eager" />
                <div v-else class="flex h-full items-center justify-center text-white/20">
                    <span class="material-symbols-outlined" style="font-size: 8rem;">article</span>
                </div>
            </div>
        </div>

        <!-- Article + Sidebar -->
        <div class="mx-auto max-w-7xl px-6 pb-16 lg:px-8">
            <div class="grid grid-cols-1 gap-12 lg:grid-cols-12">
                <!-- Article Content -->
                <article class="lg:col-span-8">
                    <div
                        class="prose prose-lg prose-gray max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-primary-500 prose-a:no-underline hover:prose-a:underline prose-img:rounded-xl prose-blockquote:border-primary-500 prose-blockquote:bg-primary-50/50 prose-blockquote:py-1 prose-blockquote:not-italic">
                        <ContentRenderer :value="article" />
                    </div>

                    <!-- Share buttons -->
                    <div class="mt-10 border-t border-primary-200 pt-8">
                        <p class="mb-4 text-sm font-semibold text-gray-900">{{ t('blog.article.share') }}</p>
                        <div class="flex flex-wrap gap-3">
                            <button
                                class="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-cornsilk-50 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-[#25D366]/10 hover:border-[#25D366]/30 hover:text-[#25D366] transition-colors"
                                @click="shareOnWhatsApp"
                            >
                                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                WhatsApp
                            </button>
                            <button
                                class="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-cornsilk-50 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-black/5 hover:border-gray-400 hover:text-gray-900 transition-colors"
                                @click="shareOnX"
                            >
                                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                                X
                            </button>
                            <button
                                class="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-cornsilk-50 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-[#1877F2]/10 hover:border-[#1877F2]/30 hover:text-[#1877F2] transition-colors"
                                @click="shareOnFacebook"
                            >
                                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                                Facebook
                            </button>
                            <button
                                class="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-cornsilk-50 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-[#0A66C2]/10 hover:border-[#0A66C2]/30 hover:text-[#0A66C2] transition-colors"
                                @click="shareOnLinkedIn"
                            >
                                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                                LinkedIn
                            </button>
                            <ClientOnly>
                                <button
                                    class="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-cornsilk-50 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-primary-50 hover:border-primary-300 hover:text-primary-600 transition-colors"
                                    @click="copyLink"
                                >
                                    <span class="material-symbols-outlined text-base">{{ linkCopied ? 'check' : 'link' }}</span>
                                    {{ linkCopied ? t('blog.article.linkCopied') : t('blog.article.copyLink') }}
                                </button>
                            </ClientOnly>
                        </div>
                    </div>
                </article>

                <!-- Sidebar -->
                <div class="lg:col-span-4">
                    <BlogSidebar :tags="allTags" />
                </div>
            </div>
        </div>

        <!-- Related Articles -->
        <section v-if="relatedArticles.length" class="border-t border-primary-200 bg-papaya-50 py-16">
            <div class="mx-auto max-w-7xl px-6 lg:px-8">
                <h2 class="mb-8 text-2xl font-bold text-gray-900">
                    {{ t('blog.article.related') }}
                </h2>
                <div class="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                    <BlogArticleCard v-for="related in relatedArticles" :key="related.path" :article="related" />
                </div>
            </div>
        </section>
    </div>
</template>
