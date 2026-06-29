import { z } from "zod";
import { SITE_MODES } from "../constants/siteMode";

/** Body of the admin endpoint for setting the runtime site-mode override. */
export const setSiteModeSchema = z.object({
    mode: z.enum(SITE_MODES),
});

export type SetSiteModeInput = z.infer<typeof setSiteModeSchema>;
