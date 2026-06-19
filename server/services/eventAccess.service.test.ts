import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveOrgOwnerId = vi.fn();
const getUserPlanInfo = vi.fn();
const getPlanFromProductId = vi.fn();

vi.mock("~~/server/services/planLimit.service", () => ({
    resolveOrgOwnerId: (...a: unknown[]) => resolveOrgOwnerId(...a),
    getUserPlanInfo: (...a: unknown[]) => getUserPlanInfo(...a),
}));
vi.mock("~~/server/utils/creem", () => ({
    getPlanFromProductId: (...a: unknown[]) => getPlanFromProductId(...a),
}));

describe("isOrgAtelier", () => {
    beforeEach(() => {
        vi.resetModules();
        [resolveOrgOwnerId, getUserPlanInfo, getPlanFromProductId].forEach((m) => m.mockReset());
    });

    it("true se la subscription dell'owner mappa a 'atelier'", async () => {
        resolveOrgOwnerId.mockResolvedValue("user_owner");
        getUserPlanInfo.mockResolvedValue({ subscription: { productId: "prod_atelier" } });
        getPlanFromProductId.mockReturnValue("atelier");
        const { isOrgAtelier } = await import("~~/server/services/eventAccess.service");
        expect(await isOrgAtelier("org_1")).toBe(true);
    });

    it("false se l'owner non ha subscription", async () => {
        resolveOrgOwnerId.mockResolvedValue("user_owner");
        getUserPlanInfo.mockResolvedValue({ subscription: null });
        const { isOrgAtelier } = await import("~~/server/services/eventAccess.service");
        expect(await isOrgAtelier("org_1")).toBe(false);
    });

    it("false se la subscription non mappa a 'atelier' (es. prodotto sconosciuto)", async () => {
        resolveOrgOwnerId.mockResolvedValue("user_owner");
        getUserPlanInfo.mockResolvedValue({ subscription: { productId: "prod_x" } });
        getPlanFromProductId.mockReturnValue(null);
        const { isOrgAtelier } = await import("~~/server/services/eventAccess.service");
        expect(await isOrgAtelier("org_1")).toBe(false);
    });

    it("false se l'org non ha owner risolvibile", async () => {
        resolveOrgOwnerId.mockResolvedValue(null);
        const { isOrgAtelier } = await import("~~/server/services/eventAccess.service");
        expect(await isOrgAtelier("org_1")).toBe(false);
    });
});

describe("getEventLimits", () => {
    beforeEach(() => {
        vi.resetModules();
        [resolveOrgOwnerId, getUserPlanInfo, getPlanFromProductId].forEach((m) => m.mockReset());
    });

    it("org atelier -> tier atelier, illimitato (-1)", async () => {
        resolveOrgOwnerId.mockResolvedValue("u");
        getUserPlanInfo.mockResolvedValue({ subscription: { productId: "prod_atelier" } });
        getPlanFromProductId.mockReturnValue("atelier");
        const { getEventLimits } = await import("~~/server/services/eventAccess.service");
        const l = await getEventLimits({ id: "e1", organizationId: "org_1", tier: "free" });
        expect(l).toEqual({ tier: "atelier", maxGuestsPerEvent: -1, maxReminders: -1 });
    });

    it("evento celebration su org free -> tier celebration (250 ospiti, 3 reminder)", async () => {
        resolveOrgOwnerId.mockResolvedValue("u");
        getUserPlanInfo.mockResolvedValue({ subscription: null });
        const { getEventLimits } = await import("~~/server/services/eventAccess.service");
        const l = await getEventLimits({ id: "e1", organizationId: "org_1", tier: "celebration" });
        expect(l).toEqual({ tier: "celebration", maxGuestsPerEvent: 250, maxReminders: 3 });
    });

    it("evento free su org free -> tier free (30 ospiti, 3 reminder)", async () => {
        resolveOrgOwnerId.mockResolvedValue("u");
        getUserPlanInfo.mockResolvedValue({ subscription: null });
        const { getEventLimits } = await import("~~/server/services/eventAccess.service");
        const l = await getEventLimits({ id: "e1", organizationId: "org_1", tier: "free" });
        expect(l).toEqual({ tier: "free", maxGuestsPerEvent: 30, maxReminders: 3 });
    });
});
