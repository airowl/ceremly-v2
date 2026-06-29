<script setup lang="ts">
const { t, locale } = useI18n()
const localePath = useLocalePath()
const { formatArticleDate, calculateReadingTime } = useBlog()

const props = defineProps<{
    article: {
        path: string
        title: string
        description: string
        date: string
        cover?: string
        coverAlt?: string
        tags?: string[]
        // BlogCollectionItem.body is a MarkdownRoot: we accept any shape
        // and read rawText (present only if exposed by the query) via cast.
        body?: unknown
    }
}>()

const readingTime = computed(() => {
    const text = (props.article.body as { rawText?: string } | undefined)?.rawText
        || props.article.description || ''
    return calculateReadingTime(text)
})

const formattedDate = computed(() => formatArticleDate(props.article.date, locale.value))

const firstTag = computed(() => props.article.tags?.[0])
</script>

<template>
    <NuxtLink
:to="localePath(article.path)"
        class="group grid grid-cols-1 lg:grid-cols-5 overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-gray-100 transition-all duration-300 hover:shadow-2xl">
        <!-- Image -->
        <div class="relative lg:col-span-3 h-64 lg:h-auto overflow-hidden">
            <NuxtImg
                v-if="article.cover"
                :src="article.cover"
                :alt="article.coverAlt || article.title"
                class="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
                format="webp"
                quality="80"
                sizes="(max-width: 768px) 100vw, 60vw"
            />
            <div v-else class="absolute inset-0 bg-gradient-to-br from-primary-500 to-primary-700">
                <div class="flex h-full items-center justify-center text-white/20">
                    <span class="material-symbols-outlined text-9xl">article</span>
                </div>
            </div>

            <div v-if="firstTag" class="absolute left-6 top-6">
                <span class="rounded-full bg-white/90 px-4 py-1.5 text-sm font-semibold text-gray-800 backdrop-blur-sm">
                    {{ firstTag }}
                </span>
            </div>
        </div>

        <!-- Content -->
        <div class="lg:col-span-2 flex flex-col justify-center p-8 lg:p-10">
            <div class="mb-2 inline-flex items-center gap-2">
                <span
                    class="rounded-full bg-primary-50 px-3 py-1 text-xs font-bold text-primary-600 uppercase tracking-wide">
                    {{ t('blog.featured.badge') }}
                </span>
            </div>

            <div class="mb-4 flex items-center gap-3 text-sm text-gray-500">
                <span>{{ formattedDate }}</span>
                <span class="text-gray-300">&middot;</span>
                <span>{{ readingTime }} {{ t('blog.card.minRead') }}</span>
            </div>

            <h2
                class="mb-4 text-2xl font-bold leading-tight text-gray-900 group-hover:text-primary-500 transition-colors lg:text-3xl">
                {{ article.title }}
            </h2>

            <p class="mb-6 text-base leading-relaxed text-gray-600 line-clamp-3">
                {{ article.description }}
            </p>

            <span
                class="inline-flex items-center gap-2 text-base font-semibold text-primary-500 group-hover:gap-3 transition-all">
                {{ t('blog.featured.readMore') }}
                <span class="material-symbols-outlined">arrow_forward</span>
            </span>
        </div>
    </NuxtLink>
</template>
