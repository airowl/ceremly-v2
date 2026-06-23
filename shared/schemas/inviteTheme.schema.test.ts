import { describe, it, expect } from "vitest";
import { themeSchema, updateEventSchema } from "./ceremly";

describe("themeSchema + updateEventSchema (tema custom)", () => {
    const theme = { paper: "#FFFFFF", accent: "#d4a373", deep: "#5E4426", onAccent: "#3F3622" };
    it("accetta un tema hex valido", () => {
        expect(themeSchema.safeParse(theme).success).toBe(true);
    });
    it("rifiuta hex non validi", () => {
        expect(themeSchema.safeParse({ ...theme, accent: "red" }).success).toBe(false);
    });
    it("updateEvent accetta inviteFont in catalogo, rifiuta estranei", () => {
        expect(updateEventSchema.safeParse({ inviteFont: "Lora" }).success).toBe(true);
        expect(updateEventSchema.safeParse({ inviteFont: "Comic Sans MS" }).success).toBe(false);
    });
    it("updateEvent accetta theme e inviteFont null (reset)", () => {
        expect(updateEventSchema.safeParse({ theme: null, inviteFont: null }).success).toBe(true);
    });
});
