import { describe, it, expect, vi, beforeEach } from "vitest";

const onConflictDoNothing = vi.fn();
const values = vi.fn(() => ({ onConflictDoNothing }));
const insert = vi.fn(() => ({ values }));
const limit = vi.fn(() => Promise.resolve([] as unknown[]));
const where = vi.fn(() => ({ limit }));
const from = vi.fn(() => ({ where }));
const select = vi.fn(() => ({ from }));
vi.mock("../utils/db", () => ({ getDB: () => ({ insert, select }) }));

import { isEmailSuppressed, upsertSuppression } from "./emailSuppression.repository";

beforeEach(() => vi.clearAllMocks());

describe("emailSuppression.repository", () => {
    it("upsertSuppression inserisce con onConflictDoNothing", async () => {
        await upsertSuppression({ email: "a@x.com", reason: "hard_bounce" });
        expect(insert).toHaveBeenCalledOnce();
        expect(values).toHaveBeenCalledWith(
            expect.objectContaining({ email: "a@x.com", reason: "hard_bounce" })
        );
        expect(onConflictDoNothing).toHaveBeenCalledOnce();
    });

    it("isEmailSuppressed false se nessuna riga", async () => {
        expect(await isEmailSuppressed("a@x.com")).toBe(false);
    });
});
