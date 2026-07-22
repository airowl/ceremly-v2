import { describe, it, expect, vi, beforeEach } from "vitest";

const insertValues = vi.fn();
const onConflictDoNothing = vi.fn();
const returning = vi.fn();

vi.mock("../utils/db", () => ({
    getDB: () => ({
        insert: () => ({ values: insertValues }),
        select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: () => [] }) }) }) }),
        update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    }),
}));

beforeEach(() => {
    vi.clearAllMocks();
    // values(...).onConflictDoNothing().returning() → rows
    onConflictDoNothing.mockReturnValue({ returning });
    insertValues.mockReturnValue({ onConflictDoNothing });
});

describe("insertEmailEvent", () => {
    it("returns inserted:true when a row is written", async () => {
        returning.mockResolvedValue([{ id: "x" }]);
        const { insertEmailEvent } = await import("./emailEvent.repository");
        const res = await insertEmailEvent({
            svixId: "msg_1", messageId: "m1", type: "opened",
            recipient: "a@b.com", occurredAt: new Date(0), payload: {},
        });
        expect(res).toEqual({ inserted: true });
        expect(onConflictDoNothing).toHaveBeenCalled();
    });

    it("returns inserted:false when svix_id already exists (no row returned)", async () => {
        returning.mockResolvedValue([]);
        const { insertEmailEvent } = await import("./emailEvent.repository");
        const res = await insertEmailEvent({
            svixId: "msg_1", messageId: "m1", type: "opened",
            recipient: "a@b.com", occurredAt: new Date(0), payload: {},
        });
        expect(res).toEqual({ inserted: false });
    });
});
