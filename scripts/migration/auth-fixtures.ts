/**
 * Task 4 (migration), Step 5 — minimized credential fixtures for gates G03–G05.
 *
 * These are *synthetic* accounts that mirror the shape of the real legacy rows
 * (password hash produced by the same Better Auth version, a Google provider
 * row, a 2FA row with TOTP secret and backup codes). They exist so the whole
 * chain — legacy DB → encrypted export → Convex import → real sign-in — can be
 * exercised without copying production credentials.
 *
 * The values below are fixtures, not secrets: they are only valid on the dev
 * database branch and on the staging Convex deployment.
 */

export const GATE_EMAIL_DOMAIN = "gate.ceremly.dev";

export interface AuthFixture {
    /** Scenario key: G03 password, G04 Google, G05 2FA. */
    gate: "G03" | "G04" | "G05";
    email: string;
    name: string;
    /** Plain-text password; only its Better Auth hash is ever stored. */
    password: string;
    google?: { accountId: string };
    twoFactor?: { secret: string; backupCodes: string[] };
}

/**
 * Fixed TOTP secret so the gate can recompute codes itself. It is stored as the
 * *raw* secret (better-auth base32-encodes it only for the `otpauth://` URI), so
 * `test/migration/totp.ts` HMACs these characters as UTF-8 bytes.
 */
export const GATE_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

export const AUTH_FIXTURES: AuthFixture[] = [
    {
        gate: "G03",
        email: `gate-password@${GATE_EMAIL_DOMAIN}`,
        name: "Gate Password",
        password: "Gate-password-fixture-0001!",
    },
    {
        gate: "G04",
        email: `gate-google@${GATE_EMAIL_DOMAIN}`,
        name: "Gate Google",
        password: "Gate-google-fixture-0002!",
        google: { accountId: "google-gate-sub-0002" },
    },
    {
        gate: "G05",
        // `-v2` because the first G05 fixture stored the backup codes as
        // plaintext JSON while better-auth 1.6.15 defaults `storeBackupCodes`
        // to `"encrypted"`. The idempotent import refused to overwrite the
        // already-imported row (by design), so the corrected payload needed a
        // new natural key instead of a destructive update on staging.
        email: `gate-two-factor-v2@${GATE_EMAIL_DOMAIN}`,
        name: "Gate Two Factor",
        password: "Gate-two-factor-fixture-0003!",
        twoFactor: {
            secret: GATE_TOTP_SECRET,
            backupCodes: ["GATEA-AAAA1", "GATEB-BBBB2", "GATEC-CCCC3"],
        },
    },
];

export const fixtureEmails = (): string[] => AUTH_FIXTURES.map((fixture) => fixture.email);
