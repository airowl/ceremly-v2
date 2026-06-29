import { describe, it, expect, vi, beforeEach } from "vitest";

const isOrgAtelier = vi.fn();
const countActiveEventsByOrg = vi.fn();
const createEventRow = vi.fn();

vi.mock("~~/server/services/eventAccess.service", () => ({
    isOrgAtelier: (...a: unknown[]) => isOrgAtelier(...a),
}));
vi.mock("~~/server/repositories/eventRepository", () => ({
    countActiveEventsByOrg: (...a: unknown[]) => countActiveEventsByOrg(...a),
    createEventRow: (...a: unknown[]) => createEventRow(...a),
    findEventsByOrgWithCounts: vi.fn(), findEventByIdScoped: vi.fn(),
    updateEventScoped: vi.fn(), deleteEventScoped: vi.fn(),
}));
vi.mock("~~/server/utils/audit", () => ({ logAudit: vi.fn() }));

const fakeEvent = { context: { organization: { id: "org_test" } } } as never;
// Real type/templateKey pair: "coriandoli" is an existing birthday template.
const input = { type: "compleanno", templateKey: "coriandoli", title: "Festa" } as never;

function expectStatus(p: Promise<unknown>, code: number) {
    return p.then(() => { throw new Error(`expected throw ${code}`); }, (e: { statusCode?: number }) => expect(e.statusCode).toBe(code));
}

describe("createEvent enforcement", () => {
    beforeEach(() => {
        vi.resetModules();
        [isOrgAtelier, countActiveEventsByOrg, createEventRow].forEach((m) => m.mockReset());
        createEventRow.mockResolvedValue({ id: "e_new", tier: "free" });
    });

    it("2nd event on free org -> 402", async () => {
        isOrgAtelier.mockResolvedValue(false);
        countActiveEventsByOrg.mockResolvedValue(1); // already 1 active free -> 2nd exceeds limit
        const { createEvent } = await import("~~/server/services/event.service");
        await expectStatus(createEvent(fakeEvent, input), 402);
        expect(createEventRow).not.toHaveBeenCalled();
    });

    it("atelier org -> no event limit (countActiveEventsByOrg not called)", async () => {
        isOrgAtelier.mockResolvedValue(true);
        countActiveEventsByOrg.mockResolvedValue(99);
        const { createEvent } = await import("~~/server/services/event.service");
        const res = await createEvent(fakeEvent, input);
        expect((res.event as { id: string }).id).toBe("e_new");
        expect(countActiveEventsByOrg).not.toHaveBeenCalled();
    });
});
