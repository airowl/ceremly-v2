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

    it("ospite #31 su evento free -> 402", async () => {
        getEventLimits.mockResolvedValue({ tier: "free", maxGuestsPerEvent: 30, maxReminders: 3 });
        countActiveGuests.mockResolvedValue(30);
        const { createGuest } = await import("~~/server/services/guest.service");
        await expectStatus(createGuest(fakeEvent, "e1", input), 402);
        expect(createGuestRow).not.toHaveBeenCalled();
    });

    it("ospite #31 su evento celebration -> ok (250)", async () => {
        getEventLimits.mockResolvedValue({ tier: "celebration", maxGuestsPerEvent: 250, maxReminders: 3 });
        countActiveGuests.mockResolvedValue(30);
        const { createGuest } = await import("~~/server/services/guest.service");
        const res = await createGuest(fakeEvent, "e1", input);
        expect(res.guest.id).toBe("g_new");
    });

    it("org atelier (-1) -> nessun limite ospiti", async () => {
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

    it("evento free a 28 ospiti: importa max 2, skippa il resto", async () => {
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

    it("evento celebration: capacity 250, importa tutte le righe", async () => {
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
