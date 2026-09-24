import { forbidden } from "./identity";

/**
 * Rules shared by every administrative write (plan Task 15, fix round 1).
 *
 * Two entry points exist for the same operations: the console (`api.admin.*`,
 * a superAdmin session) and the deployment CLI (`internal.*`, `npx convex run`,
 * which is how the site is recovered when nothing else works). Both go through
 * `requireReason`, so a reason is mandatory whichever door was used.
 */

export const MAX_REASON_LENGTH = 500;

/** The operator's reason, trimmed; empty or oversized is a refusal, not a default. */
export function requireReason(reason: string): string {
    const trimmed = reason.trim();
    if (trimmed.length === 0) throw forbidden("REASON_REQUIRED");
    if (trimmed.length > MAX_REASON_LENGTH) {
        throw forbidden("REASON_TOO_LONG", { max: MAX_REASON_LENGTH });
    }
    return trimmed;
}

/**
 * A stable, machine-readable code for a stored error text.
 *
 * `jobExecutions.lastError` and `dataExports.errorMessage` hold whatever the
 * failing code threw — provider responses included, which may carry addresses,
 * URLs or request bodies. The console never shows that text: it shows a code.
 *
 * - a `ConvexError` serialized as JSON → its `code` (`STORAGE_BRIDGE_FAILED`);
 * - a bare constant-like message → itself (`JOB_TYPE_UNKNOWN`);
 * - an HTTP status in the text → `HTTP_<status>`;
 * - anything else → `UNCLASSIFIED`.
 */
export function errorCode(text: string | null | undefined): string | null {
    if (text === null || text === undefined || text.length === 0) return null;

    const convexCode = /"code"\s*:\s*"([A-Z][A-Z0-9_]{1,63})"/.exec(text);
    if (convexCode) return convexCode[1]!;

    const bare = text.trim();
    if (/^[A-Z][A-Z0-9_]{2,63}$/.test(bare)) return bare;

    const status = /\b([45]\d\d)\b/.exec(text);
    if (status) return `HTTP_${status[1]}`;

    return "UNCLASSIFIED";
}
