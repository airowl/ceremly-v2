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

    it("true if the owner's subscription maps to 'atelier'", async () => {
        resolveOrgOwnerId.mockResolvedValue("user_owner");
        getUserPlanInfo.mockResolvedValue({ subscription: { productId: "prod_atelier" } });
        getPlanFromProductId.mockReturnValue("atelier");
        const { isOrgAtelier } = await import("~~/server/services/eventAccess.service");
        expect(await isOrgAtelier("org_1")).toBe(true);
    });

    it("false if the owner has no subscription", async () => {
        resolveOrgOwnerId.mockResolvedValue("user_owner");
        getUserPlanInfo.mockResolvedValue({ subscription: null });
        const { isOrgAtelier } = await import("~~/server/services/eventAccess.service");
        expect(await isOrgAtelier("org_1")).toBe(false);
    });

    it("false if the subscription does not map to 'atelier' (e.g. unknown product)", async () => {
        resolveOrgOwnerId.mockResolvedValue("user_owner");
        getUserPlanInfo.mockResolvedValue({ subscription: { productId: "prod_x" } });
        getPlanFromProductId.mockReturnValue(null);
        const { isOrgAtelier } = await import("~~/server/services/eventAccess.service");
        expect(await isOrgAtelier("org_1")).toBe(false);
    });

    it("false if the org has no resolvable owner", async () => {
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

    it("atelier org -> tier atelier, unlimited (-1)", async () => {
        resolveOrgOwnerId.mockResolvedValue("u");
        getUserPlanInfo.mockResolvedValue({ subscription: { productId: "prod_atelier" } });
        getPlanFromProductId.mockReturnValue("atelier");
        const { getEventLimits } = await import("~~/server/services/eventAccess.service");
        const l = await getEventLimits({ id: "e1", organizationId: "org_1", tier: "free" });
        expect(l).toEqual({ tier: "atelier", maxGuestsPerEvent: -1, maxReminders: -1 });
    });

    it("celebration event on free org -> tier celebration (250 guests, 3 reminders)", async () => {
        resolveOrgOwnerId.mockResolvedValue("u");
        getUserPlanInfo.mockResolvedValue({ subscription: null });
        const { getEventLimits } = await import("~~/server/services/eventAccess.service");
        const l = await getEventLimits({ id: "e1", organizationId: "org_1", tier: "celebration" });
        expect(l).toEqual({ tier: "celebration", maxGuestsPerEvent: 250, maxReminders: 3 });
    });

    it("free event on free org -> tier free (30 guests, 3 reminders)", async () => {
        resolveOrgOwnerId.mockResolvedValue("u");
        getUserPlanInfo.mockResolvedValue({ subscription: null });
        const { getEventLimits } = await import("~~/server/services/eventAccess.service");
        const l = await getEventLimits({ id: "e1", organizationId: "org_1", tier: "free" });
        expect(l).toEqual({ tier: "free", maxGuestsPerEvent: 30, maxReminders: 3 });
    });
});
