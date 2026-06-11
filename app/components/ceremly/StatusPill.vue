<script setup lang="ts">
// Pill di stato RSVP — port di StatusPill (docs/ui/project/screens/guests.jsx),
// esteso agli stati derivati di GET /api/events/:id/guests.
type CeremlyRsvpStatus = "confirmed" | "declined" | "maybe" | "opened" | "not_opened" | "pending";

const props = defineProps<{
    status: CeremlyRsvpStatus;
}>();

const MAP: Record<CeremlyRsvpStatus, { label: string; cls: string }> = {
    confirmed: { label: "Confermato", cls: "confirm" },
    declined: { label: "Declinato", cls: "decline" },
    maybe: { label: "Forse", cls: "pending" },
    opened: { label: "In attesa", cls: "pending" },
    pending: { label: "In attesa", cls: "pending" },
    not_opened: { label: "Non aperto", cls: "neutral" },
};

const pill = computed(() => MAP[props.status] ?? MAP.pending);
</script>

<template>
    <span class="pill" :class="pill.cls"><span class="cer-dot" />{{ pill.label }}</span>
</template>
