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
 * Milliseconds → ISO, and a status the i18n keys know. The server already derives
 * `expired`; an unexpected value degrades to `failed` (not downloadable, and a
 * new request is offered) instead of a spinner that never ends.
 */
export function toExportView(row: ExportRow): ExportView {
    return {
        id: row.id,
        status: EXPORT_STATUSES.includes(row.status as ExportStatus) ? (row.status as ExportStatus) : "failed",
        format: row.format,
        fileSize: row.fileSize,
        expiresAt: iso(row.expiresAt),
        completedAt: iso(row.completedAt),
        errorMessage: row.errorMessage,
        createdAt: new Date(row.createdAt).toISOString(),
    };
}

/** An export is still being produced: the section shows progress, not actions. */
export const isExportInFlight = (status: ExportStatus): boolean =>
    status === "pending" || status === "processing";

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
