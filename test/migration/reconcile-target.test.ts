import { describe, expect, it } from "vitest";
import { resolveReconcileTarget } from "../../scripts/migration/reconcile";

/**
 * Task 17 fix round 2 (N1): the reconcile that decides rollback §A vs §B must
 * never fall back silently to staging. The target is an explicit choice, and the
 * first-write check only exists against production (Convex *and* Neon).
 */

const PROD_URL = "postgresql://u:p@ep-dark-dream-123456-pooler.eu-central-1.aws.neon.tech/db";
const DEV_URL = "postgresql://u:p@ep-mute-fire-a2bap0v4-pooler.eu-central-1.aws.neon.tech/db";
const prodEnv = {
    NUXT_DATABASE_URL: PROD_URL,
    MIGRATION_SOURCE_CONFIRM: "ep-dark-dream-123456",
    NUXT_MIGRATION_API_KEY: "k",
};

describe("resolveReconcileTarget", () => {
    it("refuses a run without an explicit target", () => {
        expect(() => resolveReconcileTarget(["--manifest", "m.json"], {})).toThrow(/--production or --staging/);
    });

    it("refuses both targets at once", () => {
        expect(() => resolveReconcileTarget(["--production", "--staging"], prodEnv)).toThrow(/not both/);
    });

    it("refuses the first-write check on staging", () => {
        expect(() => resolveReconcileTarget(["--staging", "--first-write-check"], {})).toThrow(/first-write-check.*--production/);
    });

    it("refuses production without the production Neon in the shell", () => {
        expect(() => resolveReconcileTarget(["--production"], { ...prodEnv, NUXT_DATABASE_URL: undefined })).toThrow(/NUXT_DATABASE_URL/);
        expect(() => resolveReconcileTarget(["--production"], { ...prodEnv, NUXT_DATABASE_URL: DEV_URL })).toThrow(/production endpoint/);
        expect(() => resolveReconcileTarget(["--production"], { ...prodEnv, MIGRATION_SOURCE_CONFIRM: undefined })).toThrow(/MIGRATION_SOURCE_CONFIRM/);
        expect(() => resolveReconcileTarget(["--production"], { ...prodEnv, NUXT_MIGRATION_API_KEY: undefined })).toThrow(/NUXT_MIGRATION_API_KEY/);
    });

    it("refuses staging pointed at the production source", () => {
        expect(() => resolveReconcileTarget(["--staging"], { NUXT_DATABASE_URL: PROD_URL })).toThrow(/staging/);
    });

    it("accepts the two explicit shapes", () => {
        expect(resolveReconcileTarget(["--staging"], {})).toEqual({ target: "staging", firstWriteCheck: false });
        expect(resolveReconcileTarget(["--production", "--first-write-check"], prodEnv)).toEqual({
            target: "production",
            firstWriteCheck: true,
        });
    });
});
