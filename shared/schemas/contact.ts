import { z } from "zod";
import { emailField, nonEmptyString, languageFieldOptional } from "./common";

export const contactSchema = z.object({
    name: nonEmptyString,
    email: emailField,
    subject: nonEmptyString,
    message: nonEmptyString,
    language: languageFieldOptional,
    // Anti-spam (#8): honeypot (campo nascosto, deve restare vuoto) + timestamp
    // di rendering del form (submit troppo rapido = bot). Opzionali.
    website: z.string().optional(),
    _t: z.number().optional(),
});
export type ContactInput = z.infer<typeof contactSchema>;
