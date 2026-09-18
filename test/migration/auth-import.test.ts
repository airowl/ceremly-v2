import { describe, expect, it } from "vitest";
import {
    importAuthRecordsIdempotently,
    normalizeEmail,
    type AuthImportAdapter,
    type AuthImportBatch,
    type LegacyAuthAccount,
    type LegacyAuthUser,
    type LegacyTwoFactor,
} from "../../convex/migrations/authImport";
import { decryptJson, encryptJson, parseEncryptedEnvelope } from "../../scripts/migration/crypto";

/**
 * Task 4 (migration), Step 4: the import orchestration is a pure function over
 * an adapter interface, so its contract — idempotency, natural keys, refusal of
 * orphan records — is tested here without a deployment or a database.
 */
interface FakeAdapterState {
    users: Map<string, { id: string; email: string }>;
    accounts: Map<string, { id: string }>;
    twoFactors: Map<string, { id: string }>;
    createdUsers: Array<Record<string, unknown>>;
    createdAccounts: Array<Record<string, unknown>>;
    createdTwoFactors: Array<Record<string, unknown>>;
}

function createFakeAdapter(): { adapter: AuthImportAdapter; state: FakeAdapterState } {
    const state: FakeAdapterState = {
        users: new Map(),
        accounts: new Map(),
        twoFactors: new Map(),
        createdUsers: [],
        createdAccounts: [],
        createdTwoFactors: [],
    };
    let sequence = 0;
    const nextId = (prefix: string) => `${prefix}_${(sequence += 1)}`;

    return {
        state,
        adapter: {
            async findUserByEmail(email) {
                return state.users.get(email) ?? null;
            },
            async createUser(data) {
                const id = nextId("user");
                const email = String(data.email);
                state.users.set(email, { id, email });
                state.createdUsers.push({ ...data, id });
                return { id };
            },
            async findAccount({ providerId, accountId }) {
                return state.accounts.get(`${providerId}:${accountId}`) ?? null;
            },
            async createAccount(data) {
                const id = nextId("account");
                state.accounts.set(`${data.providerId}:${data.accountId}`, { id });
                state.createdAccounts.push({ ...data, id });
                return { id };
            },
            async findTwoFactor(userId) {
                return state.twoFactors.get(userId) ?? null;
            },
            async createTwoFactor(data) {
                const id = nextId("twoFactor");
                state.twoFactors.set(String(data.userId), { id });
                state.createdTwoFactors.push({ ...data, id });
                return { id };
            },
        },
    };
}

const legacyUser = (overrides: Partial<LegacyAuthUser> = {}): LegacyAuthUser => ({
    id: "legacy-user-1",
    name: "Legacy Person",
    email: "legacy@example.com",
    emailVerified: true,
    image: null,
    createdAt: "2026-01-02T03:04:05.000Z",
    updatedAt: "2026-02-03T04:05:06.000Z",
    twoFactorEnabled: false,
    // Columns the Convex component cannot store: they must be reported, not
    // silently dropped.
    role: "superAdmin",
    locale: "it",
    tosAcceptedAt: "2026-01-02T03:04:05.000Z",
    phone: "+39 000",
    bio: "bio",
    timezone: "Europe/Rome",
    creemCustomerId: "creem_1",
    hadTrial: true,
    ...overrides,
});

const legacyAccount = (overrides: Partial<LegacyAuthAccount> = {}): LegacyAuthAccount => ({
    id: "legacy-account-1",
    accountId: "legacy-user-1",
    providerId: "credential",
    userId: "legacy-user-1",
    password: "$scrypt$hash",
    createdAt: new Date("2026-01-02T03:04:05.000Z"),
    updatedAt: new Date("2026-01-02T03:04:05.000Z"),
    ...overrides,
});

const legacyTwoFactor = (overrides: Partial<LegacyTwoFactor> = {}): LegacyTwoFactor => ({
    id: "legacy-2fa-1",
    secret: "JBSWY3DPEHPK3PXP",
    backupCodes: JSON.stringify(["AAAAA-11111"]),
    userId: "legacy-user-1",
    ...overrides,
});

const batch = (overrides: Partial<AuthImportBatch> = {}): AuthImportBatch => ({
    users: [legacyUser()],
    accounts: [legacyAccount()],
    twoFactors: [],
    ...overrides,
});

describe("importAuthRecordsIdempotently", () => {
    it("imports users, password accounts and 2FA rows, preserving hashes and secrets", async () => {
        const { adapter, state } = createFakeAdapter();

        const result = await importAuthRecordsIdempotently(
            adapter,
            batch({ twoFactors: [legacyTwoFactor()] }),
        );

        expect(result.imported).toBe(3);
        expect(result.skipped).toBe(0);
        expect(result.detail).toEqual({
            users: { imported: 1, skipped: 0 },
            accounts: { imported: 1, skipped: 0 },
            twoFactors: { imported: 1, skipped: 0 },
        });

        // Credentials survive verbatim; timestamps become epoch ms.
        expect(state.createdUsers[0]).toMatchObject({
            email: "legacy@example.com",
            emailVerified: true,
            createdAt: Date.parse("2026-01-02T03:04:05.000Z"),
            updatedAt: Date.parse("2026-02-03T04:05:06.000Z"),
        });
        expect(state.createdAccounts[0]).toMatchObject({
            providerId: "credential",
            password: "$scrypt$hash",
            userId: "user_1",
        });
        expect(state.createdTwoFactors[0]).toMatchObject({
            secret: "JBSWY3DPEHPK3PXP",
            backupCodes: JSON.stringify(["AAAAA-11111"]),
            userId: "user_1",
        });
    });

    it("is idempotent: re-importing the same batch writes nothing", async () => {
        const { adapter, state } = createFakeAdapter();
        const payload = batch({ twoFactors: [legacyTwoFactor()] });

        const first = await importAuthRecordsIdempotently(adapter, payload);
        const second = await importAuthRecordsIdempotently(adapter, payload);

        expect(first.imported).toBe(3);
        expect(second.imported).toBe(0);
        expect(second.skipped).toBe(3);
        expect(state.createdUsers).toHaveLength(1);
        expect(state.createdAccounts).toHaveLength(1);
        expect(state.createdTwoFactors).toHaveLength(1);
    });

    it("keys accounts by provider+account id, so a Google row and a password row coexist", async () => {
        const { adapter, state } = createFakeAdapter();

        await importAuthRecordsIdempotently(adapter, batch({
            accounts: [
                legacyAccount(),
                legacyAccount({
                    id: "legacy-account-2",
                    providerId: "google",
                    accountId: "google-sub-1",
                    password: null,
                }),
            ],
        }));

        expect(state.createdAccounts).toHaveLength(2);
        expect(state.accounts.has("credential:legacy-user-1")).toBe(true);
        expect(state.accounts.has("google:google-sub-1")).toBe(true);
    });

    it("normalizes the email to lower case, because Better Auth looks users up that way", async () => {
        const { adapter, state } = createFakeAdapter();

        const result = await importAuthRecordsIdempotently(
            adapter,
            batch({ users: [legacyUser({ email: "Legacy.Person@Example.COM" })], twoFactors: [] }),
        );

        expect(normalizeEmail(" Legacy.Person@Example.COM ")).toBe("legacy.person@example.com");
        expect(result.normalizedEmails).toBe(1);
        expect(state.users.has("legacy.person@example.com")).toBe(true);

        // A second batch carrying the original casing resolves to the same user.
        const second = await importAuthRecordsIdempotently(
            adapter,
            batch({ users: [legacyUser({ email: "Legacy.Person@Example.COM" })], accounts: [], twoFactors: [] }),
        );
        expect(second.skipped).toBe(1);
        expect(state.createdUsers).toHaveLength(1);
    });

    it("reports the legacy profile columns the Convex component cannot store", async () => {
        const { adapter } = createFakeAdapter();

        const result = await importAuthRecordsIdempotently(adapter, batch());

        expect(result.deferredProfileFields).toEqual(
            expect.arrayContaining(["role", "locale", "tosAcceptedAt", "phone", "bio", "timezone"]),
        );
    });

    it("refuses an account whose user is not part of the import instead of orphaning it", async () => {
        const { adapter, state } = createFakeAdapter();

        await expect(
            importAuthRecordsIdempotently(adapter, batch({
                accounts: [legacyAccount({ userId: "missing-user" })],
            })),
        ).rejects.toMatchObject({ data: { code: "UNRESOLVED_AUTH_RECORD_USER", model: "account" } });

        expect(state.createdAccounts).toHaveLength(0);
    });

    it("refuses a 2FA row without a resolvable user", async () => {
        const { adapter } = createFakeAdapter();

        await expect(
            importAuthRecordsIdempotently(adapter, batch({
                twoFactors: [legacyTwoFactor({ userId: "missing-user" })],
            })),
        ).rejects.toMatchObject({ data: { code: "UNRESOLVED_AUTH_RECORD_USER", model: "twoFactor" } });
    });

    it("rejects malformed records before writing anything", async () => {
        const { adapter, state } = createFakeAdapter();

        await expect(
            importAuthRecordsIdempotently(adapter, batch({
                users: [legacyUser({ email: "" })],
            })),
        ).rejects.toMatchObject({ data: { code: "INVALID_AUTH_IMPORT_RECORD", model: "user" } });

        expect(state.createdUsers).toHaveLength(0);
    });
});

describe("encrypted migration batches", () => {
    const passphrase = "gate-passphrase";

    it("round-trips a batch and leaves no plaintext in the envelope", () => {
        const payload = batch({ twoFactors: [legacyTwoFactor()] });
        const envelope = encryptJson(payload, passphrase);
        const serialized = JSON.stringify(envelope);

        expect(serialized).not.toContain("$scrypt$hash");
        expect(serialized).not.toContain("JBSWY3DPEHPK3PXP");
        // JSON is the transport format: `Date` values arrive as ISO strings and
        // `toEpochMs` handles both, so equality is asserted on the wire shape.
        expect(decryptJson<AuthImportBatch>(parseEncryptedEnvelope(serialized), passphrase)).toEqual(
            JSON.parse(JSON.stringify(payload)),
        );
    });

    it("fails to decrypt with the wrong passphrase or a tampered ciphertext", () => {
        const envelope = encryptJson(batch(), passphrase);

        expect(() => decryptJson(envelope, "other-passphrase")).toThrow();

        const tampered = { ...envelope, ciphertext: Buffer.from("tampered").toString("base64") };
        expect(() => decryptJson(tampered, passphrase)).toThrow();
    });
});
