import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
    DOMAIN_BATCH_VERSION as SHARED_VERSION,
    IMPORT_DEPENDENCIES as SHARED_DEPENDENCIES,
    IMPORT_ORDER as SHARED_ORDER,
    domainBatchCanonicalPayload as sharedCanonicalPayload,
    type DomainBatch,
} from "../../shared/migration/domainBatch";
import {
    DOMAIN_BATCH_VERSION as CONVEX_VERSION,
    IMPORT_DEPENDENCIES as CONVEX_DEPENDENCIES,
    IMPORT_ORDER as CONVEX_ORDER,
    domainBatchCanonicalPayload as convexCanonicalPayload,
    domainBatchDigest as convexDigest,
    importRank,
} from "../../convex/lib/domainBatchDigest";

/**
 * Task 10 — the domain batch protocol, verified without a deployment.
 *
 * The export script (Node, `shared/`) and the importer (Convex,
 * `convex/lib/domainBatchDigest.ts`) are two runtimes that must agree on *bytes*:
 * the importer recomputes the digest and refuses a mismatch, so a drift in the
 * canonical form would not degrade gracefully — it would reject every batch.
 *
 * Convex bundles only files under `convex/`, which is why the mirror exists; this
 * suite is what makes the mirror safe. It is the same construction as the bridge
 * contract test, for the same reason.
 */

const sha256Hex = (value: string): string =>
    createHash("sha256").update(value, "utf8").digest("hex");

const nodeDigest = (batch: Parameters<typeof sharedCanonicalPayload>[0]): string =>
    sha256Hex(sharedCanonicalPayload(batch));

// ---------------------------------------------------------------------------
// The declarations the two sides must share
// ---------------------------------------------------------------------------

describe("declaration parity", () => {
    it("declares the same wire version", () => {
        expect(CONVEX_VERSION).toBe(SHARED_VERSION);
    });

    it("declares the same table order", () => {
        expect([...CONVEX_ORDER]).toEqual([...SHARED_ORDER]);
    });

    it("declares the same dependencies", () => {
        expect(CONVEX_DEPENDENCIES).toEqual(SHARED_DEPENDENCIES);
    });

    it("places every table once, and every dependency before its dependent", () => {
        expect(new Set(SHARED_ORDER).size).toBe(SHARED_ORDER.length);

        for (const table of SHARED_ORDER) {
            for (const dependency of SHARED_DEPENDENCIES[table]) {
                expect(
                    importRank(dependency),
                    `${dependency} must be imported before ${table}`,
                ).toBeGreaterThanOrEqual(0);
                expect(importRank(dependency)).toBeLessThan(importRank(table));
            }
        }
    });

    it("has no dependency on a table outside the order", () => {
        for (const table of SHARED_ORDER) {
            for (const dependency of SHARED_DEPENDENCIES[table]) {
                expect(SHARED_ORDER).toContain(dependency);
            }
        }
    });
});

// ---------------------------------------------------------------------------
// The bytes
// ---------------------------------------------------------------------------

describe("canonical payload", () => {
    const realistic: DomainBatch = {
        version: SHARED_VERSION,
        table: "guests",
        batchIndex: 0,
        watermark: "2026-06-01T00:00:00.000Z",
        records: [
            {
                id: "0197f0aa-0000-7000-8000-000000000000",
                organizationId: "org-1",
                eventId: "event-1",
                firstName: "Ada",
                lastName: "Lovelace",
                email: "ada@example.com",
                phone: null,
                notes: null,
                token: "aB3xY9zQ1m",
                sentAt: "2026-03-02T10:00:00.000Z",
                openCount: 2,
                remindersDisabled: false,
                removedAt: null,
            },
        ],
        sha256: "",
    };

    it("produces the same bytes on both runtimes", () => {
        expect(convexCanonicalPayload(realistic)).toBe(sharedCanonicalPayload(realistic));
    });

    it("produces the same digest as node:crypto on the exporter side", async () => {
        expect(await convexDigest(realistic)).toBe(nodeDigest(realistic));
    });

    it("does not depend on key insertion order", async () => {
        const reordered = {
            ...realistic,
            records: [
                {
                    removedAt: null,
                    openCount: 2,
                    lastName: "Lovelace",
                    token: "aB3xY9zQ1m",
                    firstName: "Ada",
                    id: "0197f0aa-0000-7000-8000-000000000000",
                    organizationId: "org-1",
                    eventId: "event-1",
                    email: "ada@example.com",
                    sentAt: "2026-03-02T10:00:00.000Z",
                    phone: null,
                    notes: null,
                    remindersDisabled: false,
                },
            ],
        };

        expect(await convexDigest(reordered)).toBe(nodeDigest(realistic));
    });

    it("drops undefined the same way on both runtimes", async () => {
        const withUndefined = {
            ...realistic,
            records: [{ ...realistic.records[0], phone: undefined, notes: null }],
        };

        expect(convexCanonicalPayload(withUndefined)).toBe(sharedCanonicalPayload(withUndefined));
        expect(convexCanonicalPayload(withUndefined)).not.toBe(
            sharedCanonicalPayload(realistic),
        );
    });

    it("treats a Date identically on both runtimes", async () => {
        // The wire format carries epoch milliseconds (the exporter converts), but
        // a `Date` that survives conversion must still hash the same on both
        // sides — otherwise a single unconverted column would reject the batch.
        const withDate = {
            ...realistic,
            records: [{ ...realistic.records[0], sentAt: new Date("2026-03-02T10:00:00.000Z") as never }],
        };

        expect(convexCanonicalPayload(withDate)).toBe(sharedCanonicalPayload(withDate));
    });

    it("covers the digest-relevant fields and nothing else", async () => {
        const base = { ...realistic, sha256: "" };

        // `sha256` is not part of the covered value (a digest cannot cover itself).
        expect(convexCanonicalPayload({ ...base, sha256: "ignored" as never })).toBe(
            sharedCanonicalPayload(base),
        );

        // ...while the watermark, the index and the records are.
        expect(convexCanonicalPayload({ ...base, watermark: "later" })).not.toBe(
            sharedCanonicalPayload(base),
        );
        expect(convexCanonicalPayload({ ...base, batchIndex: 1 })).not.toBe(
            sharedCanonicalPayload(base),
        );
        expect(convexCanonicalPayload({ ...base, records: [] })).not.toBe(
            sharedCanonicalPayload(base),
        );
    });

    it("orders keys consistently even when one is a prefix of another", () => {
        // The canonical form is the contract, so the corner case that separates
        // the two implementations is pinned here rather than left to chance.
        const payload = {
            version: SHARED_VERSION,
            table: "organizations" as const,
            batchIndex: 0,
            records: [{ id: "org-1", a: 1, "a!": 2, ab: 3 }],
        };

        expect(convexCanonicalPayload(payload)).toBe(sharedCanonicalPayload(payload));
    });
});
