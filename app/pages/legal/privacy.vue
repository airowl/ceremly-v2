<script setup lang="ts">
definePageMeta({
  auth: false
})

const { t } = useI18n()
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <div class="max-w-4xl mx-auto">
          <UPageHeader
            headline="Legale"
            :title="t('privacy.meta.title')"
            :description="t('privacy.meta.effectiveDate')"
            class="px-0"
          />
          <!-- Intro -->
          <div class="my-12">
            <p class="text-lg text-default leading-relaxed">
              {{ t('privacy.overview.description') }}
            </p>
          </div>

          <div class="prose prose-neutral dark:prose-invert max-w-none">
            <UDivider class="my-8" />

            <!-- 1) Quali dati raccogliamo -->
            <section class="mb-12">
              <h2 class="text-3xl font-bold text-highlighted mb-6">
                {{ t('privacy.sections.dataCollection.number') }}. {{ t('privacy.sections.dataCollection.title') }}
              </h2>

              <div class="space-y-4 text-default leading-relaxed">
                <p>
                  <strong>{{ t('privacy.sections.dataCollection.clientData') }}:</strong> {{ t('privacy.sections.dataCollection.clientDataDesc') }}
                </p>

                <p>
                  <strong>{{ t('privacy.sections.dataCollection.eventData') }}:</strong> {{ t('privacy.sections.dataCollection.eventDataDesc') }}
                </p>

                <p>
                  <strong>{{ t('privacy.sections.dataCollection.guestData') }}:</strong> {{ t('privacy.sections.dataCollection.guestDataDesc') }}
                </p>

                <p>
                  <strong>{{ t('privacy.sections.dataCollection.nonPersonalData') }}:</strong> {{ t('privacy.sections.dataCollection.nonPersonalDataDesc') }}
                </p>

                <p>
                  <strong>{{ t('privacy.sections.dataCollection.gallery') }}:</strong> {{ t('privacy.sections.dataCollection.galleryDesc') }}
                </p>
              </div>
            </section>

            <UDivider class="my-8" />

            <!-- 2) Finalità e basi giuridiche -->
            <section class="mb-12">
              <h2 class="text-3xl font-bold text-highlighted mb-6">
                {{ t('privacy.sections.purposes.number') }}. {{ t('privacy.sections.purposes.title') }}
              </h2>

              <div class="space-y-4 text-default leading-relaxed">
                <p>
                  <strong>{{ t('privacy.sections.purposes.clientData') }}:</strong> {{ t('privacy.sections.purposes.clientDataDesc') }}
                </p>

                <p>
                  <strong>{{ t('privacy.sections.purposes.nonPersonalData') }}:</strong> {{ t('privacy.sections.purposes.nonPersonalDataDesc') }}
                </p>

                <p>
                  <strong>{{ t('privacy.sections.purposes.communications') }}:</strong> {{ t('privacy.sections.purposes.communicationsDesc') }}
                </p>

                <p>
                  <strong>{{ t('privacy.sections.purposes.gallery') }}:</strong> {{ t('privacy.sections.purposes.galleryDesc') }}
                </p>
              </div>
            </section>

            <UDivider class="my-8" />

            <!-- 3) Condivisione dati -->
            <section class="mb-12">
              <h2 class="text-3xl font-bold text-highlighted mb-6">
                {{ t('privacy.sections.sharing.number') }}. {{ t('privacy.sections.sharing.title') }}
              </h2>

              <p class="text-default leading-relaxed mb-4">
                {{ t('privacy.sections.sharing.description') }}
              </p>

              <p class="text-muted leading-relaxed">
                {{ t('privacy.sections.sharing.subprocessors') }}
                <NuxtLink to="/legal/dpa" class="text-primary hover:underline">{{ t('privacy.sections.sharing.dpaLink') }}</NuxtLink>.
              </p>
            </section>

            <UDivider class="my-8" />

            <!-- 4) Cookies -->
            <section class="mb-12">
              <h2 class="text-3xl font-bold text-highlighted mb-6">
                {{ t('privacy.sections.cookies.number') }}. {{ t('privacy.sections.cookies.title') }}
              </h2>

              <p class="text-default leading-relaxed mb-4">
                {{ t('privacy.sections.cookies.description') }}
              </p>

              <p class="text-muted leading-relaxed">
                {{ t('privacy.sections.cookies.consent') }}
              </p>
            </section>

            <UDivider class="my-8" />

            <!-- 5) Sicurezza -->
            <section class="mb-12">
              <h2 class="text-3xl font-bold text-highlighted mb-6">
                {{ t('privacy.sections.security.number') }}. {{ t('privacy.sections.security.title') }}
              </h2>

              <p class="text-default leading-relaxed">
                {{ t('privacy.sections.security.description') }}
              </p>
            </section>

            <UDivider class="my-8" />

            <!-- 6) Diritti degli utenti -->
            <section class="mb-12">
              <h2 class="text-3xl font-bold text-highlighted mb-6">
                {{ t('privacy.sections.rights.number') }}. {{ t('privacy.sections.rights.title') }}
              </h2>

              <p class="text-default leading-relaxed mb-4">
                {{ t('privacy.sections.rights.description') }}
                <a href="mailto:privacy@example.com" class="text-primary hover:underline">privacy@example.com</a>.
              </p>

              <p class="text-muted leading-relaxed mb-4">
                {{ t('privacy.sections.rights.complaint') }}
                <a href="https://www.garanteprivacy.it" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">{{ t('privacy.sections.rights.authority') }}</a>.
              </p>

              <div class="bg-elevated/50 rounded-lg p-4 mt-6">
                <p class="text-sm text-muted">
                  <strong class="text-default">{{ t('privacy.sections.rights.gdprRights') }}:</strong> {{ t('privacy.sections.rights.gdprList') }}
                </p>
              </div>
            </section>

            <UDivider class="my-8" />

            <!-- 7) Conservazione dati -->
            <section class="mb-12">
              <h2 class="text-3xl font-bold text-highlighted mb-6">
                {{ t('privacy.sections.retention.number') }}. {{ t('privacy.sections.retention.title') }}
              </h2>

              <p class="text-default leading-relaxed mb-4">
                {{ t('privacy.sections.retention.description') }}
              </p>

              <div class="space-y-2 text-muted leading-relaxed">
                <p><strong class="text-default">{{ t('privacy.sections.retention.accountData') }}:</strong> {{ t('privacy.sections.retention.accountDataPeriod') }}</p>
                <p><strong class="text-default">{{ t('privacy.sections.retention.guestData') }}:</strong> {{ t('privacy.sections.retention.guestDataPeriod') }}</p>
                <p><strong class="text-default">{{ t('privacy.sections.retention.gallery') }}:</strong> {{ t('privacy.sections.retention.galleryPeriod') }}</p>
                <p><strong class="text-default">{{ t('privacy.sections.retention.vendors') }}:</strong> {{ t('privacy.sections.retention.vendorsPeriod') }}</p>
              </div>

              <p class="text-sm text-muted mt-4 italic">
                {{ t('privacy.sections.retention.note') }}
              </p>
            </section>

            <UDivider class="my-8" />

            <!-- 8) Aggiornamenti -->
            <section class="mb-12">
              <h2 class="text-3xl font-bold text-highlighted mb-6">
                {{ t('privacy.sections.changes.number') }}. {{ t('privacy.sections.changes.title') }}
              </h2>

              <p class="text-default leading-relaxed">
                {{ t('privacy.sections.changes.description') }}
              </p>
            </section>

            <UDivider class="my-8" />

            <!-- 9) Legge applicabile -->
            <section class="mb-12">
              <h2 class="text-3xl font-bold text-highlighted mb-6">
                {{ t('privacy.sections.law.number') }}. {{ t('privacy.sections.law.title') }}
              </h2>

              <p class="text-default leading-relaxed">
                {{ t('privacy.sections.law.description') }}
              </p>
            </section>

            <UDivider class="my-8" />

            <!-- Note aggiuntive -->
            <section class="mb-12">
              <div class="bg-elevated rounded-lg p-6">
                <h3 class="text-lg font-semibold text-highlighted mb-3">
                  {{ t('privacy.sections.additionalNotes.title') }}
                </h3>

                <div class="space-y-3 text-muted">
                  <p class="flex items-start gap-2">
                    <UIcon name="i-lucide-shield-check" class="size-5 text-primary mt-0.5 shrink-0" />
                    <span><strong class="text-default">{{ t('privacy.sections.additionalNotes.transfers') }}:</strong> {{ t('privacy.sections.additionalNotes.transfersDesc') }}</span>
                  </p>
                  <p class="flex items-start gap-2">
                    <UIcon name="i-lucide-users" class="size-5 text-warning mt-0.5 shrink-0" />
                    <span><strong class="text-default">{{ t('privacy.sections.additionalNotes.minors') }}:</strong> {{ t('privacy.sections.additionalNotes.minorsDesc') }}</span>
                  </p>
                </div>
              </div>
            </section>

            <!-- Footer CTA -->
            <section class="text-center py-12 border-t border-default">
              <h3 class="text-2xl font-bold text-highlighted mb-4">
                {{ t('privacy.cta.title') }}
              </h3>

              <div class="space-y-4">
                <div class="text-muted">
                  <p class="mb-2"><strong class="text-default">{{ t('privacy.cta.controller') }}:</strong> {{ t('privacy.cta.company') }}</p>
                  <p><strong class="text-default">{{ t('privacy.cta.email') }}:</strong> <a href="mailto:privacy@example.com" class="text-primary hover:underline">privacy@example.com</a></p>
                </div>

                <div class="flex flex-wrap items-center justify-center gap-3 mt-6">
                  <UButton
                    href="mailto:privacy@example.com"
                    color="primary"
                    size="lg"
                    leading-icon="i-lucide-mail"
                  >
                    {{ t('privacy.cta.contact') }}
                  </UButton>
                  <UButton
                    to="/legal/tos"
                    color="neutral"
                    variant="outline"
                    size="lg"
                  >
                    {{ t('privacy.cta.terms') }}
                  </UButton>
                  <UButton
                    to="/legal/dpa"
                    color="neutral"
                    variant="outline"
                    size="lg"
                  >
                    {{ t('privacy.cta.dpa') }}
                  </UButton>
                </div>
              </div>
            </section>
          </div>
        </div>
      </UContainer>
    </UPageBody>
  </UPage>
</template>
