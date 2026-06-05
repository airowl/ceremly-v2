<script setup lang="ts">
const { t } = useI18n()
const editor = inject<ReturnType<typeof useLandingEditor>>('landingEditor')!

const section = computed(() => editor.selectedSection.value)
const definition = computed(() => editor.selectedSectionDefinition.value)

function handleRemove() {
  if (!section.value) return
  editor.removeSection(section.value.id)
}
</script>

<template>
  <div v-if="section && definition" class="p-4 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between gap-2">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <UIcon :name="definition.icon" class="size-4 text-muted flex-shrink-0" />
          <h3 class="font-bold text-sm truncate">{{ definition.label }}</h3>
        </div>
        <p class="text-xs text-muted mt-1">{{ definition.description }}</p>
      </div>
      <UButton
        icon="i-lucide-trash-2"
        color="error"
        variant="ghost"
        size="xs"
        square
        @click="handleRemove"
      />
    </div>

    <USeparator />

    <!-- Dynamic Fields -->
    <div class="space-y-4">
      <LandingEditorFieldRenderer
        v-for="field in definition.fields"
        :key="field.key"
        :field="field"
        :value="section.values[field.key]"
        @update:value="(val) => { if (section) editor.updateSectionValues(section.id, { [field.key]: val }) }"
      />
    </div>
  </div>
</template>
