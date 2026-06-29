import { z } from "zod";
import { emailField, nonEmptyString, languageFieldOptional } from "./common";

export const contactSchema = z.object({
    name: nonEmptyString,
    email: emailField,
    subject: nonEmptyString,
    message: nonEmptyString,
    language: languageFieldOptional,
    // Anti-spam (#8): honeypot (hidden field, must remain empty) + form render
    // timestamp (submit too fast = bot). Both optional.
    website: z.string().optional(),
    _t: z.number().optional(),
});
export type ContactInput = z.infer<typeof contactSchema>;
