<script setup lang="ts">
import type { SectionDefinition } from '~~/shared/schemas/sections'
import type { LandingSectionType } from '~~/shared/constants/enums'

const props = defineProps<{
  availableSections: SectionDefinition[]
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  add: [type: LandingSectionType]
}>()

const { t } = useI18n()

function handleAdd(type: LandingSectionType) {
  emit('add', type)
}
</script>

<template>
  <UModal v-model:open="open" :title="t('landingEditor.addSection.title')">
    <template #body>
      <div v-if="availableSections.length > 0" class="grid grid-cols-2 gap-3">
        <button
          v-for="def in availableSections"
          :key="def.type"
          type="button"
          class="flex flex-col items-center gap-2 p-4 rounded-lg border border-default hover:border-[var(--ui-color-primary)] hover:bg-[var(--ui-color-primary)]/5 transition-colors text-center"
          @click="handleAdd(def.type)"
        >
          <UIcon :name="def.icon" class="size-6 text-muted" />
          <span class="text-sm font-bold">{{ def.label }}</span>
          <span class="text-xs text-muted line-clamp-2">{{ def.description }}</span>
        </button>
      </div>
      <div v-else class="py-8 text-center text-muted text-sm">
        {{ t('landingEditor.addSection.allAdded') }}
      </div>
    </template>
  </UModal>
</template>
