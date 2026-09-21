import { canonicalJson, sha256Hex } from "./bridgeHmac";

/**
 * Convex side of the domain batch protocol (plan Task 10, Step 4).
 *
 * Exact mirror of `shared/migration/domainBatch.ts`, which the export script and
 * the contract test use. Convex bundles only files under `convex/`, so this is a
 * copy rather than an import — and `test/migration/domain-batch-contract.test.ts`
 * feeds both copies the same vectors and fails if they ever drift. That test is
 * the only reason two copies are acceptable here: without it, "the two sides
 * agree on the bytes" would be an assumption, and the importer would be verifying
 * a digest computed over a different string than the exporter's.
 *
 * Pure functions plus Web Crypto (`crypto.subtle`), both available in the Convex
 * runtime.
 */

export const DOMAIN_BATCH_VERSION = "1";

/**
 * The only legal order of the domain import (see the shared module for the
 * reasoning). Duplicated on purpose: the importer must be able to reject a batch
 * whose prerequisites are missing without trusting the exporter's ordering, and
 * the contract test pins this array to the shared one.
 */
export const IMPORT_ORDER = [
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

export type DomainImportTable = (typeof IMPORT_ORDER)[number];

export const IMPORT_DEPENDENCIES: Record<DomainImportTable, readonly DomainImportTable[]> = {
    appUsers: [],
    organizations: [],
    memberships: ["appUsers", "organizations"],
    invitations: ["appUsers", "organizations"],
    events: ["organizations"],
    projects: ["organizations"],
    guests: ["organizations", "events"],
    eventReminders: ["organizations", "events"],
    rsvpResponses: ["organizations", "events", "guests"],
    guestActivities: ["organizations", "events", "guests"],
    files: ["organizations"],
    emailSuppressions: [],
    emailEvents: ["organizations", "events", "guests"],
    dataExports: ["appUsers"],
    auditLogs: ["appUsers", "organizations"],
    contactMessages: [],
    waitingList: [],
};

export interface DomainBatchEnvelope<T = Record<string, unknown>> {
    version?: string;
    table: DomainImportTable;
    batchIndex: number;
    watermark?: string;
    records: T[];
}

export function isDomainImportTable(value: string): value is DomainImportTable {
    return (IMPORT_ORDER as readonly string[]).includes(value);
}

/** Position of a table in `IMPORT_ORDER`; `-1` for a table that is not imported. */
export function importRank(table: string): number {
    return (IMPORT_ORDER as readonly string[]).indexOf(table);
}

/**
 * The exact bytes the digest covers — the same value the shared module builds.
 *
 * Reuses `canonicalJson` from the bridge protocol rather than re-implementing it:
 * the two protocols hash the same canonical form, and a second implementation
 * would be a second place for them to disagree.
 */
export function domainBatchCanonicalPayload(input: DomainBatchEnvelope): string {
    return canonicalJson({
        version: input.version ?? DOMAIN_BATCH_VERSION,
        table: input.table,
        batchIndex: input.batchIndex,
        watermark: input.watermark,
        records: input.records,
    });
}

export async function domainBatchDigest(input: DomainBatchEnvelope): Promise<string> {
    return await sha256Hex(domainBatchCanonicalPayload(input));
}
