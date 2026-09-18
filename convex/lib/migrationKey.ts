import { ConvexError } from "convex/values";

/**
 * Guard for the migration entry points (`internal.migrations.*`).
 *
 * Internal functions are not reachable from the browser, but `convex run` and
 * a leaked admin key are: the key check is the second lock on the door. Both
 * Task 4 (auth import) and Task 10 (domain import) call this before touching
 * any data, so a deployment that has no key configured refuses the import
 * instead of accepting whatever it is handed.
 */

const encoder = new TextEncoder();

/**
 * Constant-time string comparison: walks the full length and accumulates a
 * difference instead of returning on the first mismatch, so response timing
 * leaks neither the length nor a valid prefix.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
    const left = encoder.encode(a);
    const right = encoder.encode(b);
    let difference = left.length ^ right.length;

    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
        difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
    }

    return difference === 0;
}

export function assertMigrationKey(provided: string): void {
    const expected = process.env.MIGRATION_API_KEY;

    if (!expected) {
        throw new ConvexError({ code: "MIGRATION_KEY_NOT_CONFIGURED" });
    }

    if (!timingSafeEqualString(provided, expected)) {
        throw new ConvexError({ code: "INVALID_MIGRATION_KEY" });
    }
}
