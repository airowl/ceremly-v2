<script setup lang="ts">
import { TEMPLATE_CATEGORIES, type TemplateCategory } from '~~/shared/constants/enums'

const { t } = useI18n()
const toast = useToast()
const route = useRoute()
const router = useRouter()
const eventStore = useEventStore()

definePageMeta({
  title: 'Template Editor',
})

const eventId = computed(() => route.params.id as string)
const templateId = computed(() => (route.query.id as string) || null)

const editor = useLandingEditor(eventId, templateId)
provide('landingEditor', editor)

// Load data on mount
onMounted(async () => {
  if (!eventStore.currentEvent && eventId.value) {
    await eventStore.loadEvent(eventId.value)
  }
  await editor.load()
})

// Unsaved changes warning
if (import.meta.client) {
  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (editor.isDirty.value) {
      e.preventDefault()
      e.returnValue = ''
    }
  }
  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
  onUnmounted(() => window.removeEventListener('beforeunload', onBeforeUnload))
}

// ── Save flow ──
const showSaveModal = ref(false)
const saveName = ref('')
const saveDescription = ref('')
const saveCategory = ref<TemplateCategory>('other')

const categoryOptions = computed(() =>
  TEMPLATE_CATEGORIES.map((cat) => ({
    label: t(`eventTemplates.categories.${cat}`),
    value: cat,
  })),
)

function openSaveModal() {
  // Pre-populate from template meta if editing
  if (editor.templateMeta.value) {
    saveName.value = editor.templateMeta.value.name
    saveDescription.value = editor.templateMeta.value.description || ''
    saveCategory.value = editor.templateMeta.value.category || 'other'
  } else {
    saveName.value = ''
    saveDescription.value = ''
    saveCategory.value = 'other'
  }
  showSaveModal.value = true
}

async function handleSave() {
  if (!saveName.value.trim()) return

  const result = await editor.save({
    name: saveName.value.trim(),
    description: saveDescription.value.trim() || null,
    category: saveCategory.value,
  })

  if (result?.success) {
    toast.add({
      title: t('common.success'),
      description: t('landingEditor.saved'),
      icon: 'i-lucide-check',
      color: 'success',
    })
    showSaveModal.value = false
    // Navigate back to templates list
    router.push(`/dashboard/event/${eventId.value}/templates`)
  } else {
    toast.add({
      title: t('common.error'),
      description: editor.error.value || t('landingEditor.saveError'),
      icon: 'i-lucide-alert-circle',
      color: 'error',
    })
  }
}

// ── AI generation ──
const showAiModal = ref(false)
const aiPrompt = ref('')

async function handleGenerate() {
  if (!aiPrompt.value.trim()) return

  const result = await editor.generateWithAI(aiPrompt.value.trim())

  if (result?.success) {
    toast.add({
      title: t('common.success'),
      description: t('landingEditor.ai.success'),
      icon: 'i-lucide-sparkles',
      color: 'success',
    })
    showAiModal.value = false
    aiPrompt.value = ''
  } else {
    toast.add({
      title: t('common.error'),
      description: t('landingEditor.ai.error'),
      icon: 'i-lucide-alert-circle',
      color: 'error',
    })
  }
}

function goBack() {
  router.push(`/dashboard/event/${eventId.value}/templates`)
}
</script>

<template>
  <UDashboardPanel id="template-editor">
    <template #header>
      <EventPageHeader>
        <template #title>
          <div class="flex items-center gap-2">
            <UButton
              icon="i-lucide-arrow-left"
              variant="ghost"
              size="xs"
              square
              @click="goBack"
            />
            <span class="text-lg font-bold">
              {{ editor.isNewTemplate.value ? t('landingEditor.titleNew') : t('landingEditor.titleEdit') }}
            </span>
            <UBadge v-if="editor.isDirty.value" color="warning" variant="soft" size="xs">
              {{ t('landingEditor.unsaved') }}
            </UBadge>
          </div>
        </template>
        <template #actions>
          <div class="flex items-center gap-2">
            <UButton
              :label="t('landingEditor.ai.button')"
              icon="i-lucide-sparkles"
              variant="soft"
              size="sm"
              @click="showAiModal = true"
            />
            <UButton
              :label="t('landingEditor.save')"
              icon="i-lucide-save"
              color="primary"
              size="sm"
              :loading="editor.isSaving.value"
              @click="openSaveModal"
            />
          </div>
        </template>
      </EventPageHeader>
    </template>

    <template #body>
      <!-- Loading -->
      <div v-if="editor.isLoading.value" class="flex items-center justify-center h-96">
        <UIcon name="i-lucide-loader-2" class="size-8 text-muted animate-spin" />
      </div>

      <!-- Error -->
      <div
        v-else-if="editor.error.value && !editor.data.value"
        class="flex flex-col items-center justify-center h-96 gap-4"
      >
        <UIcon name="i-lucide-alert-circle" class="size-12 text-error" />
        <p class="text-sm text-muted">{{ editor.error.value }}</p>
        <UButton :label="t('common.retry')" @click="editor.load()" />
      </div>

      <!-- Editor -->
      <LandingEditor v-else-if="editor.data.value" />
    </template>
  </UDashboardPanel>

  <!-- Save Modal -->
  <UModal v-model:open="showSaveModal" :title="t('landingEditor.saveModal.title')">
    <template #body>
      <div class="space-y-4">
        <UFormField :label="t('landingEditor.saveModal.name')" required>
          <UInput
            v-model="saveName"
            :placeholder="t('landingEditor.saveModal.namePlaceholder')"
            class="w-full"
          />
        </UFormField>
        <UFormField :label="t('landingEditor.saveModal.description')">
          <UTextarea
            v-model="saveDescription"
            :placeholder="t('landingEditor.saveModal.descriptionPlaceholder')"
            :rows="3"
            class="w-full"
          />
        </UFormField>
        <UFormField :label="t('landingEditor.saveModal.category')">
          <USelect
            v-model="saveCategory"
            :items="categoryOptions"
            class="w-full"
          />
        </UFormField>
        <div class="flex justify-end gap-3">
          <UButton
            :label="t('common.cancel')"
            color="neutral"
            variant="subtle"
            @click="showSaveModal = false"
          />
          <UButton
            :label="t('landingEditor.save')"
            color="primary"
            :loading="editor.isSaving.value"
            :disabled="!saveName.trim()"
            @click="handleSave"
          />
        </div>
      </div>
    </template>
  </UModal>

  <!-- AI Generation Modal -->
  <UModal v-model:open="showAiModal" :title="t('landingEditor.ai.title')">
    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-muted">{{ t('landingEditor.ai.description') }}</p>
        <UTextarea
          v-model="aiPrompt"
          :placeholder="t('landingEditor.ai.placeholder')"
          :rows="4"
          class="w-full"
        />
        <div class="flex justify-end gap-3">
          <UButton
            :label="t('common.cancel')"
            color="neutral"
            variant="subtle"
            @click="showAiModal = false"
          />
          <UButton
            :label="editor.isGenerating.value ? t('landingEditor.ai.generating') : t('landingEditor.ai.generate')"
            icon="i-lucide-sparkles"
            :loading="editor.isGenerating.value"
            :disabled="!aiPrompt.trim()"
            @click="handleGenerate"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
