<script setup lang="ts">
definePageMeta({
  auth: false
})

const { t, tm, rt } = useI18n()

interface Row { provider: string, purpose: string, location: string, transfer: string }
const rows = computed(() => (tm('subprocessors.rows') as Row[]).map(r => ({
  provider: rt(r.provider),
  purpose: rt(r.purpose),
  location: rt(r.location),
  transfer: rt(r.transfer),
})))
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <div class="max-w-4xl mx-auto">
          <UPageHeader
            :headline="t('subprocessors.meta.headline')"
            :title="t('subprocessors.meta.title')"
            class="px-0"
          />

          <!-- Draft warning: remove after verifying suppliers/transfer bases -->
          <UAlert
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :description="t('subprocessors.draftWarning')"
            class="my-8"
          />

          <div class="mb-10">
            <p class="text-lg text-default leading-relaxed">
              {{ t('subprocessors.intro') }}
            </p>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="border-b border-default">
                  <th class="py-3 pr-4 font-semibold text-highlighted">{{ t('subprocessors.table.provider') }}</th>
                  <th class="py-3 pr-4 font-semibold text-highlighted">{{ t('subprocessors.table.purpose') }}</th>
                  <th class="py-3 pr-4 font-semibold text-highlighted">{{ t('subprocessors.table.location') }}</th>
                  <th class="py-3 font-semibold text-highlighted">{{ t('subprocessors.table.transfer') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in rows" :key="r.provider" class="border-b border-default/60">
                  <td class="py-3 pr-4 font-medium text-default">{{ r.provider }}</td>
                  <td class="py-3 pr-4 text-muted">{{ r.purpose }}</td>
                  <td class="py-3 pr-4 text-muted">{{ r.location }}</td>
                  <td class="py-3 text-muted">{{ r.transfer }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p class="text-sm text-muted mt-8">
            {{ t('subprocessors.note') }}
          </p>

          <div class="flex flex-wrap items-center gap-3 mt-10 pt-8 border-t border-default">
            <UButton to="/legal/dpa" color="neutral" variant="outline" size="lg">
              {{ t('subprocessors.meta.headline') }} · DPA
            </UButton>
            <UButton to="/legal/privacy" color="neutral" variant="outline" size="lg">
              {{ t('privacy.meta.title') }}
            </UButton>
          </div>
        </div>
      </UContainer>
    </UPageBody>
  </UPage>
</template>
