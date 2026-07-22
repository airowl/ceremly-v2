import { describe, it, expect, vi, beforeEach } from "vitest";

// logInviteAudit's only side effect is the logAudit call — mock the audit
// module (auth.ts's actual import path) so this test never touches getDB()/Neon.
vi.mock("./audit", () => ({
    logAudit: vi.fn(),
}));

import { logAudit } from "./audit";
import { logInviteAudit } from "./auth";

const logAuditMock = vi.mocked(logAudit);

describe("logInviteAudit", () => {
    beforeEach(() => {
        logAuditMock.mockClear();
    });

    it("records failure status and emailDelivered:false when the invite email did not send", async () => {
        await logInviteAudit(
            { invitationId: "inv1", email: "a@b.com", inviterId: "u1", organizationId: "o1", role: "member" },
            false,
        );

        expect(logAuditMock).toHaveBeenCalledWith(
            null,
            "team.member_invited",
            expect.objectContaining({
                userId: "u1",
                organizationId: "o1",
                targetType: "email",
                targetId: "a@b.com",
                status: "failure",
                details: expect.objectContaining({
                    role: "member",
                    invitationId: "inv1",
                    emailDelivered: false,
                }),
            }),
        );
    });

    it("records success status and emailDelivered:true when the invite email was delivered", async () => {
        await logInviteAudit(
            { invitationId: "inv2", email: "c@d.com", inviterId: "u2", organizationId: "o2", role: "admin" },
            true,
        );

        expect(logAuditMock).toHaveBeenCalledWith(
            null,
            "team.member_invited",
            expect.objectContaining({
                userId: "u2",
                organizationId: "o2",
                targetType: "email",
                targetId: "c@d.com",
                status: "success",
                details: expect.objectContaining({
                    role: "admin",
                    invitationId: "inv2",
                    emailDelivered: true,
                }),
            }),
        );
    });
});
