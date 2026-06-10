import { z } from "zod";

export const validateDowngradeSchema = z.object({
    newPlan: z.enum(["starter", "premium", "agency"]),
});
export type ValidateDowngradeInput = z.infer<typeof validateDowngradeSchema>;
