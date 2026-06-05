<script setup lang="ts">
const props = defineProps<{
  label: string
  modelValue: unknown
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const { t } = useI18n()
const toast = useToast()

const currentUrl = computed(() => (props.modelValue as string) || '')
const isUploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

function triggerUpload() {
  fileInput.value?.click()
}

async function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  // Client-side validation
  const maxSize = 5 * 1024 * 1024 // 5MB
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

  if (!allowedTypes.includes(file.type)) {
    toast.add({ title: t('landingEditor.upload.invalidType'), color: 'error', icon: 'i-lucide-alert-circle' })
    return
  }

  if (file.size > maxSize) {
    toast.add({ title: t('landingEditor.upload.tooLarge'), color: 'error', icon: 'i-lucide-alert-circle' })
    return
  }

  try {
    isUploading.value = true

    const formData = new FormData()
    formData.append('file', file)

    const result = await $fetch<{ success: boolean; file: { url: string } }>(
      '/api/file/upload',
      {
        method: 'POST',
        body: formData,
      },
    )

    if (result.success && result.file?.url) {
      emit('update:modelValue', result.file.url)
    }
  } catch (err) {
    toast.add({ title: t('landingEditor.upload.error'), color: 'error', icon: 'i-lucide-alert-circle' })
  } finally {
    isUploading.value = false
    // Reset input so same file can be re-uploaded
    if (fileInput.value) fileInput.value.value = ''
  }
}

function removeImage() {
  emit('update:modelValue', '')
}
</script>

<template>
  <UFormField :label="label">
    <div class="space-y-2">
      <!-- Preview -->
      <div
        v-if="currentUrl"
        class="relative group rounded-lg overflow-hidden border border-default"
      >
        <img
          :src="currentUrl"
          :alt="label"
          class="w-full h-32 object-cover"
        >
        <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <UButton
            icon="i-lucide-upload"
            color="neutral"
            size="xs"
            square
            :loading="isUploading"
            @click="triggerUpload"
          />
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            size="xs"
            square
            @click="removeImage"
          />
        </div>
      </div>

      <!-- Upload button (when no image) -->
      <button
        v-else
        type="button"
        class="flex items-center justify-center w-full h-24 rounded-lg border-2 border-dashed border-default hover:border-[var(--ui-color-primary)] transition-colors cursor-pointer"
        :disabled="isUploading"
        @click="triggerUpload"
      >
        <div class="flex flex-col items-center gap-1 text-muted">
          <UIcon
            :name="isUploading ? 'i-lucide-loader-2' : 'i-lucide-image-plus'"
            :class="['size-6', isUploading && 'animate-spin']"
          />
          <span class="text-xs">
            {{ isUploading ? t('landingEditor.upload.uploading') : t('landingEditor.upload.click') }}
          </span>
        </div>
      </button>

      <!-- Hidden file input -->
      <input
        ref="fileInput"
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        class="hidden"
        @change="handleFileChange"
      >
    </div>
  </UFormField>
</template>
