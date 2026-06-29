<script setup lang="ts">
// "Soft Meadow" design system showcase — port of brand.jsx.
// Internal reference page (not marketing): literal text, no i18n.
import CerIcon from '~/components/ceremly/CerIcon.vue'

definePageMeta({ auth: false, layout: false })
useSeoMeta({ title: 'Ceremly — Brand & Design System', robots: 'noindex' })

const palette = [
    { name: 'Primary', v: '#d4a373', on: '#3F3622' },
    { name: 'Camel+', v: '#c28c54', on: '#fff' },
    { name: 'Sage', v: '#ccd5ae', on: '#3F3622' },
    { name: 'Pale', v: '#e9edc9', on: '#3F3622' },
    { name: 'Sand', v: '#faedcd', on: '#3F3622' },
    { name: 'Canvas', v: '#fefae0', on: '#3F3622' },
]

const categories = [
    { k: 'Matrimonio', i: 'ring' },
    { k: 'Laurea', i: 'cap' },
    { k: 'Battesimo', i: 'cross' },
    { k: 'Compleanno', i: 'cake' },
]
</script>

<template>
    <div class="cer brand-page">
        <div class="brand-head">
            <!-- left column -->
            <div style="flex: 1; min-width: 0;">
                <span class="mono" style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--orange);">Soft Meadow</span>
                <div class="serif brand-display" style="font-weight: 800; line-height: 0.95; margin-top: 12px; letter-spacing: -0.045em;">
                    Inviti che<br>fanno <span style="color: var(--purple);">rumore</span>.
                </div>
                <p style="max-width: 540px; margin-top: 22px; font-size: 18px; line-height: 1.55; color: var(--ink-700);">
                    Una piattaforma italiana per inviti digitali e RSVP intelligenti — bold, diretta, senza fronzoli. Per chi preferisce la connessione vera alla perfezione patinata.
                </p>
                <div class="row" style="margin-top: 28px; gap: 12px; flex-wrap: wrap;">
                    <button class="cer-btn" style="white-space: nowrap;"><CerIcon name="sparkle" :s="14" /> Inizia un evento</button>
                    <button class="cer-btn ghost" style="white-space: nowrap;">Guarda la demo</button>
                </div>

                <!-- type specimen -->
                <div class="brand-type">
                    <div class="cer-card" style="padding: 18px;">
                        <div class="serif" style="font-size: 38px; font-weight: 800; line-height: 1;">Aa</div>
                        <div style="font-size: 14px; font-weight: 600; margin-top: 12px;">Manrope</div>
                        <div class="small muted" style="margin-top: 2px;">Display · 800 · poster</div>
                    </div>
                    <div class="cer-card" style="padding: 18px;">
                        <div style="font-family: var(--font-sans); font-size: 38px; font-weight: 500; line-height: 1;">Aa</div>
                        <div style="font-size: 14px; font-weight: 600; margin-top: 12px;">Manrope</div>
                        <div class="small muted" style="margin-top: 2px;">Body · 400–600</div>
                    </div>
                    <div class="cer-card" style="padding: 18px;">
                        <div class="mono" style="font-size: 34px; font-weight: 700; line-height: 1;">Aa</div>
                        <div style="font-size: 14px; font-weight: 600; margin-top: 12px;">Space Mono</div>
                        <div class="small muted" style="margin-top: 2px;">Label · metadati · tech</div>
                    </div>
                </div>
            </div>

            <!-- right column -->
            <div class="brand-rail">
                <!-- palette -->
                <div class="cer-card" style="padding: 20px;">
                    <div class="mono" style="font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-500);">Palette</div>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 12px;">
                        <div v-for="s in palette" :key="s.name" class="col" style="gap: 6px;">
                            <div :style="{ background: s.v, height: '54px', borderRadius: '8px', border: '1px solid var(--line)', display: 'flex', alignItems: 'flex-end', padding: '7px' }">
                                <span class="mono" :style="{ fontSize: '9px', color: s.on }">{{ s.v }}</span>
                            </div>
                            <span style="font-size: 12px; font-weight: 500;">{{ s.name }}</span>
                        </div>
                    </div>
                </div>

                <!-- components -->
                <div class="cer-card" style="padding: 20px;">
                    <div class="mono" style="font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-500);">Componenti</div>
                    <div class="row" style="gap: 8px; margin-top: 14px; flex-wrap: wrap;">
                        <button class="cer-btn small">Primario</button>
                        <button class="cer-btn small ghost">Ghost</button>
                        <span class="pill confirm"><span class="cer-dot" />Conferma</span>
                        <span class="pill pending"><span class="cer-dot" />In attesa</span>
                    </div>
                    <div class="row" style="gap: 8px; margin-top: 12px; flex-wrap: wrap;">
                        <span class="cer-tag" style="background: var(--orange-soft); color: var(--orange-deep); border-color: transparent;">Live now</span>
                        <span class="cer-tag" style="background: var(--blue-soft); color: var(--blue-deep); border-color: transparent;">Popular</span>
                        <span class="cer-tag">v0.1</span>
                    </div>
                    <input class="cer-input" placeholder="Campo con focus hard-shadow" style="margin-top: 14px;">
                </div>

                <!-- event categories -->
                <div class="cer-card" style="padding: 20px;">
                    <div class="mono" style="font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-500);">Categorie evento</div>
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 12px;">
                        <div v-for="c in categories" :key="c.k" style="border: 1px solid var(--line); border-radius: 10px; padding: 12px; text-align: center; background: var(--bone);">
                            <div style="color: var(--purple);"><CerIcon :name="c.i" :s="22" /></div>
                            <div style="font-size: 11px; margin-top: 6px; color: var(--ink-700);">{{ c.k }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="brand-foot">
            <span class="mono" style="font-size: 12px;">v0.1 · MVP</span>
            <span style="color: var(--ink-300);">—</span>
            <span>Hard shadows · crisp outlines · tonal layers</span>
            <span style="color: var(--ink-300);">—</span>
            <span>8px grid · radius 8 / 16</span>
            <span style="color: var(--ink-300);">—</span>
            <span>WCAG 2.1 AA</span>
        </div>
    </div>
</template>

<style scoped>
.brand-page {
    min-height: 100vh;
    background: var(--bone);
    padding: clamp(24px, 5vw, 56px);
}

.brand-head {
    display: flex;
    gap: 56px;
    align-items: flex-start;
}

.brand-display {
    font-size: clamp(48px, 8vw, 90px);
}

.brand-type {
    margin-top: 40px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
}

.brand-rail {
    width: 380px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.brand-foot {
    margin-top: 48px;
    padding-top: 24px;
    border-top: 1px solid var(--line);
    display: flex;
    gap: 40px;
    color: var(--ink-500);
    font-size: 13px;
    flex-wrap: wrap;
}

@media (max-width: 900px) {
    .brand-head {
        flex-direction: column;
        gap: 32px;
    }

    .brand-rail {
        width: 100%;
    }

    .brand-type {
        grid-template-columns: 1fr;
    }
}
</style>
