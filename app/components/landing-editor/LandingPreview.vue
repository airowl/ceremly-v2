<script setup lang="ts">
const { t } = useI18n()
const editor = inject<ReturnType<typeof useLandingEditor>>('landingEditor')!
const eventStore = useEventStore()

const radiusMap: Record<string, string> = {
  none: '0px',
  sm: '0.25rem',
  md: '0.375rem',
  lg: '0.5rem',
  full: '9999px',
}

const cssVars = computed(() => {
  const s = editor.settings.value
  return {
    '--landing-primary': s.primaryColor,
    '--landing-secondary': s.secondaryColor,
    '--landing-bg': s.backgroundColor,
    '--landing-text': s.textColor,
    '--landing-radius': radiusMap[s.borderRadius] ?? '0.375rem',
  }
})

const eventData = computed(() => {
  const event = eventStore.currentEvent
  if (!event) return undefined
  return {
    date: event.date,
    time: event.time,
    location: event.location,
    name: event.name,
  } as Record<string, unknown>
})
</script>

<template>
  <div class="flex flex-col items-center p-6 h-full">
    <!-- Preview Controls -->
    <div class="flex items-center gap-2 mb-4 flex-shrink-0">
      <UButton
        icon="i-lucide-monitor"
        :variant="editor.previewMode.value === 'desktop' ? 'solid' : 'ghost'"
        size="xs"
        square
        @click="editor.previewMode.value = 'desktop'"
      />
      <UButton
        icon="i-lucide-smartphone"
        :variant="editor.previewMode.value === 'mobile' ? 'solid' : 'ghost'"
        size="xs"
        square
        @click="editor.previewMode.value = 'mobile'"
      />
    </div>

    <!-- Preview Frame -->
    <div class="flex-1 w-full flex justify-center overflow-y-auto">
      <div
        class="bg-white rounded-xl shadow-lg border border-default overflow-hidden transition-all duration-300 h-fit"
        :class="editor.previewMode.value === 'mobile' ? 'w-[375px]' : 'w-full max-w-4xl'"
        :style="cssVars"
      >
        <div v-if="editor.enabledSections.value.length > 0" class="landing-page">
          <div
            v-for="section in editor.enabledSections.value"
            :key="section.id"
            class="cursor-pointer transition-all"
            :class="{
              'ring-2 ring-[var(--ui-color-primary)] ring-offset-2': editor.selectedSectionId.value === section.id,
            }"
            @click="editor.selectSection(section.id)"
          >
            <EventSectionRenderer
              :section="section"
              :settings="editor.settings.value"
              slug="preview"
              :event="eventData"
            />
          </div>
        </div>

        <!-- Empty preview -->
        <div v-else class="flex flex-col items-center justify-center py-24 text-center text-muted">
          <UIcon name="i-lucide-eye-off" class="size-10 mb-3 opacity-40" />
          <p class="text-sm">{{ t('landingEditor.preview.empty') }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
