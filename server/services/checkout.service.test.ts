/**
 * TDD — checkout.service.ts (fix 7.2)
 *
 * Mock strategy:
 * - @creem_io/better-auth/server → createCreemClient mocked to return
 *   { createCheckout: rawCreateCheckout } — the raw Creem instance.
 * - server/repositories/eventRepository → findEventByIdScoped + setEventCheckoutId mocked
 * - server/utils/permissions → assertOwnership mocked
 * - server/services/eventAccess.service → isOrgAtelier mocked
 * - server/utils/runtimeConfig → runtimeConfig mocked
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mock handles (declared before vi.mock hoisting) ----
const rawCreateCheckout = vi.fn();
const createCreemClient = vi.fn();
const findEventByIdScoped = vi.fn();
const setEventCheckoutId = vi.fn();
const assertOwnership = vi.fn();
const isOrgAtelier = vi.fn();

vi.mock("@creem_io/better-auth/server", () => ({
    createCreemClient: (...a: unknown[]) => createCreemClient(...a),
}));

vi.mock("~~/server/utils/runtimeConfig", () => ({
    runtimeConfig: {
        creemApiKey: "test_api_key",
        creemProductIdCelebration: "prod_celebration_test",
        public: {
            baseURL: "https://example.com",
            // Scenario Vercel Preview: NODE_ENV=production but non-prod deployment.
            appEnv: "production",
            isProdDeployment: false,
        },
    },
}));

vi.mock("~~/server/repositories/eventRepository", () => ({
    findEventByIdScoped: (...a: unknown[]) => findEventByIdScoped(...a),
    setEventCheckoutId: (...a: unknown[]) => setEventCheckoutId(...a),
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
const CHECKOUT_ID = "chk_001";
const CHECKOUT_URL = "https://checkout.creem.io/checkout/sess_123";

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

const fakeCheckoutEntity = {
    id: CHECKOUT_ID,
    checkoutUrl: CHECKOUT_URL,
    mode: "test",
    object: "checkout",
    status: "pending",
    product: PRODUCT_ID,
};

describe("createCelebrationCheckout", () => {
    beforeEach(() => {
        vi.resetModules();
        [rawCreateCheckout, createCreemClient, findEventByIdScoped, setEventCheckoutId, assertOwnership, isOrgAtelier].forEach(
            (m) => m.mockReset(),
        );
        // Default happy-path setup
        findEventByIdScoped.mockResolvedValue(fakeEventRow);
        assertOwnership.mockReturnValue(fakeEventRow);
        isOrgAtelier.mockResolvedValue(false);
        setEventCheckoutId.mockResolvedValue(undefined);
        rawCreateCheckout.mockResolvedValue(fakeCheckoutEntity);
        createCreemClient.mockReturnValue({ createCheckout: rawCreateCheckout });
    });

    it("calls createCheckout on the raw client with correct args and propagates url", async () => {
        const { createCelebrationCheckout } = await import(
            "~~/server/services/checkout.service"
        );

        const result = await createCelebrationCheckout(fakeH3Event, EVENT_ID);

        // The returned url must be checkout.checkoutUrl
        expect(result).toEqual({ url: CHECKOUT_URL });

        // createCreemClient called with apiKey + testMode
        expect(createCreemClient).toHaveBeenCalledOnce();
        expect(createCreemClient).toHaveBeenCalledWith({
            apiKey: "test_api_key",
            testMode: true, // !isProdDeployment (Preview scenario: appEnv="production")
        });

        // rawCreateCheckout called with the correct argument (xApiKey + createCheckoutRequest)
        expect(rawCreateCheckout).toHaveBeenCalledOnce();
        const [rawArg] = rawCreateCheckout.mock.calls[0] as [Record<string, unknown>];
        expect(rawArg).toMatchObject({
            xApiKey: "test_api_key",
            createCheckoutRequest: {
                productId: PRODUCT_ID,
                metadata: { eventId: EVENT_ID, organizationId: ORG_ID },
                successUrl: `${BASE_URL}/dashboard/events/${EVENT_ID}?unlocked=true`,
            },
        });

        // setEventCheckoutId called with checkoutId from the entity
        expect(setEventCheckoutId).toHaveBeenCalledOnce();
        expect(setEventCheckoutId).toHaveBeenCalledWith(EVENT_ID, ORG_ID, CHECKOUT_ID);
    });

    it("409 if the event is already tier celebration", async () => {
        findEventByIdScoped.mockResolvedValue({ ...fakeEventRow, tier: "celebration" });
        assertOwnership.mockReturnValue({ ...fakeEventRow, tier: "celebration" });

        const { createCelebrationCheckout } = await import(
            "~~/server/services/checkout.service"
        );

        await expect(createCelebrationCheckout(fakeH3Event, EVENT_ID)).rejects.toMatchObject({
            statusCode: 409,
        });
        expect(createCreemClient).not.toHaveBeenCalled();
        expect(rawCreateCheckout).not.toHaveBeenCalled();
    });

    it("409 if org is Atelier (already has unlimited events)", async () => {
        isOrgAtelier.mockResolvedValue(true);

        const { createCelebrationCheckout } = await import(
            "~~/server/services/checkout.service"
        );

        await expect(createCelebrationCheckout(fakeH3Event, EVENT_ID)).rejects.toMatchObject({
            statusCode: 409,
        });
        expect(createCreemClient).not.toHaveBeenCalled();
        expect(rawCreateCheckout).not.toHaveBeenCalled();
    });

    it("401 if there is no active organization in context", async () => {
        const noOrgEvent = { context: { user: { email: "x@y.com" } } } as never;

        const { createCelebrationCheckout } = await import(
            "~~/server/services/checkout.service"
        );

        await expect(createCelebrationCheckout(noOrgEvent, EVENT_ID)).rejects.toMatchObject({
            statusCode: 401,
        });
        expect(createCreemClient).not.toHaveBeenCalled();
        expect(rawCreateCheckout).not.toHaveBeenCalled();
    });

    it("502 if createCheckout returns entity without checkoutUrl", async () => {
        rawCreateCheckout.mockResolvedValue({ ...fakeCheckoutEntity, checkoutUrl: undefined });

        const { createCelebrationCheckout } = await import(
            "~~/server/services/checkout.service"
        );

        await expect(createCelebrationCheckout(fakeH3Event, EVENT_ID)).rejects.toMatchObject({
            statusCode: 502,
        });
        // The guard (line 65) short-circuits BEFORE setEventCheckoutId.
        expect(setEventCheckoutId).not.toHaveBeenCalled();
    });

    it("setEventCheckoutId failure PROPAGATES: createCelebrationCheckout rejects (no url returned)", async () => {
        setEventCheckoutId.mockRejectedValue(new Error("DB error"));

        const { createCelebrationCheckout } = await import(
            "~~/server/services/checkout.service"
        );

        // The Creem checkout is created (rawCreateCheckout called) but persistence fails
        // → the function rejects and the user does NOT receive the url (safe: unpaid checkout = harmless).
        await expect(createCelebrationCheckout(fakeH3Event, EVENT_ID)).rejects.toThrow("DB error");
        // Confirms that the Creem checkout was still created (persistence happens AFTER the Creem call)
        expect(rawCreateCheckout).toHaveBeenCalledOnce();
    });
});
