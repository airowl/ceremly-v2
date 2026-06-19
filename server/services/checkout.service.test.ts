import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mock handles (declared before vi.mock hoisting) ----
const createCheckout = vi.fn();
const findEventByIdScoped = vi.fn();
const assertOwnership = vi.fn();
const isOrgAtelier = vi.fn();

vi.mock("@creem_io/better-auth/server", () => ({
    createCheckout: (...a: unknown[]) => createCheckout(...a),
}));

vi.mock("~~/server/utils/runtimeConfig", () => ({
    runtimeConfig: {
        creemApiKey: "test_api_key",
        creemProductIdCelebration: "prod_celebration_test",
        public: {
            baseURL: "https://example.com",
            appEnv: "development",
        },
    },
}));

vi.mock("~~/server/repositories/eventRepository", () => ({
    findEventByIdScoped: (...a: unknown[]) => findEventByIdScoped(...a),
}));

vi.mock("~~/server/utils/permissions", () => ({
    assertOwnership: (...a: unknown[]) => assertOwnership(...a),
}));

vi.mock("~~/server/services/eventAccess.service", () => ({
    isOrgAtelier: (...a: unknown[]) => isOrgAtelier(...a),
}));

// ---- Test helpers ----
const ORG_ID = "org_abc";
const EVENT_ID = "evt_xyz";
const BASE_URL = "https://example.com";
const PRODUCT_ID = "prod_celebration_test";

const fakeH3Event = {
    context: {
        organization: { id: ORG_ID },
        user: { email: "owner@example.com" },
    },
} as never;

const fakeEventRow = {
    id: EVENT_ID,
    organizationId: ORG_ID,
    tier: "free",
};

describe("createCelebrationCheckout", () => {
    beforeEach(() => {
        vi.resetModules();
        [createCheckout, findEventByIdScoped, assertOwnership, isOrgAtelier].forEach(
            (m) => m.mockReset(),
        );
        // Default happy-path setup
        findEventByIdScoped.mockResolvedValue(fakeEventRow);
        assertOwnership.mockReturnValue(fakeEventRow);
        isOrgAtelier.mockResolvedValue(false);
        createCheckout.mockResolvedValue({
            url: "https://checkout.creem.io/checkout/sess_123",
            redirect: true,
        });
    });

    it("chiama createCheckout con productId, metadata e successUrl corretti e propaga url", async () => {
        const { createCelebrationCheckout } = await import(
            "~~/server/services/checkout.service"
        );

        const result = await createCelebrationCheckout(fakeH3Event, EVENT_ID);

        // L'url restituito deve essere quello del mock
        expect(result).toEqual({ url: "https://checkout.creem.io/checkout/sess_123" });

        // createCheckout chiamato esattamente una volta
        expect(createCheckout).toHaveBeenCalledOnce();

        // Primo arg: config con testMode (appEnv !== 'production' → true)
        const [config, input] = createCheckout.mock.calls[0] as [
            Record<string, unknown>,
            Record<string, unknown>,
        ];
        expect(config).toMatchObject({
            apiKey: "test_api_key",
            testMode: true, // development !== production
        });

        // Secondo arg: input con productId, metadata e successUrl
        expect(input).toMatchObject({
            productId: PRODUCT_ID,
            metadata: { eventId: EVENT_ID, organizationId: ORG_ID },
            successUrl: `${BASE_URL}/dashboard/events/${EVENT_ID}?unlocked=true`,
        });
    });

    it("409 se l'evento è già tier celebration", async () => {
        findEventByIdScoped.mockResolvedValue({ ...fakeEventRow, tier: "celebration" });
        assertOwnership.mockReturnValue({ ...fakeEventRow, tier: "celebration" });

        const { createCelebrationCheckout } = await import(
            "~~/server/services/checkout.service"
        );

        await expect(createCelebrationCheckout(fakeH3Event, EVENT_ID)).rejects.toMatchObject({
            statusCode: 409,
        });
        expect(createCheckout).not.toHaveBeenCalled();
    });

    it("409 se org è Atelier (ha già eventi illimitati)", async () => {
        isOrgAtelier.mockResolvedValue(true);

        const { createCelebrationCheckout } = await import(
            "~~/server/services/checkout.service"
        );

        await expect(createCelebrationCheckout(fakeH3Event, EVENT_ID)).rejects.toMatchObject({
            statusCode: 409,
        });
        expect(createCheckout).not.toHaveBeenCalled();
    });

    it("401 se non c'è organizzazione attiva nel context", async () => {
        const noOrgEvent = { context: { user: { email: "x@y.com" } } } as never;

        const { createCelebrationCheckout } = await import(
            "~~/server/services/checkout.service"
        );

        await expect(createCelebrationCheckout(noOrgEvent, EVENT_ID)).rejects.toMatchObject({
            statusCode: 401,
        });
        expect(createCheckout).not.toHaveBeenCalled();
    });
});
