<script setup lang="ts">
import draggable from 'vuedraggable'
import { SECTION_DEFINITIONS } from '~~/shared/schemas/sections'
import type { LandingSectionType } from '~~/shared/constants/enums'

const { t } = useI18n()
const editor = inject<ReturnType<typeof useLandingEditor>>('landingEditor')!

const showAddDialog = ref(false)

function getDefinition(type: LandingSectionType) {
  return SECTION_DEFINITIONS.find((d) => d.type === type)
}

function handleReorder(newOrder: any[]) {
  editor.reorderSections(newOrder)
}

function handleAdd(type: LandingSectionType) {
  editor.addSection(type)
  showAddDialog.value = false
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="p-4 border-b border-default">
      <h3 class="font-bold text-sm">{{ t('landingEditor.sections.title') }}</h3>
    </div>

    <!-- Draggable Section List -->
    <div class="flex-1 overflow-y-auto">
      <draggable
        :model-value="editor.orderedSections.value"
        item-key="id"
        handle=".drag-handle"
        ghost-class="opacity-30"
        @update:model-value="handleReorder"
      >
        <template #item="{ element }">
          <div
            class="flex items-center gap-3 px-4 py-3 border-b border-default cursor-pointer transition-colors hover:bg-elevated/50"
            :class="{
              'bg-[var(--ui-color-primary)]/5 border-l-2 border-l-[var(--ui-color-primary)]': editor.selectedSectionId.value === element.id,
              'opacity-50': !element.enabled,
            }"
            @click="editor.selectSection(element.id)"
          >
            <UIcon
              name="i-lucide-grip-vertical"
              class="drag-handle size-4 text-muted cursor-grab flex-shrink-0"
            />
            <UIcon
              :name="getDefinition(element.type)?.icon ?? 'i-lucide-box'"
              class="size-4 text-muted flex-shrink-0"
            />
            <span class="flex-1 text-sm font-medium truncate">
              {{ getDefinition(element.type)?.label ?? element.type }}
            </span>
            <USwitch
              :model-value="element.enabled"
              size="xs"
              @update:model-value="(val: boolean) => editor.toggleSection(element.id, val)"
              @click.stop
            />
          </div>
        </template>
      </draggable>
    </div>

    <!-- Bottom Actions -->
    <div class="p-4 border-t border-default space-y-2">
      <UButton
        :label="t('landingEditor.sections.addSection')"
        icon="i-lucide-plus"
        block
        variant="soft"
        @click="showAddDialog = true"
      />
      <UButton
        :label="t('landingEditor.globalSettings')"
        icon="i-lucide-settings"
        block
        variant="ghost"
        @click="editor.showGlobalSettings.value = true; editor.selectedSectionId.value = null"
      />
    </div>

    <!-- Add Section Dialog -->
    <LandingEditorAddSectionDialog
      v-model:open="showAddDialog"
      :available-sections="editor.availableSectionsToAdd.value"
      @add="handleAdd"
    />
  </div>
</template>
