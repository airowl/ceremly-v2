import { describe, it, expect } from "vitest";
import { AUDIT_ACTIONS, getCategoryFromAction } from "./types";

describe("audit actions — cleanup", () => {
    it("espone event.cleanup_warned mappato alla categoria event", () => {
        expect(AUDIT_ACTIONS["event.cleanup_warned"]).toBe("event.cleanup_warned");
        expect(getCategoryFromAction("event.cleanup_warned")).toBe("event");
    });
    it("mantiene event.deleted disponibile per la delete del cleanup", () => {
        expect(AUDIT_ACTIONS["event.deleted"]).toBe("event.deleted");
    });
});
