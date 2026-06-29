<script setup lang="ts">
// Public site → Ceremly → Cookie policy. Port of CookiePage/LegalPage (site-company.jsx).
// Nav and footer come from the public-site layout.
definePageMeta({ layout: 'public-site', auth: false })

const { t, tm, rt } = useI18n()
const runtimeConfig = useRuntimeConfig()
const baseUrl = ((runtimeConfig.public.baseURL as string) || '').replace(/\/$/, '')

// Brand email: env-driven (outside i18n due to the '@' character)
const privacyEmail = runtimeConfig.public.privacyEmail

const seoTitle = t('ceremly.site.cookie.seoTitle')
const seoDescription = t('ceremly.site.cookie.seoDescription')
useSeoMeta({
    title: seoTitle,
    description: seoDescription,
    ogTitle: seoTitle,
    ogDescription: seoDescription,
    ogImage: `${baseUrl}/ogImage-it.png`,
    ogType: 'website',
})

interface Section { t: string, ps: string[] }
const sections = computed(() => (tm('ceremly.site.cookie.sections') as Section[]).map(s => ({
    t: rt(s.t),
    ps: ((s.ps as unknown as string[]) || []).map(p => rt(p as unknown as string)),
})))

interface Row { name: string, type: string, purpose: string, duration: string }
const rows = computed(() => (tm('ceremly.site.cookie.rows') as Row[]).map(r => ({
    name: rt(r.name), type: rt(r.type), purpose: rt(r.purpose), duration: rt(r.duration),
})))

const pad = (i: number) => String(i + 1).padStart(2, '0')
</script>

<template>
    <div>
        <!-- header -->
        <section style="border-bottom: 1px solid var(--line);">
            <div class="cer-site-wrap" style="padding: 72px 0 48px;">
                <span class="cer-tag">{{ t('ceremly.site.cookie.legalTag') }}</span>
                <h1 class="serif" style="font-size: clamp(34px, 5vw, 54px); font-weight: 800; line-height: 1.0; letter-spacing: -0.04em; margin: 18px 0 0;">{{ t('ceremly.site.cookie.title') }}</h1>
                <div class="mono" style="font-size: 12px; color: var(--ink-500); margin-top: 16px;">{{ t('ceremly.site.cookie.updatedLabel') }} · {{ t('ceremly.site.cookie.updated') }} · {{ t('ceremly.site.cookie.company') }}</div>
                <p style="font-size: 15px; color: var(--ink-700); line-height: 1.65; max-width: 660px; margin: 18px 0 0;">{{ t('ceremly.site.cookie.intro') }}</p>
            </div>
        </section>

        <!-- body: index + sections -->
        <div class="cer-site-wrap cer-legal-grid" style="padding: 56px 0 80px;">
            <aside class="cer-card cer-legal-index" style="padding: 22px;">
                <div class="mono" style="font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-400); margin-bottom: 14px;">{{ t('ceremly.site.cookie.indexLabel') }}</div>
                <div class="col" style="gap: 11px;">
                    <a v-for="(s, i) in sections" :key="s.t" :href="`#cookie-${i}`" class="row cer-legal-toc-link" style="gap: 10px; font-size: 13px; color: var(--ink-700); align-items: flex-start;">
                        <span class="mono" style="font-size: 11px; color: var(--orange); font-weight: 700; margin-top: 2px;">{{ pad(i) }}</span> {{ s.t }}
                    </a>
                </div>
            </aside>

            <div style="max-width: 720px;">
                <div v-for="(s, i) in sections" :id="`cookie-${i}`" :key="s.t" :style="{ paddingBottom: '36px', marginBottom: '36px', borderBottom: i < sections.length - 1 ? '1px solid var(--line)' : 'none' }">
                    <h2 class="serif" style="font-size: 25px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 14px; display: flex; gap: 12px; align-items: baseline;">
                        <span class="mono" style="font-size: 13px; color: var(--orange); font-weight: 700;">{{ pad(i) }}</span>{{ s.t }}
                    </h2>
                    <p v-for="(p, pi) in s.ps" :key="pi" style="font-size: 14px; line-height: 1.7; color: var(--ink-700); margin: 0 0 12px;">{{ p }}</p>

                    <!-- cookie table in section 2 -->
                    <div v-if="i === 1" class="cer-card" style="overflow: hidden; margin-top: 6px;">
                        <table class="cer-table">
                            <thead>
                                <tr>
                                    <th>{{ t('ceremly.site.cookie.tableHead.name') }}</th>
                                    <th>{{ t('ceremly.site.cookie.tableHead.type') }}</th>
                                    <th>{{ t('ceremly.site.cookie.tableHead.purpose') }}</th>
                                    <th>{{ t('ceremly.site.cookie.tableHead.duration') }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="r in rows" :key="r.name">
                                    <td class="mono" style="font-size: 12px; font-weight: 700;">{{ r.name }}</td>
                                    <td><span class="pill neutral">{{ r.type }}</span></td>
                                    <td style="color: var(--ink-700);">{{ r.purpose }}</td>
                                    <td class="mono" style="font-size: 12px;">{{ r.duration }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <!-- contact email in the last section -->
                    <p v-if="i === sections.length - 1" style="font-size: 14px; line-height: 1.7; color: var(--ink-700); margin: 0;">
                        {{ t('ceremly.site.cookie.contactPrefix') }} <a :href="`mailto:${privacyEmail}`" style="color: var(--purple-bright); font-weight: 600;">{{ privacyEmail }}</a>
                    </p>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.cer-legal-grid {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 56px;
    align-items: start;
}

.cer-legal-index {
    position: sticky;
    top: 96px;
}

.cer-legal-toc-link {
    text-decoration: none;
}

.cer-legal-toc-link:hover {
    color: var(--ink);
}

@media (max-width: 1023px) {
    .cer-legal-grid {
        grid-template-columns: 1fr;
        gap: 28px;
    }

    .cer-legal-index {
        position: static;
    }
}
</style>
