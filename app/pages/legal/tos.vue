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
:headline="t('tos.meta.headline')" :title="t('tos.meta.title')"
                        :description="t('tos.meta.effectiveDate')" class="px-0" />

                    <!-- Intro -->
                    <div class="my-12">
                        <p class="text-lg text-default leading-relaxed">
                            {{ t('tos.intro.description') }}
                        </p>
                    </div>

                    <div class="prose prose-neutral dark:prose-invert max-w-none">
                        <UDivider class="my-8" />

                        <!-- 1) Panoramica -->
                        <section class="mb-12">
                            <h2 class="text-3xl font-bold text-highlighted mb-6">
                                {{ t('tos.sections.overview.number') }}. {{ t('tos.sections.overview.title') }}
                            </h2>

                            <p class="text-default leading-relaxed">
                                {{ t('tos.sections.overview.description') }}
                            </p>
                        </section>

                        <UDivider class="my-8" />

                        <!-- 2) Account -->
                        <section class="mb-12">
                            <h2 class="text-3xl font-bold text-highlighted mb-6">
                                {{ t('tos.sections.account.number') }}. {{ t('tos.sections.account.title') }}
                            </h2>

                            <p class="text-default leading-relaxed mb-4">
                                {{ t('tos.sections.account.description') }}
                            </p>

                            <div class="bg-elevated/50 rounded-lg p-4">
                                <p class="text-sm text-muted">
                                    <strong class="text-default">{{ t('tos.sections.account.important.label')
                                        }}:</strong> {{ t('tos.sections.account.important.text') }}
                                </p>
                            </div>
                        </section>

                        <UDivider class="my-8" />

                        <!-- 3) Prova gratuita e Abbonamenti -->
                        <section class="mb-12">
                            <h2 class="text-3xl font-bold text-highlighted mb-6">
                                {{ t('tos.sections.trial.number') }}. {{ t('tos.sections.trial.title') }}
                            </h2>

                            <div class="space-y-4 text-default">
                                <p class="leading-relaxed">
                                    {{ t('tos.sections.trial.trialTitle') }}
                                </p>
                                <p class="text-muted leading-relaxed">
                                    {{ t('tos.sections.trial.trialDescription') }}
                                </p>

                                <p class="leading-relaxed mt-4">
                                    {{ t('tos.sections.trial.afterTrialTitle') }}
                                </p>
                                <p class="text-muted leading-relaxed">
                                    {{ t('tos.sections.trial.afterTrialDescription') }}
                                </p>
                            </div>
                        </section>

                        <UDivider class="my-8" />

                        <!-- 4) Piani e prezzi -->
                        <section class="mb-12">
                            <h2 class="text-3xl font-bold text-highlighted mb-6">
                                {{ t('tos.sections.pricing.number') }}. {{ t('tos.sections.pricing.title') }}
                            </h2>

                            <div class="space-y-4 text-default leading-relaxed">
                                <p>
                                    <strong>{{ t('tos.sections.pricing.freelance.name') }}</strong> - {{
                                        t('tos.sections.pricing.freelance.price') }}{{ t('tos.sections.pricing.freelance.period') }}: {{ t('tos.sections.pricing.freelance.description') }}
                                </p>

                                <p>
                                    <strong>{{ t('tos.sections.pricing.studio.name') }}</strong> - {{
                                        t('tos.sections.pricing.studio.price') }}{{ t('tos.sections.pricing.studio.period') }}: {{ t('tos.sections.pricing.studio.description') }}
                                </p>

                                <p>
                                    <strong>{{ t('tos.sections.pricing.venuePartner.name') }}</strong> - {{
                                        t('tos.sections.pricing.venuePartner.price') }}{{ t('tos.sections.pricing.venuePartner.period') }}: {{ t('tos.sections.pricing.venuePartner.description') }}
                                </p>

                                <p class="text-muted text-sm">
                                    {{ t('tos.sections.pricing.fairUse.text') }}
                                </p>
                            </div>
                        </section>

                        <UDivider class="my-8" />

                        <!-- 5) Dati, ruoli e GDPR -->
                        <section class="mb-12">
                            <h2 class="text-3xl font-bold text-highlighted mb-6">
                                {{ t('tos.sections.gdpr.number') }}. {{ t('tos.sections.gdpr.title') }}
                            </h2>

                            <p class="text-default leading-relaxed mb-4">
                                {{ t('tos.sections.gdpr.description') }}
                            </p>

                            <p class="text-muted leading-relaxed mb-4">
                                {{ t('tos.sections.gdpr.requirement') }}
                            </p>

                            <NuxtLink to="/legal/dpa" class="text-primary hover:underline">
                                {{ t('tos.sections.gdpr.dpaLink') }}
                            </NuxtLink>
                        </section>

                        <UDivider class="my-8" />

                        <!-- 6) Uso consentito -->
                        <section class="mb-12">
                            <h2 class="text-3xl font-bold text-highlighted mb-6">
                                {{ t('tos.sections.usage.number') }}. {{ t('tos.sections.usage.title') }}
                            </h2>

                            <p class="text-default leading-relaxed">
                                {{ t('tos.sections.usage.description') }}
                            </p>
                        </section>

                        <UDivider class="my-8" />

                        <!-- 7) Servizi di terze parti -->
                        <section class="mb-12">
                            <h2 class="text-3xl font-bold text-highlighted mb-6">
                                {{ t('tos.sections.thirdParty.number') }}. {{ t('tos.sections.thirdParty.title') }}
                            </h2>

                            <p class="text-default leading-relaxed">
                                {{ t('tos.sections.thirdParty.description') }}
                            </p>
                        </section>

                        <UDivider class="my-8" />

                        <!-- 8) Garanzie e responsabilità -->
                        <section class="mb-12">
                            <h2 class="text-3xl font-bold text-highlighted mb-6">
                                {{ t('tos.sections.liability.number') }}. {{ t('tos.sections.liability.title') }}
                            </h2>

                            <p class="text-default leading-relaxed mb-4">
                                {{ t('tos.sections.liability.description') }}
                            </p>

                            <div class="bg-elevated/50 rounded-lg p-4">
                                <p class="text-sm text-muted">
                                    <strong class="text-default">{{ t('tos.sections.liability.limitation.label')
                                        }}:</strong> {{ t('tos.sections.liability.limitation.text') }}
                                </p>
                            </div>
                        </section>

                        <UDivider class="my-8" />

                        <!-- 9) Sospensione e cessazione -->
                        <section class="mb-12">
                            <h2 class="text-3xl font-bold text-highlighted mb-6">
                                {{ t('tos.sections.termination.number') }}. {{ t('tos.sections.termination.title') }}
                            </h2>

                            <div class="space-y-4 text-default">
                                <div>
                                    <h3 class="font-semibold text-lg mb-2">• {{
                                        t('tos.sections.termination.byProvider.title') }}</h3>
                                    <p class="text-muted leading-relaxed ml-4">
                                        {{ t('tos.sections.termination.byProvider.description') }}
                                    </p>
                                </div>

                                <div>
                                    <h3 class="font-semibold text-lg mb-2">• {{
                                        t('tos.sections.termination.byClient.title') }}</h3>
                                    <p class="text-muted leading-relaxed ml-4">
                                        {{ t('tos.sections.termination.byClient.description') }}
                                    </p>
                                </div>
                            </div>
                        </section>

                        <UDivider class="my-8" />

                        <!-- 10) Aggiornamenti dei Termini -->
                        <section class="mb-12">
                            <h2 class="text-3xl font-bold text-highlighted mb-6">
                                {{ t('tos.sections.updates.number') }}. {{ t('tos.sections.updates.title') }}
                            </h2>

                            <p class="text-default leading-relaxed">
                                {{ t('tos.sections.updates.description') }}
                            </p>
                        </section>

                        <UDivider class="my-8" />

                        <!-- 11) Legge applicabile e foro -->
                        <section class="mb-12">
                            <h2 class="text-3xl font-bold text-highlighted mb-6">
                                {{ t('tos.sections.law.number') }}. {{ t('tos.sections.law.title') }}
                            </h2>

                            <p class="text-default leading-relaxed">
                                {{ t('tos.sections.law.description') }}
                            </p>
                        </section>

                        <UDivider class="my-8" />

                        <!-- Footer CTA -->
                        <section class="text-center py-12 border-t border-default">
                            <h3 class="text-2xl font-bold text-highlighted mb-4">
                                {{ t('tos.cta.title') }}
                            </h3>

                            <div class="space-y-4">
                                <div class="text-muted">
                                    <p><strong class="text-default">{{ t('tos.cta.legalEmail') }}:</strong> <a
                                            :href="`mailto:${legalEmail}`"
                                            class="text-primary hover:underline">{{ legalEmail }}</a></p>
                                </div>

                                <div class="flex flex-wrap items-center justify-center gap-3 mt-6">
                                    <UButton
:href="`mailto:${legalEmail}`" color="primary" size="lg"
                                        leading-icon="i-lucide-mail">
                                        {{ t('tos.cta.contact') }}
                                    </UButton>
                                    <UButton to="/legal/privacy" color="neutral" variant="outline" size="lg">
                                        {{ t('tos.cta.privacy') }}
                                    </UButton>
                                    <UButton to="/legal/dpa" color="neutral" variant="outline" size="lg">
                                        {{ t('tos.cta.dpa') }}
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
