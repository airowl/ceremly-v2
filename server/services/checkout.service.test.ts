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
            // Scenario Vercel Preview: NODE_ENV=production ma deployment non-prod.
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

    it("chiama createCheckout sul client raw con args corretti e propaga url", async () => {
        const { createCelebrationCheckout } = await import(
            "~~/server/services/checkout.service"
        );

        const result = await createCelebrationCheckout(fakeH3Event, EVENT_ID);

        // L'url restituito deve essere checkout.checkoutUrl
        expect(result).toEqual({ url: CHECKOUT_URL });

        // createCreemClient chiamato con apiKey + testMode
        expect(createCreemClient).toHaveBeenCalledOnce();
        expect(createCreemClient).toHaveBeenCalledWith({
            apiKey: "test_api_key",
            testMode: true, // development !== production
        });

        // rawCreateCheckout chiamato con l'argomento corretto (xApiKey + createCheckoutRequest)
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

        // setEventCheckoutId chiamato con checkoutId dall'entity
        expect(setEventCheckoutId).toHaveBeenCalledOnce();
        expect(setEventCheckoutId).toHaveBeenCalledWith(EVENT_ID, ORG_ID, CHECKOUT_ID);
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
        expect(createCreemClient).not.toHaveBeenCalled();
        expect(rawCreateCheckout).not.toHaveBeenCalled();
    });

    it("409 se org è Atelier (ha già eventi illimitati)", async () => {
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

    it("401 se non c'è organizzazione attiva nel context", async () => {
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

    it("502 se createCheckout restituisce entità senza checkoutUrl", async () => {
        rawCreateCheckout.mockResolvedValue({ ...fakeCheckoutEntity, checkoutUrl: undefined });

        const { createCelebrationCheckout } = await import(
            "~~/server/services/checkout.service"
        );

        await expect(createCelebrationCheckout(fakeH3Event, EVENT_ID)).rejects.toMatchObject({
            statusCode: 502,
        });
        // La guard (riga 65) cortocircuita PRIMA di setEventCheckoutId.
        expect(setEventCheckoutId).not.toHaveBeenCalled();
    });

    it("setEventCheckoutId failure PROPAGA: createCelebrationCheckout rigetta (nessun url restituito)", async () => {
        setEventCheckoutId.mockRejectedValue(new Error("DB error"));

        const { createCelebrationCheckout } = await import(
            "~~/server/services/checkout.service"
        );

        // Il checkout Creem viene creato (rawCreateCheckout chiamato) ma il persist fallisce
        // → la funzione rigetta e l'utente NON riceve l'url (sicuro: checkout non pagato = innocuo).
        await expect(createCelebrationCheckout(fakeH3Event, EVENT_ID)).rejects.toThrow("DB error");
        // Conferma che il checkout Creem è stato comunque creato (persist avviene DOPO la chiamata Creem)
        expect(rawCreateCheckout).toHaveBeenCalledOnce();
    });
});
