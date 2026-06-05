<script setup lang="ts">
const { t } = useI18n()
const editor = inject<ReturnType<typeof useLandingEditor>>('landingEditor')!
</script>

<template>
  <!-- Mobile warning -->
  <div class="flex lg:hidden items-center justify-center h-full p-8 text-center">
    <div class="space-y-4">
      <UIcon name="i-lucide-monitor" class="size-12 text-muted mx-auto" />
      <h3 class="font-bold text-lg">{{ t('landingEditor.mobileWarning.title') }}</h3>
      <p class="text-sm text-muted max-w-sm">{{ t('landingEditor.mobileWarning.description') }}</p>
    </div>
  </div>

  <!-- Desktop Editor -->
  <div class="hidden lg:flex h-[calc(100vh-64px)]">
    <!-- Left Sidebar: Section List -->
    <div class="w-72 border-r border-default flex-shrink-0 bg-default">
      <LandingEditorSectionList />
    </div>

    <!-- Center: Preview -->
    <div class="flex-1 overflow-y-auto bg-elevated/30">
      <LandingEditorLandingPreview />
    </div>

    <!-- Right Sidebar -->
    <div class="w-80 border-l border-default overflow-y-auto flex-shrink-0 bg-default">
      <LandingEditorGlobalSettingsPanel v-if="editor.showGlobalSettings.value" />
      <LandingEditorSectionConfigurator v-else-if="editor.selectedSection.value" />
      <div v-else class="flex flex-col items-center justify-center h-full p-6 text-center text-muted">
        <UIcon name="i-lucide-mouse-pointer-click" class="size-8 mb-3 opacity-40" />
        <p class="text-sm">{{ t('landingEditor.selectSection') }}</p>
      </div>
    </div>
  </div>
</template>
