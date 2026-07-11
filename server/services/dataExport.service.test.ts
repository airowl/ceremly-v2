import { describe, it, expect, vi, beforeEach } from "vitest";

const whereMock = vi.fn().mockResolvedValue(undefined);
const setMock = vi.fn(() => ({ where: whereMock }));
const updateMock = vi.fn(() => ({ set: setMock }));

vi.mock("~~/server/utils/db", () => ({
    getDB: () => ({ update: updateMock }),
}));

describe("failStaleExports self-healing", () => {
    beforeEach(() => {
        vi.resetModules();
        [whereMock, setMock, updateMock].forEach((m) => m.mockClear());
    });

    it("flips stale pending/processing exports to failed with an error message", async () => {
        const { failStaleExports } = await import("~~/server/services/dataExport.service");
        await failStaleExports("user_1");
        expect(updateMock).toHaveBeenCalledTimes(1);
        expect(setMock).toHaveBeenCalledWith({
            status: "failed",
            errorMessage: expect.stringContaining("timed out"),
        });
        expect(whereMock).toHaveBeenCalledTimes(1);
    });
});
