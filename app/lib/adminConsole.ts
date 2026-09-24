import { computed, ref } from "vue";

/**
 * Small, framework-light helpers of the admin console pages (plan Task 15).
 * No data access here: the pages read and write through `api.admin.*` only.
 */

export const ADMIN_PAGE_SIZE = 25;

/**
 * Forward/back navigation over a Convex paginated query.
 *
 * Convex cursors only go forward, so "previous" is a stack of the cursors that
 * led to each page. `reset()` is for a new search or filter.
 */
export function useCursorPager() {
    const stack = ref<(string | null)[]>([null]);
    const cursor = computed(() => stack.value[stack.value.length - 1] ?? null);
    const hasPrev = computed(() => stack.value.length > 1);

    return {
        cursor,
        hasPrev,
        paginationOpts: computed(() => ({ numItems: ADMIN_PAGE_SIZE, cursor: cursor.value })),
        next(continueCursor: string) {
            stack.value = [...stack.value, continueCursor];
        },
        prev() {
            if (stack.value.length > 1) stack.value = stack.value.slice(0, -1);
        },
        reset() {
            stack.value = [null];
        },
    };
}

export function formatDateTime(value: number | string | null | undefined, locale: string): string {
    if (value === null || value === undefined || value === "") return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString(locale);
}

/** A counter that hit its read cap is a lower bound, and says so. */
export function formatCount(total: number, capped: boolean): string {
    return capped ? `≥ ${total}` : String(total);
}

export function formatPercent(ratio: number, locale: string): string {
    return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(ratio);
}

/** `null` → "plan value"; `-1` → unlimited; anything else as is. */
export function formatLimit(value: number | null, unlimitedLabel = "∞"): string {
    if (value === null) return "-";
    return value === -1 ? unlimitedLabel : String(value);
}
