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
    // BlogCollectionItem.body è un MarkdownRoot: accettiamo qualsiasi shape
    // e leggiamo rawText (presente solo se esposto dalla query) via cast.
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

const coverGradient = computed(() => {
  const gradients = [
    'from-primary-500/80 to-primary-600/80',
    'from-emerald-500/80 to-teal-600/80',
    'from-orange-500/80 to-red-500/80',
    'from-violet-500/80 to-purple-600/80',
    'from-papaya-500/80 to-primary-600/80',
  ]
  const hash = props.article.title.length % gradients.length
  return gradients[hash]
})
</script>

<template>
  <NuxtLink
    :to="localePath(article.path)"
    class="group flex flex-col overflow-hidden rounded-2xl bg-cornsilk-50 ring-1 ring-primary-200 transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
  >
    <!-- Cover -->
    <div class="relative h-56 overflow-hidden">
      <NuxtImg
        v-if="article.cover"
        :src="article.cover"
        :alt="article.coverAlt || article.title"
        class="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        loading="lazy"
        format="webp"
        quality="80"
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      />
      <div
        v-else
        class="absolute inset-0 bg-gradient-to-br"
        :class="coverGradient"
      >
        <div class="flex h-full items-center justify-center text-white/30">
          <span class="material-symbols-outlined text-7xl">article</span>
        </div>
      </div>

      <!-- Tag badge -->
      <div v-if="firstTag" class="absolute left-4 top-4">
        <span class="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-gray-800 backdrop-blur-sm">
          {{ firstTag }}
        </span>
      </div>
    </div>

    <!-- Content -->
    <div class="flex flex-1 flex-col p-6">
      <div class="mb-3 flex items-center gap-2 text-sm text-gray-500">
        <span>{{ formattedDate }}</span>
        <span class="text-gray-300">&middot;</span>
        <span>{{ readingTime }} {{ t('blog.card.minRead') }}</span>
      </div>

      <h3 class="mb-2 text-lg font-bold leading-snug text-gray-900 line-clamp-2 group-hover:text-primary-500 transition-colors">
        {{ article.title }}
      </h3>

      <p class="mb-4 flex-1 text-sm leading-relaxed text-gray-600 line-clamp-3">
        {{ article.description }}
      </p>

      <span class="inline-flex items-center gap-1 text-sm font-semibold text-primary-500 group-hover:gap-2 transition-all">
        {{ t('blog.card.readMore') }}
        <span class="material-symbols-outlined text-base">arrow_forward</span>
      </span>
    </div>
  </NuxtLink>
</template>
