<script setup lang="ts">
definePageMeta({
  auth: false
})

const { t } = useI18n()

// Email brand: env-driven (fuori da i18n per il carattere '@')
const legalEmail = useRuntimeConfig().public.legalEmail
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <div class="max-w-4xl mx-auto">
          <UPageHeader
            :headline="t('dpa.meta.headline')"
            :title="t('dpa.meta.title')"
            :description="t('dpa.meta.effectiveDate')"
            class="px-0"
          />

          <!-- Intro -->
          <div class="my-12">
            <p class="text-lg text-default leading-relaxed">
              {{ t('dpa.intro.description') }}
            </p>
          </div>

          <div class="prose prose-neutral dark:prose-invert max-w-none">
            <UDivider class="my-8" />

            <!-- Sintesi -->
            <section class="mb-12">
              <div class="bg-elevated rounded-lg p-6">
                <h2 class="text-2xl font-bold text-highlighted mb-4">
                  {{ t('dpa.summary.title') }}
                </h2>
                <div class="space-y-2 text-default leading-relaxed">
                  <p><strong>{{ t('dpa.summary.roles') }}:</strong> {{ t('dpa.summary.rolesDesc') }}</p>
                  <p><strong>{{ t('dpa.summary.scope') }}:</strong> {{ t('dpa.summary.scopeDesc') }}</p>
                  <p><strong>{{ t('dpa.summary.toms') }}:</strong> {{ t('dpa.summary.tomsDesc') }}</p>
                  <p><strong>{{ t('dpa.summary.subprocessors') }}:</strong> {{ t('dpa.summary.subprocessorsDesc') }}</p>
                </div>
              </div>
            </section>

            <UDivider class="my-8" />

            <!-- 1) Oggetto, durata e finalità -->
            <section class="mb-12">
              <h2 class="text-3xl font-bold text-highlighted mb-6">
                {{ t('dpa.sections.purpose.number') }}. {{ t('dpa.sections.purpose.title') }}
              </h2>
              <p class="text-default leading-relaxed">
                {{ t('dpa.sections.purpose.description') }}
              </p>
            </section>

            <UDivider class="my-8" />

            <!-- 2) Categorie di interessati e dati -->
            <section class="mb-12">
              <h2 class="text-3xl font-bold text-highlighted mb-6">
                {{ t('dpa.sections.categories.number') }}. {{ t('dpa.sections.categories.title') }}
              </h2>
              <p class="text-default leading-relaxed mb-4">
                <strong>{{ t('dpa.sections.categories.subjectsLabel') }}:</strong> {{ t('dpa.sections.categories.subjects') }}
              </p>
              <p class="text-default leading-relaxed mb-4">
                <strong>{{ t('dpa.sections.categories.dataLabel') }}:</strong> {{ t('dpa.sections.categories.data') }}
              </p>
              <p class="text-muted leading-relaxed">
                {{ t('dpa.sections.categories.note') }}
              </p>
            </section>

            <UDivider class="my-8" />

            <!-- 3) Istruzioni e conformità -->
            <section class="mb-12">
              <h2 class="text-3xl font-bold text-highlighted mb-6">
                {{ t('dpa.sections.instructions.number') }}. {{ t('dpa.sections.instructions.title') }}
              </h2>
              <p class="text-default leading-relaxed">
                {{ t('dpa.sections.instructions.description') }}
              </p>
            </section>

            <UDivider class="my-8" />

            <!-- 4) Riservatezza -->
            <section class="mb-12">
              <h2 class="text-3xl font-bold text-highlighted mb-6">
                {{ t('dpa.sections.confidentiality.number') }}. {{ t('dpa.sections.confidentiality.title') }}
              </h2>
              <p class="text-default leading-relaxed">
                {{ t('dpa.sections.confidentiality.description') }}
              </p>
            </section>

            <UDivider class="my-8" />

            <!-- 5) Sicurezza -->
            <section class="mb-12">
              <h2 class="text-3xl font-bold text-highlighted mb-6">
                {{ t('dpa.sections.security.number') }}. {{ t('dpa.sections.security.title') }}
              </h2>
              <p class="text-default leading-relaxed">
                {{ t('dpa.sections.security.description') }}
              </p>
            </section>

            <UDivider class="my-8" />

            <!-- 6) Sub-responsabili -->
            <section class="mb-12">
              <h2 class="text-3xl font-bold text-highlighted mb-6">
                {{ t('dpa.sections.subprocessors.number') }}. {{ t('dpa.sections.subprocessors.title') }}
              </h2>
              <p class="text-default leading-relaxed mb-4">
                {{ t('dpa.sections.subprocessors.description') }}
              </p>
              <p class="text-muted leading-relaxed">
                {{ t('dpa.sections.subprocessors.objection') }}
              </p>
            </section>

            <UDivider class="my-8" />

            <!-- 7) Assistenza al Titolare -->
            <section class="mb-12">
              <h2 class="text-3xl font-bold text-highlighted mb-6">
                {{ t('dpa.sections.assistance.number') }}. {{ t('dpa.sections.assistance.title') }}
              </h2>
              <p class="text-default leading-relaxed">
                {{ t('dpa.sections.assistance.description') }}
              </p>
            </section>

            <UDivider class="my-8" />

            <!-- 8) Violazioni -->
            <section class="mb-12">
              <h2 class="text-3xl font-bold text-highlighted mb-6">
                {{ t('dpa.sections.breach.number') }}. {{ t('dpa.sections.breach.title') }}
              </h2>
              <p class="text-default leading-relaxed">
                {{ t('dpa.sections.breach.description') }}
              </p>
            </section>

            <UDivider class="my-8" />

            <!-- 9) Cancellazione o restituzione -->
            <section class="mb-12">
              <h2 class="text-3xl font-bold text-highlighted mb-6">
                {{ t('dpa.sections.deletion.number') }}. {{ t('dpa.sections.deletion.title') }}
              </h2>
              <p class="text-default leading-relaxed">
                {{ t('dpa.sections.deletion.description') }}
              </p>
            </section>

            <UDivider class="my-8" />

            <!-- 10) Audit e prove -->
            <section class="mb-12">
              <h2 class="text-3xl font-bold text-highlighted mb-6">
                {{ t('dpa.sections.audit.number') }}. {{ t('dpa.sections.audit.title') }}
              </h2>
              <p class="text-default leading-relaxed">
                {{ t('dpa.sections.audit.description') }}
              </p>
            </section>

            <UDivider class="my-8" />

            <!-- 11) Trasferimenti extra SEE -->
            <section class="mb-12">
              <h2 class="text-3xl font-bold text-highlighted mb-6">
                {{ t('dpa.sections.transfers.number') }}. {{ t('dpa.sections.transfers.title') }}
              </h2>
              <p class="text-default leading-relaxed">
                {{ t('dpa.sections.transfers.description') }}
              </p>
            </section>

            <UDivider class="my-8" />

            <!-- 12) Gerarchia -->
            <section class="mb-12">
              <h2 class="text-3xl font-bold text-highlighted mb-6">
                {{ t('dpa.sections.hierarchy.number') }}. {{ t('dpa.sections.hierarchy.title') }}
              </h2>
              <p class="text-default leading-relaxed">
                {{ t('dpa.sections.hierarchy.description') }}
              </p>
            </section>

            <UDivider class="my-8" />

            <!-- Allegato A -->
            <section class="mb-12">
              <div class="bg-elevated rounded-lg p-6">
                <h2 class="text-2xl font-bold text-highlighted mb-6">
                  {{ t('dpa.annexA.title') }}
                </h2>

                <div class="space-y-4 text-default leading-relaxed">
                  <p>{{ t('dpa.annexA.encryption') }}</p>
                  <p>{{ t('dpa.annexA.accessControl') }}</p>
                  <p>{{ t('dpa.annexA.monitoring') }}</p>
                  <p>{{ t('dpa.annexA.backup') }}</p>
                  <p>{{ t('dpa.annexA.retention') }}</p>
                  <p>{{ t('dpa.annexA.email') }}</p>
                  <p>{{ t('dpa.annexA.privacyByDesign') }}</p>
                  <p>{{ t('dpa.annexA.processes') }}</p>
                </div>
              </div>
            </section>

            <!-- Footer CTA -->
            <section class="text-center py-12 border-t border-default">
              <h3 class="text-2xl font-bold text-highlighted mb-4">
                {{ t('dpa.cta.title') }}
              </h3>

              <div class="space-y-4">
                <div class="text-muted">
                  <p><strong class="text-default">{{ t('dpa.cta.email') }}:</strong> <a :href="`mailto:${legalEmail}`" class="text-primary hover:underline">{{ legalEmail }}</a></p>
                </div>

                <div class="flex flex-wrap items-center justify-center gap-3 mt-6">
                  <UButton
                    :href="`mailto:${legalEmail}`"
                    color="primary"
                    size="lg"
                    leading-icon="i-lucide-mail"
                  >
                    {{ t('dpa.cta.contact') }}
                  </UButton>
                  <UButton
                    to="/legal/privacy"
                    color="neutral"
                    variant="outline"
                    size="lg"
                  >
                    {{ t('dpa.cta.privacy') }}
                  </UButton>
                  <UButton
                    to="/legal/tos"
                    color="neutral"
                    variant="outline"
                    size="lg"
                  >
                    {{ t('dpa.cta.terms') }}
                  </UButton>
                  <UButton
                    to="/legal/subprocessors"
                    color="neutral"
                    variant="outline"
                    size="lg"
                  >
                    {{ t('dpa.cta.subprocessors') }}
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
