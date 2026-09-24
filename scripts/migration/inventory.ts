import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { InventoryEntry } from "./types";

/**
 * Plan Task 16, Step 2 — inventory of every store the migration touches.
 *
 * Each entry says what the data is (`production | ephemeral | regenerable`),
 * what the pipeline does with it and why. The CLI fills count and canonical
 * checksum from the real source (one consistent snapshot, see
 * `export-neon.ts`); the static part is pinned by `test/migration/reconcile.test.ts`,
 * which fails when a Neon or Convex table appears without a classification.
 *
 * Usage:  npx tsx scripts/migration/inventory.ts [--out .migration-rehearsal/inventory.json]
 */

const imported = (
    table: string,
    destination: string,
    reason: string,
    dataClass: InventoryEntry["dataClass"] = "production",
): InventoryEntry => ({ table, location: "neon", dataClass, disposition: "imported", destination, reason });

export const SOURCE_INVENTORY: readonly InventoryEntry[] = [
    // --- auth (Better Auth component, Task 4) --------------------------------
    imported("user", "betterAuth.user + appUsers", "credential identity (component) and application profile (domain)"),
    imported("account", "betterAuth.account", "password hashes and Google links must survive (G03/G04)"),
    imported("two_factor", "betterAuth.twoFactor", "TOTP secret and backup codes must survive (G05)"),
    {
        table: "session",
        location: "redis",
        dataClass: "ephemeral",
        disposition: "not-imported",
        destination: "—",
        reason: "sessions live in Upstash (secondaryStorage), not in Postgres; users sign in again after the cutover",
    },
    {
        table: "verification",
        location: "neon",
        dataClass: "ephemeral",
        disposition: "not-imported",
        destination: "—",
        reason: "short-lived email/reset tokens; the import has no shape for them by construction",
    },
    // --- tenancy and domain (Task 10) -----------------------------------------
    imported("organization", "organizations", "tenant root"),
    imported("member", "memberships", "RBAC: who can read what"),
    imported("invitation", "invitations", "terminal invitations imported; pending ones deferred (no legacy token)"),
    imported("events", "events", "domain, including the paid tier and Creem order ids (billing facts)"),
    imported("projects", "projects", "domain"),
    imported("guests", "guests", "domain (personal data)"),
    imported("event_reminders", "eventReminders", "domain"),
    imported("rsvp_responses", "rsvpResponses", "domain (personal data)"),
    imported("guest_activities", "guestActivities", "domain timeline"),
    imported("file", "files", "file metadata; the objects themselves stay in R2 (see r2:objects)"),
    imported("email_suppressions", "emailSuppressions", "a bounce or complaint must keep suppressing after the cutover"),
    imported("email_events", "emailEvents", "delivery evidence"),
    imported("data_exports", "dataExports", "GDPR export history"),
    imported("audit_log", "auditLogs", "audit trail must be continuous"),
    imported("contact_messages", "contactMessages", "inbound requests not yet answered"),
    imported("waiting_list", "waitingList", "sign-ups"),
    // --- billing --------------------------------------------------------------
    {
        table: "creem_subscription",
        location: "neon",
        dataClass: "production",
        disposition: "not-imported",
        destination: "creem component (reconciled)",
        reason:
            "owned by the Creem component, which has no import path: exported in the encrypted bundle and " +
            "reconciled by `reconcile-creem` (legacy is the reference, a missing subscription fails). " +
            "Per-event billing facts travel with `events`",
    },
    // --- non-table stores -----------------------------------------------------
    {
        table: "r2:objects",
        location: "r2",
        dataClass: "production",
        disposition: "manifest-only",
        destination: "same bucket (keys unchanged)",
        reason: "bytes are not copied: `files` carries key, size and SHA-256, and reconcile compares them",
    },
    {
        table: "redis:rate-limit",
        location: "redis",
        dataClass: "ephemeral",
        disposition: "not-imported",
        destination: "—",
        reason: "counters restart on the Convex limiter (`rateLimitBuckets`)",
    },
    {
        table: "redis:site:mode",
        location: "redis",
        dataClass: "regenerable",
        disposition: "not-imported",
        destination: "siteSettings",
        reason: "the site mode is set explicitly by the cutover runbook, not copied from a cache",
    },
    {
        table: "drizzle.__drizzle_migrations",
        location: "neon",
        dataClass: "regenerable",
        disposition: "not-imported",
        destination: "manifest.schemaVersion",
        reason: "schema version of the source, recorded in every manifest",
    },
];

const targetOnly = (
    table: string,
    dataClass: InventoryEntry["dataClass"],
    reason: string,
): InventoryEntry => ({ table, location: "convex", dataClass, disposition: "target-only", destination: table, reason });

/**
 * Convex tables with no legacy source. Classified so that the rehearsal and the
 * cutover know which ones must never be wiped (production) and which ones may be
 * reset (ephemeral/regenerable).
 */
export const TARGET_ONLY_INVENTORY: readonly InventoryEntry[] = [
    targetOnly(
        "organizationLimitOverrides",
        "production",
        "admin-set limit overrides (Task 15); the legacy `user_custom_limits` was dropped, nothing to import",
    ),
    targetOnly(
        "webhookEvents",
        "production",
        "Creem replay ledger (exactly-once fulfillment); starts empty, must never be wiped after the cutover",
    ),
    targetOnly(
        "inviteTestRequests",
        "ephemeral",
        "throttle and draft of test-invite emails (Task 14); the legacy kept this in Redis",
    ),
    targetOnly(
        "jobExecutions",
        "regenerable",
        "durable job state (Task 13); in-flight QStash messages are not migrated, the cron sweeps re-derive pending work from domain state",
    ),
    targetOnly("rateLimitBuckets", "ephemeral", "limiter counters"),
    targetOnly("siteSettings", "regenerable", "site mode override, set by the runbook"),
    targetOnly("migrationRecords", "regenerable", "import journal, written by the import itself"),
    targetOnly("migrationHealth", "ephemeral", "gate probe rows (Tasks 2–3)"),
];

/** Convex tables that receive imported rows (the domain import's targets). */
export const IMPORTED_CONVEX_TABLES = [
    "appUsers",
    "organizations",
    "memberships",
    "invitations",
    "events",
    "projects",
    "guests",
    "eventReminders",
    "rsvpResponses",
    "guestActivities",
    "files",
    "emailSuppressions",
    "emailEvents",
    "dataExports",
    "auditLogs",
    "contactMessages",
    "waitingList",
] as const;

export function inventoryEntryFor(source: string): InventoryEntry {
    const entry = SOURCE_INVENTORY.find((candidate) => candidate.table === source);
    if (!entry) throw new Error(`Table ${source} is not in the migration inventory: classify it before exporting`);
    return entry;
}

/** Inventory with count and checksum filled from a source snapshot. */
export function buildInventory(
    counts: Record<string, { count: number; checksum: string }>,
): InventoryEntry[] {
    return [
        ...SOURCE_INVENTORY.map((entry) =>
            counts[entry.table] ? { ...entry, count: counts[entry.table]!.count, checksum: counts[entry.table]!.checksum } : entry,
        ),
        ...TARGET_ONLY_INVENTORY,
    ];
}

async function main() {
    const { readSourceSnapshot, tableChecksum } = await import("./export-neon");
    const outIndex = process.argv.indexOf("--out");
    const out = outIndex > -1 ? process.argv[outIndex + 1] : null;

    const snapshot = await readSourceSnapshot();
    const counts = Object.fromEntries(
        Object.entries(snapshot.tables).map(([table, rows]) => [table, { count: rows.length, checksum: tableChecksum(rows) }]),
    );
    const inventory = {
        watermark: snapshot.watermark,
        sourceEndpoint: snapshot.sourceEndpoint,
        schemaVersion: snapshot.schemaVersion,
        entries: buildInventory(counts),
    };

    if (out) {
        await mkdir(dirname(resolve(out)), { recursive: true });
        await writeFile(resolve(out), `${JSON.stringify(inventory, null, 2)}\n`, { mode: 0o600 });
    }
    console.log(JSON.stringify(inventory, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error: unknown) => {
        console.error(`[inventory] ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    });
}
