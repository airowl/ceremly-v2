import { describe, it, expect, vi, beforeEach } from "vitest";

const findEventByIdScoped = vi.fn();
const getEventLimits = vi.fn();
const findRemindersByEvent = vi.fn();
const bulkUpsertReminders = vi.fn();

vi.mock("~~/server/repositories/eventRepository", () => ({
    findEventByIdScoped: (...a: unknown[]) => findEventByIdScoped(...a),
}));
vi.mock("~~/server/services/eventAccess.service", () => ({
    getEventLimits: (...a: unknown[]) => getEventLimits(...a),
}));
vi.mock("~~/server/repositories/reminderRepository", () => ({
    findRemindersByEvent: (...a: unknown[]) => findRemindersByEvent(...a),
    bulkUpsertReminders: (...a: unknown[]) => bulkUpsertReminders(...a),
    findDueReminders: vi.fn(), findPendingGuestsForReminder: vi.fn(), markReminderSent: vi.fn(),
}));
vi.mock("~~/server/utils/audit", () => ({ logAudit: vi.fn() }));
vi.mock("~~/server/utils/permissions", () => ({ assertOwnership: (r: unknown) => r }));
vi.mock("~~/server/queue", () => ({ dispatch: vi.fn() }));

const fakeEvent = { context: { organization: { id: "org_test" } } } as never;

function expectStatus(p: Promise<unknown>, code: number) {
    return p.then(() => { throw new Error(`atteso throw ${code}`); }, (e: { statusCode?: number }) => expect(e.statusCode).toBe(code));
}

describe("saveReminders limit tier-aware", () => {
    beforeEach(() => {
        vi.resetModules();
        [findEventByIdScoped, getEventLimits, findRemindersByEvent, bulkUpsertReminders].forEach((m) => m.mockReset());
        findEventByIdScoped.mockResolvedValue({ id: "e1", organizationId: "org_test", tier: "free" });
        findRemindersByEvent.mockResolvedValue([]);
        bulkUpsertReminders.mockResolvedValue({ inserted: 0, updated: 0, deleted: 0 });
    });

    it("free: 4 new reminders (limit 3) -> 422", async () => {
        getEventLimits.mockResolvedValue({ tier: "free", maxGuestsPerEvent: 30, maxReminders: 3 });
        const reminders = Array.from({ length: 4 }, (_, i) => ({ daysBefore: i + 1, enabled: true }));
        const { saveReminders } = await import("~~/server/services/reminder.service");
        await expectStatus(saveReminders(fakeEvent, "e1", { reminders } as never), 422);
    });

    it("atelier (-1): 4 reminders -> no limit, ok", async () => {
        getEventLimits.mockResolvedValue({ tier: "atelier", maxGuestsPerEvent: -1, maxReminders: -1 });
        const reminders = Array.from({ length: 4 }, (_, i) => ({ daysBefore: i + 1, enabled: true }));
        const { saveReminders } = await import("~~/server/services/reminder.service");
        const res = await saveReminders(fakeEvent, "e1", { reminders } as never);
        expect(res.reminders).toBeDefined();
    });
});
