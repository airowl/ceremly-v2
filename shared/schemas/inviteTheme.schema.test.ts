import { describe, it, expect } from "vitest";
import { themeSchema, updateEventSchema } from "./ceremly";

describe("themeSchema + updateEventSchema (custom theme)", () => {
    const theme = { paper: "#FFFFFF", accent: "#d4a373", deep: "#5E4426", onAccent: "#3F3622" };
    it("accepts a valid hex theme", () => {
        expect(themeSchema.safeParse(theme).success).toBe(true);
    });
    it("rejects invalid hex values", () => {
        expect(themeSchema.safeParse({ ...theme, accent: "red" }).success).toBe(false);
    });
    it("updateEvent accepts inviteFont in the catalogue, rejects unknown ones", () => {
        expect(updateEventSchema.safeParse({ inviteFont: "Lora" }).success).toBe(true);
        expect(updateEventSchema.safeParse({ inviteFont: "Comic Sans MS" }).success).toBe(false);
    });
    it("updateEvent accepts theme and inviteFont null (reset)", () => {
        expect(updateEventSchema.safeParse({ theme: null, inviteFont: null }).success).toBe(true);
    });
});
