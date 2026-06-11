<script setup lang="ts">
// Port di docs/ui/project/icons.jsx — set icone 24x24, stroke 1.5, currentColor.
// `name` accetta sia camelCase ('chevR') sia kebab-case ('chev-r').
const props = withDefaults(
    defineProps<{
        name: string;
        s?: number;
        sw?: number;
    }>(),
    {
        s: 18,
        sw: 1.5,
    },
);

const PATHS: Record<string, string | string[]> = {
    home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
    events: ["M5 4h14a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z", "M3 9h18", "M8 3v3", "M16 3v3"],
    guests: ["M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6", "M17 11a3 3 0 1 0 0-6", "M15 14a6 6 0 0 1 6 6"],
    mail: ["M3 6h18v12H3z", "M3 6l9 7 9-7"],
    bell: ["M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6", "M10 19a2 2 0 0 0 4 0"],
    chart: ["M4 20V10", "M10 20V4", "M16 20v-7", "M22 20H2"],
    settings: ["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"],
    plus: ["M12 5v14", "M5 12h14"],
    search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "M21 21l-4.3-4.3"],
    calendar: ["M5 4h14a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z", "M3 9h18", "M8 3v3", "M16 3v3"],
    pin: ["M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z", "M12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"],
    clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7v5l3 2"],
    heart: "M20.8 7.6c0 4.1-6.4 8.6-8.3 9.8a1 1 0 0 1-1 0c-1.9-1.2-8.3-5.7-8.3-9.8a4.6 4.6 0 0 1 8.8-1.8 4.6 4.6 0 0 1 8.8 1.8z",
    drag: ["M9 6h.01", "M9 12h.01", "M9 18h.01", "M15 6h.01", "M15 12h.01", "M15 18h.01"],
    eye: ["M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
    send: ["M22 2L11 13", "M22 2l-7 20-4-9-9-4z"],
    copy: ["M8 4h10a2 2 0 0 1 2 2v12", "M16 8H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2z"],
    check: "M5 12l5 5L20 6",
    x: ["M6 6l12 12", "M18 6L6 18"],
    chevR: "M9 18l6-6-6-6",
    chevD: "M6 9l6 6 6-6",
    trash: ["M3 6h18", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", "M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"],
    edit: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"],
    upload: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M17 8l-5-5-5 5", "M12 3v12"],
    sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z",
    ring: ["M12 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10z", "M7 9l-3-4 4-3 4 3", "M17 9l3-4-4-3-4 3"],
    cake: ["M4 21V12a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9", "M4 16h16", "M9 10V7", "M12 10V6", "M15 10V7", "M2 21h20"],
    cap: ["M2 9l10-5 10 5-10 5L2 9z", "M6 10.6V16a2 2 0 0 0 1 1.7c1.5 1 3.3 1.5 5 1.5s3.5-.5 5-1.5a2 2 0 0 0 1-1.7v-5.4", "M21 9v7"],
    cross: ["M12 3v18", "M8 7h8"],
    whatsapp: ["M3 21l1.7-5A8 8 0 1 1 8 19.3z", "M9 9c0 3 3 6 6 6", "M15 13.5l-1.5.5a3 3 0 0 1-3-3l.5-1.5"],
    qr: ["M3 3h7v7H3z", "M14 3h7v7h-7z", "M3 14h7v7H3z", "M14 14h3v3", "M17 17h-3v3h3", "M17 20h4v-3"],
};

const paths = computed(() => {
    // kebab-case → camelCase ('chev-r' → 'chevR', 'not-opened' style keys)
    const key = props.name.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
    const d = PATHS[key];
    if (!d) return [];
    return Array.isArray(d) ? d : [d];
});
</script>

<template>
    <svg
        :width="s"
        :height="s"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        :stroke-width="sw"
        stroke-linecap="round"
        stroke-linejoin="round"
    >
        <path v-for="(p, i) in paths" :key="i" :d="p" />
    </svg>
</template>
