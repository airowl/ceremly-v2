<script setup lang="ts">
// RSVP status pill — port of StatusPill (docs/ui/project/screens/guests.jsx),
// extended to derived states from GET /api/events/:id/guests.
type CeremlyRsvpStatus = "confirmed" | "declined" | "maybe" | "opened" | "not_opened" | "pending";

const props = defineProps<{
    status: CeremlyRsvpStatus;
}>();

const { t } = useI18n();

// Only the CSS class is derived from the status; the label comes from i18n (ceremly.rsvpStatus.*)
const CLS: Record<CeremlyRsvpStatus, string> = {
    confirmed: "confirm",
    declined: "decline",
    maybe: "pending",
    opened: "pending",
    pending: "pending",
    not_opened: "neutral",
};

const cls = computed(() => CLS[props.status] ?? CLS.pending);
const label = computed(() => t(`ceremly.rsvpStatus.${props.status in CLS ? props.status : "pending"}`));
</script>

<template>
    <span class="pill" :class="cls"><span class="cer-dot" />{{ label }}</span>
</template>
