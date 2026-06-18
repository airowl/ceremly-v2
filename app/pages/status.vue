<script setup lang="ts">
// Sito pubblico → Risorse → Stato servizio. Port di StatoServizioPage (site-resources.jsx).
import CerSiteH2 from '~/components/ceremly/CerSiteH2.vue'

definePageMeta({ layout: 'public-site', auth: false })

const { t, tm, rt } = useI18n()
const runtimeConfig = useRuntimeConfig()
const baseUrl = ((runtimeConfig.public.baseURL as string) || '').replace(/\/$/, '')

const seoTitle = t('ceremly.site.stato.seoTitle')
const seoDescription = t('ceremly.site.stato.seoDescription')
useSeoMeta({
    title: seoTitle,
    description: seoDescription,
    ogTitle: seoTitle,
    ogDescription: seoDescription,
    ogImage: `${baseUrl}/ogImage-it.png`,
    ogType: 'website',
})

// Giorni "degradati" deterministici per componente (logica nel .vue, non i18n).
const compDeg: number[][] = [[], [], [21], [21, 44], []]
interface Comp { t: string }
const comps = computed(() => (tm('ceremly.site.stato.comps') as Comp[]).map((x, i) => ({ t: rt(x.t), deg: compDeg[i] || [] })))

const strips = Array.from({ length: 60 }, (_, i) => i)
function stripBg(deg: number[], i: number) {
    return deg.includes(i) ? 'var(--pending)' : 'color-mix(in srgb, var(--confirm) 55%, var(--bone-200))'
}

// Incidenti illustrativi: date/durata letterali, frasi in i18n.
const incidentDates = ['14 maggio 2026', '27 marzo 2026']
const incidentDurations = ['42 min', '18 min']
interface Incident { t: string, desc: string }
const incidents = computed(() => (tm('ceremly.site.stato.incidents') as Incident[]).map((x, i) => ({ d: incidentDates[i] || '', dur: incidentDurations[i] || '', t: rt(x.t), desc: rt(x.desc) })))
</script>

<template>
    <div>
        <!-- Hero custom: stato globale -->
        <section style="border-bottom: 1px solid var(--line);">
            <div class="cer-site-wrap" style="padding: 72px 0 56px;">
                <span class="cer-tag">{{ t('ceremly.site.stato.heroTag') }}</span>
                <div class="cer-card row" style="margin-top: 24px; padding: 28px 32px; gap: 18px; border-color: color-mix(in srgb, var(--confirm) 40%, transparent); border-width: 2px;">
                    <span style="width: 14px; height: 14px; border-radius: 50%; background: var(--confirm); flex-shrink: 0; box-shadow: 0 0 0 4px color-mix(in srgb, var(--confirm) 20%, transparent);" />
                    <div class="col" style="gap: 2px;">
                        <span class="serif" style="font-size: 30px; font-weight: 800; letter-spacing: -0.025em;">{{ t('ceremly.site.stato.allOperational') }}</span>
                        <span class="mono" style="font-size: 12px; color: var(--ink-500);">{{ t('ceremly.site.stato.uptimeLine') }}</span>
                    </div>
                </div>
            </div>
        </section>

        <!-- Componenti -->
        <div class="cer-site-wrap" style="padding: 56px 0 0;">
            <CerSiteH2 :tag="t('ceremly.site.stato.compsTag')" :title="t('ceremly.site.stato.compsTitle')" />
            <div class="cer-card" style="overflow: hidden;">
                <div v-for="(c, ci) in comps" :key="c.t" :style="{ padding: '18px 24px', borderBottom: ci < comps.length - 1 ? '1px solid var(--line)' : 'none' }">
                    <div class="row" style="justify-content: space-between; margin-bottom: 10px;">
                        <span style="font-size: 15px; font-weight: 600;">{{ c.t }}</span>
                        <span class="pill confirm"><span class="cer-dot" />{{ t('ceremly.site.stato.statusOperational') }}</span>
                    </div>
                    <div style="display: flex; gap: 3px;">
                        <span v-for="i in strips" :key="i" :title="c.deg.includes(i) ? t('ceremly.site.stato.legendDegraded') : t('ceremly.site.stato.legendOperational')" :style="{ flex: 1, height: '26px', borderRadius: '2px', background: stripBg(c.deg, i) }" />
                    </div>
                </div>
            </div>
            <div class="row" style="gap: 18px; margin-top: 12px; font-size: 12px; color: var(--ink-500);">
                <span class="row" style="gap: 6px;"><span style="width: 10px; height: 10px; border-radius: 2px; background: color-mix(in srgb, var(--confirm) 55%, var(--bone-200)); display: inline-block;" /> {{ t('ceremly.site.stato.legendOperational') }}</span>
                <span class="row" style="gap: 6px;"><span style="width: 10px; height: 10px; border-radius: 2px; background: var(--pending); display: inline-block;" /> {{ t('ceremly.site.stato.legendDegraded') }}</span>
            </div>
        </div>

        <!-- Incidenti -->
        <div class="cer-site-wrap" style="padding: 56px 0 80px;">
            <CerSiteH2 :tag="t('ceremly.site.stato.incidentsTag')" :title="t('ceremly.site.stato.incidentsTitle')" />
            <div class="col" style="gap: 14px;">
                <div v-for="inc in incidents" :key="inc.d" class="cer-card" style="padding: 20px 24px;">
                    <div class="cer-stato-inc-head">
                        <div class="row" style="gap: 14px;">
                            <span class="mono" style="font-size: 12px; color: var(--ink-500);">{{ inc.d }}</span>
                            <span class="serif" style="font-size: 19px; font-weight: 700; letter-spacing: -0.02em;">{{ inc.t }}</span>
                        </div>
                        <div class="row" style="gap: 10px;">
                            <span class="mono" style="font-size: 12px; color: var(--ink-500);">{{ inc.dur }}</span>
                            <span class="pill neutral"><span class="cer-dot" />{{ t('ceremly.site.stato.statusResolved') }}</span>
                        </div>
                    </div>
                    <p style="font-size: 14px; color: var(--ink-700); line-height: 1.55; margin: 10px 0 0; max-width: 760px;">{{ inc.desc }}</p>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.cer-stato-inc-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

@media (max-width: 1023px) {
    .cer-stato-inc-head {
        flex-direction: column;
        align-items: flex-start;
    }
}
</style>
