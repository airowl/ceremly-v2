<script setup lang="ts">
// Switcher lingua riutilizzabile (IT/EN) per le superfici Ceremly senza
// header del boilerplate — in primis la guest page pubblica /e/:slug/:token,
// dove atterrano ospiti potenzialmente internazionali.
// Pattern allineato ad AppHeader/AppFooter: setLocale gestisce cookie +
// navigazione (strategy prefix_except_default → /en come prefisso, IT default).
const { locale, setLocale } = useI18n();

function onChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value as "it" | "en";
    setLocale(value);
}
</script>

<template>
    <div
        class="cer-lang-switch"
        :style="{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 10px',
            borderRadius: '999px',
            background: 'var(--bone-100)',
            border: '1px solid var(--bone-200)',
            fontFamily: 'var(--font-sans)',
        }"
    >
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            :style="{ color: 'var(--ink-500)' }"
        >
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18" />
            <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" />
        </svg>
        <select
            :value="locale"
            :aria-label="$t('common.language')"
            :style="{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                padding: '0',
                fontSize: '13px',
                color: 'var(--ink)',
                cursor: 'pointer',
            }"
            @change="onChange"
        >
            <option value="it">Italiano</option>
            <option value="en">English</option>
        </select>
    </div>
</template>
