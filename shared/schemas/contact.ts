import { z } from "zod";
import { emailField, nonEmptyString, languageFieldOptional } from "./common";

export const contactSchema = z.object({
    name: nonEmptyString,
    email: emailField,
    subject: nonEmptyString,
    message: nonEmptyString,
    language: languageFieldOptional,
});
export type ContactInput = z.infer<typeof contactSchema>;
