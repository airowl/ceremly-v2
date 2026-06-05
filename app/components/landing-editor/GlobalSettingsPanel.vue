<script setup lang="ts">
import { LANDING_FONTS, LANDING_BORDER_RADIUS } from '~~/shared/constants/enums'
import type { LandingFont, LandingBorderRadius } from '~~/shared/constants/enums'

const { t } = useI18n()
const editor = inject<ReturnType<typeof useLandingEditor>>('landingEditor')!

const fontOptions = computed(() =>
  LANDING_FONTS.map((f) => ({
    label: t(`landingEditor.settings.fonts.${f}`),
    value: f,
  })),
)

const radiusOptions = computed(() =>
  LANDING_BORDER_RADIUS.map((r) => ({
    label: t(`landingEditor.settings.radius.${r}`),
    value: r,
  })),
)

interface ColorField {
  key: 'primaryColor' | 'secondaryColor' | 'backgroundColor' | 'textColor'
  labelKey: string
}

const colorFields: ColorField[] = [
  { key: 'primaryColor', labelKey: 'landingEditor.settings.primaryColor' },
  { key: 'secondaryColor', labelKey: 'landingEditor.settings.secondaryColor' },
  { key: 'backgroundColor', labelKey: 'landingEditor.settings.backgroundColor' },
  { key: 'textColor', labelKey: 'landingEditor.settings.textColor' },
]
</script>

<template>
  <div class="p-4 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h3 class="font-bold text-sm">{{ t('landingEditor.settings.title') }}</h3>
      <UButton
        icon="i-lucide-x"
        variant="ghost"
        size="xs"
        square
        @click="editor.showGlobalSettings.value = false"
      />
    </div>

    <!-- Colors -->
    <div class="space-y-3">
      <h4 class="text-xs font-bold uppercase tracking-widest text-muted">
        {{ t('landingEditor.settings.colors') }}
      </h4>
      <UFormField
        v-for="cf in colorFields"
        :key="cf.key"
        :label="t(cf.labelKey)"
      >
        <div class="flex items-center gap-3">
          <input
            type="color"
            :value="(editor.settings.value as any)[cf.key]"
            class="h-9 w-12 rounded cursor-pointer border border-default"
            @input="editor.updateSettings({ [cf.key]: ($event.target as HTMLInputElement).value })"
          >
          <UInput
            :model-value="(editor.settings.value as any)[cf.key]"
            class="flex-1"
            @update:model-value="editor.updateSettings({ [cf.key]: $event })"
          />
        </div>
      </UFormField>
    </div>

    <!-- Font -->
    <UFormField :label="t('landingEditor.settings.font')">
      <USelect
        :model-value="editor.settings.value.fontFamily"
        :items="fontOptions"
        class="w-full"
        @update:model-value="(val: any) => editor.updateSettings({ fontFamily: val })"
      />
    </UFormField>

    <!-- Border Radius -->
    <UFormField :label="t('landingEditor.settings.borderRadius')">
      <USelect
        :model-value="editor.settings.value.borderRadius"
        :items="radiusOptions"
        class="w-full"
        @update:model-value="(val: any) => editor.updateSettings({ borderRadius: val })"
      />
    </UFormField>
  </div>
</template>
