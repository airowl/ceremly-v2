import { z } from "zod";
import { emailField, languageField } from "./common";

export const waitingListSubscribeSchema = z.object({
    email: emailField,
    language: languageField,
    // Anti-spam fields
    website: z.string().optional(),
    _t: z.number().optional(),
    // Analytics tracking
    source: z.string().optional(),
    utmSource: z.string().optional(),
    utmMedium: z.string().optional(),
    utmCampaign: z.string().optional(),
});
export type WaitingListSubscribeInput = z.infer<typeof waitingListSubscribeSchema>;
