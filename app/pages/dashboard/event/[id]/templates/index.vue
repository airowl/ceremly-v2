<script setup lang="ts">
import { TEMPLATE_CATEGORIES, type TemplateCategory } from "~~/shared/constants/enums";

const { t } = useI18n()
const toast = useToast()
const route = useRoute()
const router = useRouter()
const eventStore = useEventStore()

definePageMeta({
  title: 'Templates',
})

const eventId = computed(() => route.params.id as string)

const {
  templates,
  isLoading,
  isGenerating,
  error,
  loadTemplates,
  generateTemplate,
  deleteTemplate,
  applyTemplate,
} = useEventTemplates()

// Category filter
const activeCategory = ref<TemplateCategory | null>(null)

const categoryTabs = computed(() => [
  { key: null, label: t('eventTemplates.categories.all') },
  ...TEMPLATE_CATEGORIES.map((cat) => ({
    key: cat,
    label: t(`eventTemplates.categories.${cat}`),
  })),
])

const filteredTemplates = computed(() => {
  if (!activeCategory.value) return templates.value
  return templates.value.filter((tpl) => tpl.category === activeCategory.value)
})

// AI generation
const aiPrompt = ref('')

async function handleGenerate() {
  if (!aiPrompt.value.trim()) return

  const result = await generateTemplate(
    aiPrompt.value.trim(),
    activeCategory.value ?? undefined,
  )

  if (result?.success) {
    toast.add({
      title: t('common.success'),
      description: t('eventTemplates.ai.success'),
      icon: 'i-lucide-sparkles',
      color: 'success',
    })
    aiPrompt.value = ''
  } else {
    toast.add({
      title: t('common.error'),
      description: t('eventTemplates.ai.error'),
      icon: 'i-lucide-alert-circle',
      color: 'error',
    })
  }
}

// Apply template
async function handleApply(templateId: string) {
  const result = await applyTemplate(eventId.value, templateId)

  if (result?.success) {
    toast.add({
      title: t('common.success'),
      description: t('eventTemplates.applied'),
      icon: 'i-lucide-check',
      color: 'success',
    })
  } else {
    toast.add({
      title: t('common.error'),
      description: t('eventTemplates.applyError'),
      icon: 'i-lucide-alert-circle',
      color: 'error',
    })
  }
}

// Delete template
const showDeleteModal = ref(false)
const templateToDelete = ref<string | null>(null)

function confirmDelete(templateId: string) {
  templateToDelete.value = templateId
  showDeleteModal.value = true
}

async function handleDelete() {
  if (!templateToDelete.value) return

  const result = await deleteTemplate(templateToDelete.value)

  if (result?.success) {
    toast.add({
      title: t('common.success'),
      description: t('eventTemplates.actions.deleted'),
      icon: 'i-lucide-check',
      color: 'success',
    })
  }

  showDeleteModal.value = false
  templateToDelete.value = null
}

// Category badge color
function getCategoryColor(category: string) {
  const colors: Record<string, string> = {
    wedding: 'pink',
    birthday: 'orange',
    corporate: 'blue',
    conference: 'violet',
    networking: 'amber',
    party: 'red',
    other: 'neutral',
  }
  return (colors[category] ?? 'neutral') as any
}

// Load on mount
onMounted(async () => {
  if (!eventStore.currentEvent && eventId.value) {
    await eventStore.loadEvent(eventId.value)
  }
  await loadTemplates()
})
</script>

<template>
  <UDashboardPanel id="event-templates">
    <template #header>
      <EventPageHeader :title="t('eventTemplates.title')" />
    </template>

    <template #body>
      <div class="p-4 sm:p-6 space-y-8">
        <!-- AI Hero Section -->
        <section class="relative overflow-hidden rounded-xl bg-gradient-to-br from-[var(--ui-color-primary)]/10 via-[var(--ui-color-primary)]/5 to-transparent border border-[var(--ui-color-primary)]/20 p-6 sm:p-8">
          <div class="flex flex-col gap-3 max-w-2xl">
            <UBadge
              color="primary"
              variant="soft"
              size="xs"
              class="w-fit"
            >
              <UIcon name="i-lucide-sparkles" class="size-3 mr-1" />
              {{ t('eventTemplates.ai.badge') }}
            </UBadge>

            <h2 class="text-2xl sm:text-3xl font-extrabold text-highlighted leading-tight">
              {{ t('eventTemplates.ai.title') }}
            </h2>

            <p class="text-muted text-sm sm:text-base">
              {{ t('eventTemplates.ai.subtitle') }}
            </p>

            <div class="mt-4 flex flex-col sm:flex-row gap-3">
              <div class="flex-1">
                <UInput
                  v-model="aiPrompt"
                  :placeholder="t('eventTemplates.ai.placeholder')"
                  size="lg"
                  class="w-full"
                  :disabled="isGenerating"
                  @keydown.enter="handleGenerate"
                />
              </div>
              <UButton
                :label="isGenerating ? t('eventTemplates.ai.generating') : t('eventTemplates.ai.generate')"
                icon="i-lucide-zap"
                size="lg"
                :loading="isGenerating"
                :disabled="!aiPrompt.trim() || isGenerating"
                @click="handleGenerate"
              />
            </div>
          </div>
        </section>

        <!-- Template Selection -->
        <section class="space-y-6">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-bold text-highlighted">{{ t('eventTemplates.subtitle') }}</h3>
            <UButton
              :label="t('eventTemplates.createNew')"
              icon="i-lucide-plus"
              color="primary"
              @click="router.push(`/dashboard/event/${eventId}/templates/editor`)"
            />
          </div>

          <!-- Category Tabs -->
          <div class="flex items-center gap-1 overflow-x-auto pb-2 border-b border-default">
            <button
              v-for="tab in categoryTabs"
              :key="tab.key ?? 'all'"
              class="px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors"
              :class="activeCategory === tab.key
                ? 'border-[var(--ui-color-primary)] text-[var(--ui-color-primary)] font-bold'
                : 'border-transparent text-muted hover:text-highlighted'"
              @click="activeCategory = tab.key as TemplateCategory | null"
            >
              {{ tab.label }}
            </button>
          </div>

          <!-- Loading Skeleton -->
          <div v-if="isLoading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <div v-for="i in 8" :key="i" class="rounded-xl border border-default overflow-hidden">
              <USkeleton class="aspect-[4/3]" />
              <div class="p-4 space-y-3">
                <USkeleton class="h-5 w-3/4" />
                <USkeleton class="h-4 w-full" />
                <USkeleton class="h-9 w-full rounded-lg" />
              </div>
            </div>
          </div>

          <!-- Template Grid -->
          <div
            v-else-if="filteredTemplates.length > 0"
            class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          >
            <div
              v-for="tpl in filteredTemplates"
              :key="tpl.id"
              class="group flex flex-col bg-default border border-default rounded-xl overflow-hidden transition-all hover:shadow-lg hover:border-[var(--ui-color-primary)]/30"
            >
              <!-- Thumbnail -->
              <div class="aspect-[4/3] relative overflow-hidden bg-muted/30">
                <img
                  v-if="tpl.thumbnailUrl"
                  :src="tpl.thumbnailUrl"
                  :alt="tpl.name"
                  class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                >
                <div
                  v-else
                  class="w-full h-full flex flex-col items-center justify-center gap-2"
                  :style="{ backgroundColor: (tpl.data as any)?.settings?.primaryColor ? `${(tpl.data as any).settings.primaryColor}15` : undefined }"
                >
                  <UIcon
                    :name="tpl.isAiGenerated ? 'i-lucide-sparkles' : 'i-lucide-layout-template'"
                    class="size-10 text-muted/40"
                  />
                  <span class="text-xs text-muted font-medium">{{ tpl.name }}</span>
                </div>

                <!-- Hover overlay -->
                <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <UButton
                    :label="t('eventTemplates.card.edit')"
                    icon="i-lucide-pencil"
                    color="neutral"
                    size="sm"
                    @click="router.push(`/dashboard/event/${eventId}/templates/editor?id=${tpl.id}`)"
                  />
                </div>
              </div>

              <!-- Card body -->
              <div class="p-4 flex-1 flex flex-col justify-between">
                <div class="mb-4">
                  <div class="flex items-center justify-between mb-1">
                    <h4 class="font-bold text-highlighted text-sm truncate">{{ tpl.name }}</h4>
                    <UBadge
                      :color="getCategoryColor(tpl.category)"
                      variant="soft"
                      size="xs"
                    >
                      {{ t(`eventTemplates.categories.${tpl.category}`) }}
                    </UBadge>
                  </div>
                  <p
                    v-if="tpl.description"
                    class="text-xs text-muted line-clamp-2"
                  >
                    {{ tpl.description }}
                  </p>
                  <div v-if="tpl.isAiGenerated || tpl.isSystem" class="flex items-center gap-1 mt-2">
                    <UBadge
                      v-if="tpl.isSystem"
                      color="neutral"
                      variant="outline"
                      size="xs"
                    >
                      {{ t('eventTemplates.card.system') }}
                    </UBadge>
                    <UBadge
                      v-if="tpl.isAiGenerated"
                      color="primary"
                      variant="outline"
                      size="xs"
                    >
                      <UIcon name="i-lucide-sparkles" class="size-3 mr-0.5" />
                      {{ t('eventTemplates.card.aiGenerated') }}
                    </UBadge>
                  </div>
                </div>

                <div class="flex gap-2">
                  <UButton
                    :label="t('eventTemplates.card.edit')"
                    icon="i-lucide-pencil"
                    class="flex-1"
                    variant="soft"
                    @click="router.push(`/dashboard/event/${eventId}/templates/editor?id=${tpl.id}`)"
                  />
                  <UButton
                    icon="i-lucide-check"
                    color="primary"
                    variant="ghost"
                    size="sm"
                    square
                    :title="t('eventTemplates.card.apply')"
                    @click="handleApply(tpl.id)"
                  />
                  <UButton
                    v-if="!tpl.isSystem"
                    icon="i-lucide-trash-2"
                    color="error"
                    variant="ghost"
                    size="sm"
                    square
                    @click="confirmDelete(tpl.id)"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Empty State -->
          <div
            v-else
            class="flex flex-col items-center justify-center py-16 text-center"
          >
            <UIcon name="i-lucide-layout-template" class="size-12 text-muted/40 mb-4" />
            <h4 class="font-bold text-highlighted mb-1">{{ t('eventTemplates.empty.title') }}</h4>
            <p class="text-sm text-muted max-w-sm">{{ t('eventTemplates.empty.description') }}</p>
          </div>
        </section>
      </div>

      <!-- Delete Confirmation Modal -->
      <UModal v-model:open="showDeleteModal" :title="t('eventTemplates.actions.delete')">
        <template #body>
          <div class="space-y-4">
            <p class="text-sm text-muted">{{ t('eventTemplates.actions.deleteConfirm') }}</p>
            <div class="flex justify-end gap-3">
              <UButton
                :label="t('common.cancel')"
                color="neutral"
                variant="subtle"
                @click="showDeleteModal = false"
              />
              <UButton
                :label="t('eventTemplates.actions.delete')"
                color="error"
                @click="handleDelete"
              />
            </div>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
