import { z } from "zod";
import { nonEmptyString, slugField } from "./common";

export const createOrganizationSchema = z.object({
    name: nonEmptyString.max(200),
    slug: slugField.optional(),
    logo: z.string().url().optional(),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z.object({
    name: nonEmptyString.max(200).optional(),
    slug: slugField.optional(),
    logo: z.string().url().nullish(),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
