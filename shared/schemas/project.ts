import { z } from "zod";
import { nonEmptyString } from "./common";

export const projectStatusEnum = z.enum(["active", "archived"]);
export type ProjectStatus = z.infer<typeof projectStatusEnum>;

export const createProjectSchema = z.object({
    name: nonEmptyString.max(200),
    description: z.string().max(2000).nullish(),
    status: projectStatusEnum.default("active"),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
    name: nonEmptyString.max(200).optional(),
    description: z.string().max(2000).nullish(),
    status: projectStatusEnum.optional(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
