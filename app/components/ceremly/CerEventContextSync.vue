<script setup lang="ts">
// Keeps the layout's event context (`ceremly-event-ctx`: title + type for the
// sidebar group label) in sync with the live Convex event — Task 14 part b, fix
// round 1. It replaces the layout's one-off `$fetch("/api/events/:id")`, a Step 3
// leftover the data-layer gate could not see.
//
// A component and not a call in the layout because `useConvexQuery` has no "skip":
// the layout is also mounted off event pages, where there is no id to query. The
// layout mounts this only with an id. The Convex client shares one subscription
// per (query, args), so the page's own `useEvent` for the same id costs nothing more.
import { useEvent } from "~/composables/useEvents";

const props = defineProps<{ eventId: string }>();

interface CeremlyEventCtx {
    id: string;
    title: string;
    type: string;
}

const { t } = useI18n();
const eventCtx = useState<CeremlyEventCtx | null>("ceremly-event-ctx", () => null);
const { event, error } = useEvent(() => props.eventId);

watch(
    [event, error],
    ([current, failed]) => {
        if (current) {
            eventCtx.value = { id: current.id, title: current.title, type: current.type ?? "" };
        } else if (failed) {
            eventCtx.value = { id: props.eventId, title: t("ceremly.layout.eventFallback"), type: "" };
        }
    },
    { immediate: true },
);
</script>

<template>
    <span hidden />
</template>
