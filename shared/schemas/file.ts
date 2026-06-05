import { z } from "zod";
import { nonEmptyString } from "./common";

export const filePresignSchema = z.object({
    fileName: nonEmptyString,
    mimeType: nonEmptyString,
    fileSize: z.number().int().positive(),
});
export type FilePresignInput = z.infer<typeof filePresignSchema>;

export const fileConfirmSchema = z.object({
    fileId: nonEmptyString,
});
export type FileConfirmInput = z.infer<typeof fileConfirmSchema>;
