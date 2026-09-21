/**
 * Domain batch protocol for the Convex import (plan Task 10, Step 4).
 *
 * The legacy Neon database is exported to encrypted `MigrationBatch` files by a
 * Node script and consumed by `internal.migrations.domainImport.importBatch`.
 * Two runtimes, one wire format — so the format is specified here first:
 *
 * 1. **Ordine topologico.** `IMPORT_ORDER` is the only legal sequence. The
 *    importer refuses a batch whose prerequisites have not been imported yet, so
 *    the order is enforced rather than documented. It is declared here as well as
 *    in the Convex mirror so the exporter can fail *before* the first call instead
 *    of mid-run; `test/migration/domain-batch-contract.test.ts` pins the two
 *    copies to the same value.
 * 2. **Digest del payload.** `sha256` covers the canonical bytes of
 *    `{version, table, batchIndex, watermark, records}` — the payload *after* the
 *    legacy → wire conversion (`Date` → epoch millisecondi), because that is what
 *    actually crosses the boundary. The importer recomputes it and rejects a
 *    mismatch: a batch that arrives truncated or edited is refused, not imported.
 *
 * The module is deliberately pure — no `fs`, no `crypto`, no environment — so the
 * Node exporter and the Convex runtime can share the same canonical form.
 */

/** Bumped when the wire format changes in a way the importer cannot read. */

import { canonicalJson } from "./bridgeProtocol";

export const DOMAIN_BATCH_VERSION = "1";

/**
 * Tables of the domain import, in the only order they may be sent.
 *
 * Order follows the constraint graph, not the legacy file layout: identity
 * profiles before the organizations that own everything, organizations before the
 * resources scoped to them, resources before the rows that point at them, and the
 * append-only journals last.
 *
 * `billingReferences` is the Creem plugin's own component state (`creem_subscription`)
 * and is therefore **not** in this list: it is owned by the provider component, not
 * by the application schema (measured in Task 4).
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

/** Position of a table in `IMPORT_ORDER`; `-1` for an unknown table. */
export function importRank(table: string): number {
    return (IMPORT_ORDER as readonly string[]).indexOf(table);
}

/**
 * Prerequisites of each table, derived from its logical foreign keys.
 *
 * `appUsers` and `organizations` have none: they are the two roots the legacy
 * schema never made depend on anything (`user` had no FK to `organization` and
 * vice versa). Everything else is expressed as "must already exist", and the
 * importer only requires a prerequisite when a record in the batch actually
 * references it — so an environment whose guest table is empty does not have to
 * send an empty `guests` batch before `rsvpResponses`.
 */
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

/** One table's worth of legacy records, already converted to the wire format. */
export interface DomainBatch<T = Record<string, unknown>> {
    version: string;
    table: DomainImportTable;
    /** 0-based index within `table`'s sequence; re-importing the same index is a no-op. */
    batchIndex: number;
    /**
     * Export marker (legacy `updatedAt` high-water mark). Informational: the
     * importer dedupes on natural keys and `legacyId`, never on the watermark, so
     * a batch that is re-cut with a later watermark cannot duplicate rows.
     */
    watermark?: string;
    records: T[];
    /** SHA-256 (hex) of `domainBatchCanonicalPayload(batch)` — verified on import. */
    sha256: string;
}

/**
 * The exact bytes the digest covers.
 *
 * Reuses the bridge protocol's `canonicalJson` instead of re-implementing it: the
 * two protocols hash the same canonical form, and a second implementation would
 * be a second place for them to disagree. `sha256` itself is deliberately **not**
 * part of the covered value — a digest cannot cover itself.
 */
export function domainBatchCanonicalPayload(input: {
    version?: string;
    table: string;
    batchIndex: number;
    watermark?: string;
    records: unknown[];
}): string {
    return canonicalJson({
        version: input.version ?? DOMAIN_BATCH_VERSION,
        table: input.table,
        batchIndex: input.batchIndex,
        watermark: input.watermark,
        records: input.records,
    });
}
