/**
 * Test unit per eventCleanup.service.ts (task 4.5).
 *
 * Test con mock — provano la logica del service: gate Atelier (CRITICAL),
 * email, mark, audit — senza toccare il DB. I test DB-backed per i helper
 * task 4.3 (markEventCleanupWarned, findEventWarnTargetInfo) si trovano in
 * server/repositories/eventRepository.cleanup.test.ts.
 *
 * Usano vi.hoisted() per rispettare il hoisting di vi.mock (le factory di
 * vi.mock non possono referenziare variabili let/const normali).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted: le variabili mock devono essere inizializzate PRIMA che vi.mock
// elabori le factory (che vengono hoistate in cima al file da Vitest).
const mocks = vi.hoisted(() => ({
    repo: {
        findStaleEventsToWarn: vi.fn(),
        findStaleEventsToDelete: vi.fn(),
        markEventCleanupWarned: vi.fn(),
        findEventWarnTargetInfo: vi.fn(),
        deleteEventScoped: vi.fn(),
    },
    access: {
        isOrgAtelier: vi.fn(),
    },
    plan: {
        resolveOrgOwnerId: vi.fn(),
    },
    email: {
        sendEmail: vi.fn(),
    },
    audit: {
        logAudit: vi.fn(),
    },
    tpl: {
        renderEventCleanupWarningEmail: vi.fn(async () => ({ html: "<p>x</p>", text: "x" })),
        emailSubjects: {
            eventCleanupWarning: (_title: string) => ({ it: "S", en: "S" }),
        },
    },
    rc: {
        runtimeConfig: { public: { baseURL: "https://app.test" } },
    },
}));

vi.mock("~~/server/repositories/eventRepository", () => mocks.repo);
vi.mock("~~/server/services/eventAccess.service", () => mocks.access);
vi.mock("~~/server/services/planLimit.service", () => mocks.plan);
vi.mock("~~/server/utils/email", () => mocks.email);
vi.mock("~~/server/emailTemplates", () => mocks.tpl);
vi.mock("~~/server/utils/audit", () => mocks.audit);
vi.mock("~~/server/utils/runtimeConfig", () => mocks.rc);

import { processStaleEventsWarn, processStaleEventsDelete } from "./eventCleanup.service";

beforeEach(() => {
    vi.clearAllMocks();
    mocks.plan.resolveOrgOwnerId.mockResolvedValue("owner_1");
    mocks.repo.findEventWarnTargetInfo.mockResolvedValue({
        title: "T",
        email: "o@test",
        locale: "it",
    });
    mocks.email.sendEmail.mockResolvedValue({ success: true });
});

describe("processStaleEventsWarn", () => {
    it("avvisa eventi non-atelier: email + mark + audit", async () => {
        mocks.repo.findStaleEventsToWarn.mockResolvedValue([{ id: "e1", organizationId: "o1" }]);
        mocks.access.isOrgAtelier.mockResolvedValue(false);

        const res = await processStaleEventsWarn();

        expect(res).toEqual({ warned: 1, skipped: 0 });
        expect(mocks.email.sendEmail).toHaveBeenCalledTimes(1);
        expect(mocks.repo.markEventCleanupWarned).toHaveBeenCalledWith(
            "o1",
            "e1",
            expect.any(Date),
        );
        expect(mocks.audit.logAudit).toHaveBeenCalledWith(
            null,
            "event.cleanup_warned",
            expect.objectContaining({ targetId: "e1", organizationId: "o1" }),
        );
    });

    it("salta le org atelier (mai warn, mai mark) — CRITICAL GATE", async () => {
        mocks.repo.findStaleEventsToWarn.mockResolvedValue([{ id: "e1", organizationId: "o1" }]);
        mocks.access.isOrgAtelier.mockResolvedValue(true);

        const res = await processStaleEventsWarn();

        expect(res).toEqual({ warned: 0, skipped: 1 });
        expect(mocks.email.sendEmail).not.toHaveBeenCalled();
        expect(mocks.repo.markEventCleanupWarned).not.toHaveBeenCalled();
        expect(mocks.audit.logAudit).not.toHaveBeenCalled();
    });

    it("salta (no email, no mark) se owner non trovato", async () => {
        mocks.repo.findStaleEventsToWarn.mockResolvedValue([{ id: "e1", organizationId: "o1" }]);
        mocks.access.isOrgAtelier.mockResolvedValue(false);
        mocks.plan.resolveOrgOwnerId.mockResolvedValue(null);

        const res = await processStaleEventsWarn();

        expect(res).toEqual({ warned: 0, skipped: 1 });
        expect(mocks.email.sendEmail).not.toHaveBeenCalled();
    });

    it("lista vuota → warned:0 skipped:0", async () => {
        mocks.repo.findStaleEventsToWarn.mockResolvedValue([]);

        const res = await processStaleEventsWarn();

        expect(res).toEqual({ warned: 0, skipped: 0 });
        expect(mocks.email.sendEmail).not.toHaveBeenCalled();
    });

    it("mix: atelier skippato, non-atelier avvisato", async () => {
        mocks.repo.findStaleEventsToWarn.mockResolvedValue([
            { id: "e1", organizationId: "atelier_org" },
            { id: "e2", organizationId: "free_org" },
        ]);
        mocks.access.isOrgAtelier.mockImplementation(async (orgId: string) =>
            orgId === "atelier_org",
        );

        const res = await processStaleEventsWarn();

        expect(res).toEqual({ warned: 1, skipped: 1 });
        expect(mocks.email.sendEmail).toHaveBeenCalledTimes(1);
    });
});

describe("processStaleEventsDelete", () => {
    it("elimina eventi warned non-atelier + audit event.deleted", async () => {
        mocks.repo.findStaleEventsToDelete.mockResolvedValue([
            { id: "e1", organizationId: "o1" },
        ]);
        mocks.access.isOrgAtelier.mockResolvedValue(false);
        mocks.repo.deleteEventScoped.mockResolvedValue({ id: "e1" });

        const res = await processStaleEventsDelete();

        expect(res).toEqual({ deleted: 1, skipped: 0 });
        expect(mocks.repo.deleteEventScoped).toHaveBeenCalledWith("o1", "e1");
        expect(mocks.audit.logAudit).toHaveBeenCalledWith(
            null,
            "event.deleted",
            expect.objectContaining({ targetId: "e1", organizationId: "o1" }),
        );
    });

    it("salta le org atelier (mai delete) — CRITICAL GATE", async () => {
        mocks.repo.findStaleEventsToDelete.mockResolvedValue([
            { id: "e1", organizationId: "o1" },
        ]);
        mocks.access.isOrgAtelier.mockResolvedValue(true);

        const res = await processStaleEventsDelete();

        expect(res).toEqual({ deleted: 0, skipped: 1 });
        expect(mocks.repo.deleteEventScoped).not.toHaveBeenCalled();
        expect(mocks.audit.logAudit).not.toHaveBeenCalled();
    });

    it("salta (skipped) se deleteEventScoped restituisce undefined/null", async () => {
        mocks.repo.findStaleEventsToDelete.mockResolvedValue([
            { id: "e1", organizationId: "o1" },
        ]);
        mocks.access.isOrgAtelier.mockResolvedValue(false);
        mocks.repo.deleteEventScoped.mockResolvedValue(undefined);

        const res = await processStaleEventsDelete();

        expect(res).toEqual({ deleted: 0, skipped: 1 });
        expect(mocks.audit.logAudit).not.toHaveBeenCalled();
    });

    it("lista vuota → deleted:0 skipped:0", async () => {
        mocks.repo.findStaleEventsToDelete.mockResolvedValue([]);

        const res = await processStaleEventsDelete();

        expect(res).toEqual({ deleted: 0, skipped: 0 });
        expect(mocks.repo.deleteEventScoped).not.toHaveBeenCalled();
    });

    it("mix: atelier skippato, non-atelier eliminato", async () => {
        mocks.repo.findStaleEventsToDelete.mockResolvedValue([
            { id: "e1", organizationId: "atelier_org" },
            { id: "e2", organizationId: "free_org" },
        ]);
        mocks.access.isOrgAtelier.mockImplementation(async (orgId: string) =>
            orgId === "atelier_org",
        );
        mocks.repo.deleteEventScoped.mockResolvedValue({ id: "e2" });

        const res = await processStaleEventsDelete();

        expect(res).toEqual({ deleted: 1, skipped: 1 });
        expect(mocks.repo.deleteEventScoped).toHaveBeenCalledTimes(1);
        expect(mocks.repo.deleteEventScoped).toHaveBeenCalledWith("free_org", "e2");
    });
});
