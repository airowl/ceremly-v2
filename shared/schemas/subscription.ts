import { z } from "zod";
import { nonEmptyString } from "./common";

export const validateDowngradeSchema = z.object({
    newPlan: nonEmptyString,
});
export type ValidateDowngradeInput = z.infer<typeof validateDowngradeSchema>;
