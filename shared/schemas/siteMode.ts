import { z } from "zod";
import { SITE_MODES } from "../constants/siteMode";

/** Body dell'endpoint admin per impostare l'override runtime del site mode. */
export const setSiteModeSchema = z.object({
    mode: z.enum(SITE_MODES),
});

export type SetSiteModeInput = z.infer<typeof setSiteModeSchema>;
