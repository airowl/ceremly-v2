import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~~/server/utils/runtimeConfig", () => ({
    runtimeConfig: { creemProductIdAtelier: "prod_atelier_x", creemProductIdCelebration: "prod_celeb_x" },
}));

describe("getPlanFromProductId", () => {
    beforeEach(() => vi.resetModules());

    it("maps the Atelier product -> 'atelier'", async () => {
        const { getPlanFromProductId } = await import("~~/server/utils/creem");
        expect(getPlanFromProductId("prod_atelier_x")).toBe("atelier");
    });

    it("returns null for an unknown productId (including Celebrazione, which is one-time)", async () => {
        const { getPlanFromProductId } = await import("~~/server/utils/creem");
        expect(getPlanFromProductId("prod_celeb_x")).toBeNull();
        expect(getPlanFromProductId("prod_unknown")).toBeNull();
    });
});
