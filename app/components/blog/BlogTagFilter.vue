<script setup lang="ts">
import type { BlogTag } from '~~/shared/utils/blog'

const { t } = useI18n()
const route = useRoute()

defineProps<{
  tags: BlogTag[]
}>()

const activeTag = computed(() => (route.query.tag as string) || '')

function selectTag(tag: string) {
  navigateTo({
    path: route.path,
    query: tag ? { tag } : {},
  })
}
</script>

<template>
  <div class="sticky top-20 z-40 bg-[#FAF9F6]/80 backdrop-blur-md border-b border-primary-200 px-6 py-4">
    <div class="mx-auto max-w-7xl">
      <div class="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        <button
          class="shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all"
          :class="!activeTag
            ? 'bg-gray-900 text-white shadow-sm'
            : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50'"
          @click="selectTag('')"
        >
          {{ t('blog.filter.all') }}
        </button>

        <button
          v-for="tag in tags"
          :key="tag.name"
          class="shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all"
          :class="activeTag === tag.name
            ? 'bg-gray-900 text-white shadow-sm'
            : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50'"
          @click="selectTag(tag.name)"
        >
          {{ tag.name }}
          <span class="ml-1 text-xs opacity-60">({{ tag.count }})</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>
