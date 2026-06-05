import { z } from "zod";
import { languageFieldOptional } from "./common";

export const updateProfileSchema = z.object({
    fullName: z.string().min(1).max(100).optional(),
    phone: z.string().max(30).nullable().optional(),
    bio: z.string().max(500).nullable().optional(),
    locale: languageFieldOptional,
    timezone: z.string().max(50).nullable().optional(),
    image: z.string().url().nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
