<script setup lang="ts">
// Sito pubblico → Per chi (casi d'uso). Corpo condiviso di UseCasePage
// (site-usecases.jsx). Un template, cinque declinazioni lette da i18n in
// ceremly.site.usecases.<id>.*. La SEO sta nelle singole pagine.
import CerIcon from '~/components/ceremly/CerIcon.vue'
import CerMark from '~/components/ceremly/CerMark.vue'
import CerMiniInvite from '~/components/ceremly/CerMiniInvite.vue'
import CerSiteH2 from '~/components/ceremly/CerSiteH2.vue'
import CerSiteCTA from '~/components/ceremly/CerSiteCTA.vue'

const props = defineProps<{ id: string }>()

const { t, tm, rt } = useI18n()
const localePath = useLocalePath()

const base = computed(() => `ceremly.site.usecases.${props.id}`)
const isPlanner = computed(() => props.id === 'planner')

// Valori strutturali/CSS per id — NON in i18n (sono valori CSS o nomi icona).
interface InviteMeta { bg: string, color: string, cta: string }
const inviteMeta: Record<string, InviteMeta> = {
    matrimoni: { bg: 'var(--bone-300)', color: 'var(--ink)', cta: 'Conferma →' },
    lauree: { bg: 'var(--purple)', color: 'var(--ink)', cta: 'Conferma →' },
    battesimi: { bg: 'var(--bone-200)', color: 'var(--ink)', cta: 'Conferma →' },
    compleanni: { bg: 'var(--orange-soft)', color: 'var(--ink)', cta: 'Conferma →' },
    planner: { bg: 'var(--ink)', color: 'var(--bone-50)', cta: 'Apri →' },
}
const invite = computed(() => inviteMeta[props.id] || inviteMeta.matrimoni!)

// Colore dell'evidenziatore nel titolo hero per id (default viola).
const markColor: Record<string, string> = {
    matrimoni: 'var(--purple)',
    lauree: 'var(--purple)',
    battesimi: 'var(--bone-300)',
    compleanni: 'var(--purple)',
    planner: 'var(--purple)',
}
const heroMarkColor = computed(() => markColor[props.id] || 'var(--purple)')

// Icone delle feature per id (4 per id) — nomi CerIcon, non traducibili.
const featIcons: Record<string, string[]> = {
    matrimoni: ['guests', 'heart', 'bell', 'upload'],
    lauree: ['sparkle', 'whatsapp', 'calendar', 'chart'],
    battesimi: ['home', 'guests', 'heart', 'qr'],
    compleanni: ['send', 'bell', 'guests', 'chart'],
    planner: ['settings', 'send', 'guests', 'copy'],
}

interface Pain { t: string, d: string }
const pains = computed(() => (tm(`${base.value}.pains`) as Pain[]).map(x => ({ t: rt(x.t), d: rt(x.d) })))

interface Feat { t: string, d: string }
const feats = computed(() => {
    const icons = featIcons[props.id] || []
    return (tm(`${base.value}.feats`) as Feat[]).map((x, i) => ({ i: icons[i] || 'sparkle', t: rt(x.t), d: rt(x.d) }))
})

const heroPrimaryTo = computed(() => isPlanner.value ? localePath('/contactUs') : localePath('/signup'))
</script>

<template>
    <div>
        <!-- hero 2 colonne (full-bleed) -->
        <section style="border-bottom: 1px solid var(--line);">
            <div class="cer-site-wrap cer-uc-hero">
                <div>
                    <span
                        class="cer-tag"
                        style="background: var(--wine-soft); color: var(--purple-ink); border-color: transparent; display: inline-flex;"
                    >{{ t(`${base}.tag`) }}</span>
                    <h1 class="serif cer-uc-hero-h1">
                        {{ t(`${base}.heroTitlePart1`) }}<br><template v-if="t(`${base}.heroTitlePart2`)">{{ t(`${base}.heroTitlePart2`) }} </template><CerMark :c="heroMarkColor">{{ t(`${base}.heroTitleMark`) }}</CerMark>.
                    </h1>
                    <p class="cer-uc-hero-sub">{{ t(`${base}.heroSub`) }}</p>
                    <div class="row cer-uc-hero-actions">
                        <NuxtLink :to="heroPrimaryTo" class="cer-btn" style="padding: 14px 22px; font-size: 14px;">
                            <CerIcon name="sparkle" :s="14" /> {{ t(`${base}.heroPrimary`) }}
                        </NuxtLink>
                        <NuxtLink :to="localePath('/esempi')" class="cer-btn ghost" style="padding: 14px 22px; font-size: 14px;">
                            <CerIcon name="eye" :s="14" /> {{ t(`${base}.heroSecondary`) }}
                        </NuxtLink>
                    </div>
                </div>
                <div class="cer-uc-hero-art">
                    <CerMiniInvite
                        :w="310"
                        :h="400"
                        :rotate="-3"
                        :bg="invite.bg"
                        :color="invite.color"
                        :date="t(`${base}.inviteDate`)"
                        :italic="props.id === 'matrimoni' ? t(`${base}.inviteItalic`) : undefined"
                        :sub="t(`${base}.inviteSub`)"
                        :cta="invite.cta"
                    >
                        <template #names>
                            {{ t(`${base}.nameLine1`) }}<br>{{ t(`${base}.nameLine2`) }}
                        </template>
                    </CerMiniInvite>
                    <div class="cer-uc-chip">
                        <div class="serif" style="font-size: 38px; font-weight: 800; line-height: 1; letter-spacing: -0.03em;">{{ t(`${base}.chipN`) }}</div>
                        <div class="small muted" style="margin-top: 4px;">{{ t(`${base}.chipL`) }}</div>
                    </div>
                </div>
            </div>
        </section>

        <!-- pains (banda bone-100) -->
        <section style="background: var(--bone-100); border-bottom: 1px solid var(--line);">
            <div class="cer-site-wrap" style="padding: 72px 0;">
                <CerSiteH2
                    :tag="t(`${base}.painsTag`)"
                    :tag-style="{ background: 'var(--orange-soft)', color: 'var(--orange-deep)', borderColor: 'transparent' }"
                    :title="t(`${base}.painsTitle`)"
                />
                <div class="cer-uc-grid3">
                    <div v-for="(p, i) in pains" :key="p.t" class="cer-card" style="padding: 24px;">
                        <div class="mono" style="font-size: 13px; font-weight: 700; color: var(--orange);">{{ '0' + (i + 1) }}</div>
                        <div class="serif" style="font-size: 22px; font-weight: 700; margin-top: 10px; letter-spacing: -0.02em; line-height: 1.15;">{{ p.t }}</div>
                        <div style="font-size: 14px; margin-top: 8px; color: var(--ink-700); line-height: 1.55;">{{ p.d }}</div>
                    </div>
                </div>
            </div>
        </section>

        <!-- features -->
        <div class="cer-site-wrap" style="padding: 72px 0;">
            <CerSiteH2
                :tag="t(`${base}.featsTag`)"
                :tag-style="{ background: 'var(--wine-soft)', color: 'var(--purple-ink)', borderColor: 'transparent' }"
                :title="t(`${base}.featsTitle`)"
            />
            <div class="cer-uc-grid4">
                <div v-for="f in feats" :key="f.t" class="cer-card" style="padding: 22px;">
                    <div style="width: 42px; height: 42px; border-radius: 10px; background: var(--bone-200); border: 1.5px solid var(--ink); display: inline-flex; align-items: center; justify-content: center;">
                        <CerIcon :name="f.i" :s="19" />
                    </div>
                    <div class="serif" style="font-size: 19px; font-weight: 700; margin-top: 16px; letter-spacing: -0.02em; line-height: 1.15;">{{ f.t }}</div>
                    <div style="font-size: 13px; margin-top: 8px; color: var(--ink-700); line-height: 1.55;">{{ f.d }}</div>
                </div>
            </div>
        </div>

        <!-- quote (banda bone-100) -->
        <section style="background: var(--bone-100); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line);">
            <div class="cer-site-wrap" style="padding: 64px 0;">
                <div style="max-width: 860px; margin: 0 auto; text-align: center;">
                    <blockquote class="serif" style="font-size: 32px; font-weight: 700; line-height: 1.25; margin: 0; letter-spacing: -0.025em;">{{ t(`${base}.quoteText`) }}</blockquote>
                </div>
            </div>
        </section>

        <!-- CTA: planner custom, gli altri default + sub + secondary -->
        <CerSiteCTA
            v-if="isPlanner"
            :sub="t(`${base}.ctaSub`)"
            :primary="t(`${base}.ctaPrimary`)"
            :secondary="t(`${base}.ctaSecondary`)"
            :secondary-to="localePath('/prezzi')"
        >
            <template #title>
                {{ t(`${base}.ctaTitlePart1`) }} <CerMark c="var(--orange)">{{ t(`${base}.ctaTitleMark`) }}</CerMark>.
            </template>
        </CerSiteCTA>
        <CerSiteCTA
            v-else
            :sub="t(`${base}.ctaSub`)"
            :secondary="t(`${base}.ctaSecondary`)"
            :secondary-to="localePath('/esempi')"
        />
    </div>
</template>

<style scoped>
.cer-uc-hero {
    padding: 72px 0 80px;
    display: grid;
    grid-template-columns: 1.1fr 0.9fr;
    gap: 56px;
    align-items: center;
}

.cer-uc-hero-h1 {
    font-size: clamp(38px, 6vw, 62px);
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.04em;
    margin: 18px 0 0;
}

.cer-uc-hero-sub {
    font-size: 17px;
    color: var(--ink-700);
    line-height: 1.6;
    max-width: 520px;
    margin: 20px 0 0;
}

.cer-uc-hero-actions {
    gap: 12px;
    margin-top: 30px;
    flex-wrap: wrap;
}

.cer-uc-hero-art {
    position: relative;
    height: 440px;
    display: flex;
    justify-content: center;
}

.cer-uc-chip {
    position: absolute;
    right: 26px;
    bottom: 8px;
    width: 218px;
    padding: 16px;
    background: var(--bone-50);
    border-radius: 14px;
    border: 2px solid var(--ink);
    box-shadow: 6px 6px 0 var(--ink);
    transform: rotate(2deg);
}

.cer-uc-grid3 {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 18px;
}

.cer-uc-grid4 {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
}

@media (max-width: 1023px) {
    .cer-uc-hero {
        grid-template-columns: 1fr;
        gap: 36px;
    }

    .cer-uc-grid3,
    .cer-uc-grid4 {
        grid-template-columns: 1fr;
    }
}
</style>
