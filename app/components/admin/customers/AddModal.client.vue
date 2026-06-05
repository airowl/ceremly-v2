<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

const { t } = useI18n()

const schema = computed(() => z.object({
  name: z.string().min(2, t('dashboard.customers.createModal.validation.tooShort')),
  email: z.string().email(t('dashboard.customers.createModal.validation.invalidEmail'))
}))
const open = ref(false)

type Schema = z.output<typeof schema.value>

const state = reactive<Partial<Schema>>({
  name: undefined,
  email: undefined
})

const toast = useToast()
async function onSubmit(event: FormSubmitEvent<Schema>) {
  toast.add({ title: t('dashboard.customers.createModal.success'), description: t('dashboard.customers.createModal.successDescription', { name: event.data.name }), color: 'success' })
  open.value = false
}
</script>

<template>
  <UModal v-model:open="open" :title="$t('dashboard.customers.createModal.title')" :description="$t('dashboard.customers.createModal.description')">
    <UButton :label="$t('dashboard.customers.createModal.button')" icon="i-lucide-plus" />

    <template #body>
      <UForm
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField :label="$t('dashboard.customers.createModal.name')" :placeholder="$t('dashboard.customers.createModal.namePlaceholder')" name="name">
          <UInput v-model="state.name" class="w-full" />
        </UFormField>
        <UFormField :label="$t('dashboard.customers.createModal.email')" :placeholder="$t('dashboard.customers.createModal.emailPlaceholder')" name="email">
          <UInput v-model="state.email" class="w-full" />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton
            :label="$t('dashboard.customers.createModal.cancel')"
            color="neutral"
            variant="subtle"
            @click="open = false"
          />
          <UButton
            :label="$t('dashboard.customers.createModal.create')"
            color="primary"
            variant="solid"
            type="submit"
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
