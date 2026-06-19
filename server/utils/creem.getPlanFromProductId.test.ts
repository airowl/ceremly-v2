import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~~/server/utils/runtimeConfig", () => ({
    runtimeConfig: { creemProductIdAtelier: "prod_atelier_x", creemProductIdCelebration: "prod_celeb_x" },
}));

describe("getPlanFromProductId", () => {
    beforeEach(() => vi.resetModules());

    it("mappa il prodotto Atelier -> 'atelier'", async () => {
        const { getPlanFromProductId } = await import("~~/server/utils/creem");
        expect(getPlanFromProductId("prod_atelier_x")).toBe("atelier");
    });

    it("ritorna null per un productId sconosciuto (incluso Celebrazione, che è one-time)", async () => {
        const { getPlanFromProductId } = await import("~~/server/utils/creem");
        expect(getPlanFromProductId("prod_celeb_x")).toBeNull();
        expect(getPlanFromProductId("prod_unknown")).toBeNull();
    });
});
