<script setup lang="ts">
import type { SectionFieldDefinition } from '~~/shared/schemas/sections'

const props = defineProps<{
  field: SectionFieldDefinition
  value: unknown
}>()

const emit = defineEmits<{
  'update:value': [value: unknown]
}>()

const localValue = computed({
  get: () => props.value ?? props.field.default,
  set: (val) => emit('update:value', val),
})
</script>

<template>
  <!-- Image: delegate to ImageUploadField -->
  <LandingEditorImageUploadField
    v-if="field.type === 'image'"
    :label="field.label"
    :model-value="localValue as string"
    @update:model-value="localValue = $event"
  />

  <!-- Toggle -->
  <UFormField v-else-if="field.type === 'toggle'" :label="field.label">
    <USwitch
      :model-value="!!localValue"
      @update:model-value="localValue = $event"
    />
  </UFormField>

  <!-- Color -->
  <UFormField v-else-if="field.type === 'color'" :label="field.label">
    <div class="flex items-center gap-3">
      <input
        type="color"
        :value="(localValue as string) || '#000000'"
        class="h-9 w-12 rounded cursor-pointer border border-default"
        @input="localValue = ($event.target as HTMLInputElement).value"
      >
      <UInput
        :model-value="(localValue as string) || ''"
        class="flex-1"
        @update:model-value="localValue = $event"
      />
    </div>
  </UFormField>

  <!-- Select -->
  <UFormField v-else-if="field.type === 'select'" :label="field.label">
    <USelect
      :model-value="(localValue as string)"
      :items="field.options?.map(o => ({ label: o.label, value: o.value })) ?? []"
      class="w-full"
      @update:model-value="localValue = $event"
    />
  </UFormField>

  <!-- Textarea / Richtext -->
  <UFormField
    v-else-if="field.type === 'textarea' || field.type === 'richtext'"
    :label="field.label"
    :required="field.required"
  >
    <UTextarea
      :model-value="(localValue as string) || ''"
      :placeholder="field.placeholder"
      :rows="4"
      class="w-full"
      @update:model-value="localValue = $event"
    />
  </UFormField>

  <!-- Number -->
  <UFormField v-else-if="field.type === 'number'" :label="field.label" :required="field.required">
    <UInput
      :model-value="localValue as number"
      type="number"
      :min="field.min"
      :max="field.max"
      class="w-full"
      @update:model-value="localValue = Number($event)"
    />
  </UFormField>

  <!-- Date -->
  <UFormField v-else-if="field.type === 'date'" :label="field.label" :required="field.required">
    <UInput
      :model-value="(localValue as string) || ''"
      type="date"
      class="w-full"
      @update:model-value="localValue = $event"
    />
  </UFormField>

  <!-- Time -->
  <UFormField v-else-if="field.type === 'time'" :label="field.label" :required="field.required">
    <UInput
      :model-value="(localValue as string) || ''"
      type="time"
      class="w-full"
      @update:model-value="localValue = $event"
    />
  </UFormField>

  <!-- Text (default) -->
  <UFormField v-else :label="field.label" :required="field.required">
    <UInput
      :model-value="(localValue as string) || ''"
      :placeholder="field.placeholder"
      class="w-full"
      @update:model-value="localValue = $event"
    />
  </UFormField>
</template>
