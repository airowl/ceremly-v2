import { describe, it, expect, vi, beforeEach } from "vitest";

const findEventByIdScoped = vi.fn();
const countActiveGuests = vi.fn();
const activeGuestEmailExists = vi.fn();
const createGuestRow = vi.fn();
const getEventLimits = vi.fn();

vi.mock("~~/server/repositories/eventRepository", () => ({
    findEventByIdScoped: (...a: unknown[]) => findEventByIdScoped(...a),
}));
vi.mock("~~/server/repositories/guestRepository", () => ({
    countActiveGuests: (...a: unknown[]) => countActiveGuests(...a),
    activeGuestEmailExists: (...a: unknown[]) => activeGuestEmailExists(...a),
    createGuestRow: (...a: unknown[]) => createGuestRow(...a),
    createGuestsBulk: vi.fn(), findActiveGuestEmails: vi.fn(), findActiveGuestNames: vi.fn(),
    findActivitiesByGuestScoped: vi.fn(), findGuestByIdScoped: vi.fn(), findGuestsByEventWithResponse: vi.fn(),
    findResponseByGuestScoped: vi.fn(), softDeleteGuestScoped: vi.fn(), updateGuestScoped: vi.fn(),
}));
vi.mock("~~/server/services/eventAccess.service", () => ({
    getEventLimits: (...a: unknown[]) => getEventLimits(...a),
}));
vi.mock("~~/server/utils/audit", () => ({ logAudit: vi.fn() }));
vi.mock("~~/server/utils/permissions", () => ({ assertOwnership: (row: unknown) => row }));
vi.mock("~~/server/utils/guestToken", () => ({ generateGuestToken: () => "tok_test" }));

const fakeEvent = { context: { organization: { id: "org_test" } } } as never;
const input = { firstName: "Mario", lastName: "Rossi", email: null } as never;

function expectStatus(p: Promise<unknown>, code: number) {
    return p.then(() => { throw new Error(`atteso throw ${code}, nessuno`); }, (e: { statusCode?: number }) => expect(e.statusCode).toBe(code));
}

describe("createGuest enforcement", () => {
    beforeEach(() => {
        vi.resetModules();
        [findEventByIdScoped, countActiveGuests, activeGuestEmailExists, createGuestRow, getEventLimits].forEach((m) => m.mockReset());
        findEventByIdScoped.mockResolvedValue({ id: "e1", organizationId: "org_test", tier: "free" });
        activeGuestEmailExists.mockResolvedValue(false);
        createGuestRow.mockResolvedValue({ id: "g_new" });
    });

    it("guest #31 on free event -> 402", async () => {
        getEventLimits.mockResolvedValue({ tier: "free", maxGuestsPerEvent: 30, maxReminders: 3 });
        countActiveGuests.mockResolvedValue(30);
        const { createGuest } = await import("~~/server/services/guest.service");
        await expectStatus(createGuest(fakeEvent, "e1", input), 402);
        expect(createGuestRow).not.toHaveBeenCalled();
    });

    it("guest #31 on celebration event -> ok (250)", async () => {
        getEventLimits.mockResolvedValue({ tier: "celebration", maxGuestsPerEvent: 250, maxReminders: 3 });
        countActiveGuests.mockResolvedValue(30);
        const { createGuest } = await import("~~/server/services/guest.service");
        const res = await createGuest(fakeEvent, "e1", input);
        expect(res.guest.id).toBe("g_new");
    });

    it("guest #251 on celebration event -> 402 with 250-cap message (not 'upgrade to Celebration')", async () => {
        getEventLimits.mockResolvedValue({ tier: "celebration", maxGuestsPerEvent: 250, maxReminders: 3 });
        countActiveGuests.mockResolvedValue(250);
        const { createGuest } = await import("~~/server/services/guest.service");
        await expectStatus(createGuest(fakeEvent, "e1", input), 402).then(() => {
            expect(createGuestRow).not.toHaveBeenCalled();
        });
    });

    it("402 celebration cap: message contains '250' and NOT 'Sblocca con Celebrazione'", async () => {
        getEventLimits.mockResolvedValue({ tier: "celebration", maxGuestsPerEvent: 250, maxReminders: 3 });
        countActiveGuests.mockResolvedValue(250);
        const { createGuest } = await import("~~/server/services/guest.service");
        let caughtMsg = "";
        await createGuest(fakeEvent, "e1", input).catch((e: { statusMessage?: string }) => {
            caughtMsg = e.statusMessage ?? "";
        });
        expect(caughtMsg).toContain("250");
        expect(caughtMsg).not.toContain("Sblocca con Celebrazione");
    });

    it("org atelier (-1) -> no guest limit", async () => {
        getEventLimits.mockResolvedValue({ tier: "atelier", maxGuestsPerEvent: -1, maxReminders: -1 });
        countActiveGuests.mockResolvedValue(99999);
        const { createGuest } = await import("~~/server/services/guest.service");
        const res = await createGuest(fakeEvent, "e1", input);
        expect(res.guest.id).toBe("g_new");
    });
});

describe("importGuests capacity", () => {
    const findActiveGuestNames = vi.fn();
    const findActiveGuestEmails = vi.fn();
    const createGuestsBulk = vi.fn();

    beforeEach(() => {
        vi.resetModules();
        [findEventByIdScoped, countActiveGuests, getEventLimits, findActiveGuestNames, findActiveGuestEmails, createGuestsBulk]
            .forEach((m) => m.mockReset());
        findEventByIdScoped.mockResolvedValue({ id: "e1", organizationId: "org_test", tier: "free" });
        findActiveGuestNames.mockResolvedValue([]);
        findActiveGuestEmails.mockResolvedValue([]);
        createGuestsBulk.mockImplementation((_o, _e, rows: unknown[]) => Promise.resolve(rows));
    });

    it("free event with 28 guests: import max 2, skip the rest", async () => {
        vi.doMock("~~/server/repositories/guestRepository", () => ({
            countActiveGuests: () => Promise.resolve(28),
            findActiveGuestNames: () => Promise.resolve([]),
            findActiveGuestEmails: () => Promise.resolve([]),
            createGuestsBulk: (_o: unknown, _e: unknown, rows: unknown[]) => Promise.resolve(rows),
            activeGuestEmailExists: vi.fn(), createGuestRow: vi.fn(), findActivitiesByGuestScoped: vi.fn(),
            findGuestByIdScoped: vi.fn(), findGuestsByEventWithResponse: vi.fn(),
            findResponseByGuestScoped: vi.fn(), softDeleteGuestScoped: vi.fn(), updateGuestScoped: vi.fn(),
        }));
        getEventLimits.mockResolvedValue({ tier: "free", maxGuestsPerEvent: 30, maxReminders: 3 });
        const { importGuests } = await import("~~/server/services/guest.service");
        const rows = Array.from({ length: 5 }, (_, i) => ({ firstName: `N${i}`, lastName: "X", email: null }));
        const res = await importGuests(fakeEvent, "e1", { rows } as never);
        expect(res.imported).toBe(2);
        expect(res.skipped.length).toBe(3);
    });

    it("celebration event: capacity 250, import all rows", async () => {
        vi.doMock("~~/server/repositories/guestRepository", () => ({
            countActiveGuests: () => Promise.resolve(0),
            findActiveGuestNames: () => Promise.resolve([]),
            findActiveGuestEmails: () => Promise.resolve([]),
            createGuestsBulk: (_o: unknown, _e: unknown, rows: unknown[]) => Promise.resolve(rows),
            activeGuestEmailExists: vi.fn(), createGuestRow: vi.fn(), findActivitiesByGuestScoped: vi.fn(),
            findGuestByIdScoped: vi.fn(), findGuestsByEventWithResponse: vi.fn(),
            findResponseByGuestScoped: vi.fn(), softDeleteGuestScoped: vi.fn(), updateGuestScoped: vi.fn(),
        }));
        getEventLimits.mockResolvedValue({ tier: "celebration", maxGuestsPerEvent: 250, maxReminders: 3 });
        const { importGuests } = await import("~~/server/services/guest.service");
        const rows = Array.from({ length: 40 }, (_, i) => ({ firstName: `N${i}`, lastName: "X", email: null }));
        const res = await importGuests(fakeEvent, "e1", { rows } as never);
        expect(res.imported).toBe(40);
        expect(res.skipped.length).toBe(0);
    });
});
