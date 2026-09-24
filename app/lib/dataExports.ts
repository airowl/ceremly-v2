import { onScopeDispose, ref, watch, type Ref } from "vue";

/**
 * GDPR export adapters (Task 14, part c).
 *
 * Outside the components because the test TypeScript project has no Nuxt globals
 * (same reason as `app/lib/publicInvite.ts`). Pure functions, pinned by the
 * frontend data-layer gate.
 */

export type ExportStatus = "pending" | "processing" | "completed" | "failed" | "expired";

const EXPORT_STATUSES: readonly ExportStatus[] = ["pending", "processing", "completed", "failed", "expired"];

/** One export row as the profile page shows it. */
export interface ExportView {
    id: string;
    status: ExportStatus;
    format: string;
    fileSize: number | null;
    expiresAt: string | null;
    completedAt: string | null;
    errorMessage: string | null;
    createdAt: string;
}

/** Shape of `api.dataExports.status`/`history` rows (milliseconds). */
export interface ExportRow {
    id: string;
    status: string;
    format: string;
    fileSize: number | null;
    expiresAt: number | null;
    completedAt: number | null;
    errorMessage: string | null;
    createdAt: number;
}

const iso = (value: number | null): string | null =>
    value === null ? null : new Date(value).toISOString();

/**
 * Milliseconds → ISO, and a status the i18n keys know. An unexpected value
 * degrades to `failed` (not downloadable, and a new request is offered) instead
 * of a spinner that never ends.
 *
 * `expired` is re-derived here against `now` (Task 14c fix round 1): the server
 * derives it too, but a Convex query is not invalidated by the clock — an export
 * that expires while the page is open would keep showing "completed", the click
 * would fail and no "request new" would be offered. The components pass a `now`
 * that a single timer moves to the next expiry (`nextExpiryDelay`).
 */
export function toExportView(row: ExportRow, now: number = Date.now()): ExportView {
    const known = EXPORT_STATUSES.includes(row.status as ExportStatus) ? (row.status as ExportStatus) : "failed";
    const status: ExportStatus =
        known === "completed" && row.expiresAt !== null && row.expiresAt <= now ? "expired" : known;
    return {
        id: row.id,
        status,
        format: row.format,
        fileSize: row.fileSize,
        expiresAt: iso(row.expiresAt),
        completedAt: iso(row.completedAt),
        errorMessage: row.errorMessage,
        createdAt: new Date(row.createdAt).toISOString(),
    };
}

/** Browsers clamp longer `setTimeout` delays to ~1 ms: cap and re-arm instead. */
const MAX_TIMER_DELAY_MS = 2_147_483_647;

/**
 * Milliseconds until the next `completed` export expires, or `null` if none will.
 * One timer for the whole list: when it fires, `now` moves and the views re-derive.
 */
export function nextExpiryDelay(rows: readonly ExportRow[], now: number): number | null {
    const upcoming = rows
        .filter((row) => row.status === "completed" && row.expiresAt !== null && row.expiresAt > now)
        .map((row) => row.expiresAt! - now);
    if (upcoming.length === 0) return null;
    return Math.min(Math.min(...upcoming), MAX_TIMER_DELAY_MS);
}

/** An export is still being produced: the section shows progress, not actions. */
export const isExportInFlight = (status: ExportStatus): boolean =>
    status === "pending" || status === "processing";

/**
 * `now` for export views, advanced by a single timer at the next expiry.
 * Must be called in a setup context (it registers the cleanup).
 */
export function useExpiryClock(rows: () => readonly ExportRow[]): Ref<number> {
    const now = ref(Date.now());
    let timer: ReturnType<typeof setTimeout> | null = null;

    const arm = () => {
        if (timer) clearTimeout(timer);
        timer = null;
        const delay = nextExpiryDelay(rows(), Date.now());
        if (delay === null) return;
        // A small margin so the re-derivation sees `expiresAt <= now`.
        timer = setTimeout(() => {
            now.value = Date.now();
            arm();
        }, delay + 50);
    };

    watch(rows, arm, { immediate: true });
    onScopeDispose(() => {
        if (timer) clearTimeout(timer);
    });

    return now;
}

/**
 * Opens a short-lived signed URL in a new tab.
 *
 * The URL comes from an action (`api.dataExports.downloadUrl`, 5 minutes, owner
 * only), so it exists only *after* an await — and a `window.open` after an await
 * is no longer tied to the click and gets popup-blocked. The tab is therefore
 * opened synchronously on the click and navigated once the URL arrives; on error
 * it is closed and the error rethrown for the caller's toast.
 */
export async function openSignedDownload(getUrl: () => Promise<string>): Promise<void> {
    const tab = window.open("", "_blank");
    try {
        const url = await getUrl();
        if (tab) {
            // The tab must not keep a handle on this page (what `noopener` does).
            tab.opener = null;
            tab.location.href = url;
        } else {
            window.location.assign(url);
        }
    } catch (error) {
        tab?.close();
        throw error;
    }
}
