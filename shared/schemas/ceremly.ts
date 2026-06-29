/**
 * Ceremly Zod schemas (SPEC §5). Shapes aligned with shared/types/ceremly.ts:
 * the types remain the documentation, these schemas are the runtime validation
 * (parseBody/parseQueryParams in routes).
 */
import { z } from "zod";
import { isCatalogFont } from "../constants/inviteTheme";
import { nonEmptyString } from "./common";

export const eventTypeEnum = z.enum(["matrimonio", "laurea", "compleanno", "battesimo"]);
export const eventStatusEnum = z.enum(["draft", "active", "closed"]);
export const attendingEnum = z.enum(["yes", "no", "maybe"]);

export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colore non valido (atteso #rrggbb)");
export const themeSchema = z.object({
    paper: hexColorSchema,
    accent: hexColorSchema,
    deep: hexColorSchema,
    onAccent: hexColorSchema,
});

/** Optional email: also accepts an empty string (form/CSV), the service normalises it to null. */
const optionalEmail = z.union([z.string().email(), z.literal("")]).optional();

// ---------------------------------------------------------------------------
// Invite blocks (§3.1) — discriminated union on `type`
// ---------------------------------------------------------------------------

const programItemSchema = z.object({
    time: z.string().max(40),
    label: z.string().max(120),
    description: z.string().max(300),
});

export const blockSchema = z.discriminatedUnion("type", [
    z.object({
        id: nonEmptyString,
        type: z.literal("header"),
        data: z.object({
            eyebrow: z.string().max(120),
            intro: z.string().max(300),
            names: z.array(z.string().max(80)).min(1).max(4),
            dateText: z.string().max(120),
            timeText: z.string().max(40),
        }),
    }),
    z.object({
        id: nonEmptyString,
        type: z.literal("message"),
        data: z.object({ text: z.string().max(2000) }),
    }),
    z.object({
        id: nonEmptyString,
        type: z.literal("program"),
        data: z.object({
            title: z.string().max(120),
            items: z.array(programItemSchema).max(20),
        }),
    }),
    z.object({
        id: nonEmptyString,
        type: z.literal("location"),
        data: z.object({
            title: z.string().max(120),
            name: z.string().max(200),
            address: z.string().max(300),
            showMap: z.boolean(),
            // Only http(s) or empty: blocks dangerous schemes (javascript:, data:)
            // that would be rendered in :href on the public invite page (XSS on
            // click). z.url() alone is NOT enough: it accepts javascript: as a valid URL.
            mapsUrl: z.string().max(1000).refine(
                (v) => v.trim() === "" || /^https?:\/\//i.test(v.trim()),
                { message: "L'URL della mappa deve iniziare con http:// o https://" },
            ),
        }),
    }),
    z.object({
        id: nonEmptyString,
        type: z.literal("dresscode"),
        data: z.object({
            title: z.string().max(120),
            headline: z.string().max(200),
            note: z.string().max(300),
        }),
    }),
    z.object({
        id: nonEmptyString,
        type: z.literal("logistics"),
        data: z.object({
            title: z.string().max(120),
            text: z.string().max(2000),
        }),
    }),
    z.object({
        id: nonEmptyString,
        type: z.literal("countdown"),
        data: z.object({ title: z.string().max(120) }),
    }),
    z.object({
        id: nonEmptyString,
        type: z.literal("gallery"),
        data: z.object({
            images: z.array(z.object({
                url: z.string().max(1000),
                alt: z.string().max(200),
            })).max(5),
        }),
    }),
    z.object({
        id: nonEmptyString,
        type: z.literal("rsvp"),
        data: z.object({ buttonLabel: nonEmptyString.max(80) }),
    }),
]);
export type BlockInput = z.infer<typeof blockSchema>;

// ---------------------------------------------------------------------------
// RSVP questions (§3.2)
// ---------------------------------------------------------------------------

export const rsvpQuestionTypeEnum = z.enum(["text", "single", "multiple", "number", "boolean"]);
export const rsvpConditionOpEnum = z.enum(["eq", "neq", "gt"]);

export const rsvpConditionSchema = z.object({
    questionId: nonEmptyString,
    op: rsvpConditionOpEnum,
    value: z.union([z.string(), z.number()]),
});

export const rsvpQuestionSchema = z
    .object({
        id: nonEmptyString,
        label: nonEmptyString.max(200),
        description: z.string().max(500).optional(),
        type: rsvpQuestionTypeEnum,
        options: z.array(nonEmptyString.max(120)).max(20).optional(),
        min: z.number().int().min(0).optional(),
        max: z.number().int().min(0).optional(),
        required: z.boolean(),
        perPerson: z.boolean(),
        perPersonScope: z.enum(["all", "companions"]).optional(),
        condition: rsvpConditionSchema.nullish(),
        locked: z.boolean().optional(),
    })
    .superRefine((q, ctx) => {
        if ((q.type === "single" || q.type === "multiple") && (!q.options || q.options.length === 0)) {
            ctx.addIssue({
                code: "custom",
                path: ["options"],
                message: "Le domande a scelta richiedono almeno un'opzione",
            });
        }
    });
export type RsvpQuestionInput = z.infer<typeof rsvpQuestionSchema>;

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export const distributionSchema = z.object({
    emailSubject: z.string().max(200),
    emailBody: z.string().max(5000),
    whatsappTemplate: z.string().max(2000),
    senderName: z.string().max(120),
});
export type DistributionInput = z.infer<typeof distributionSchema>;

export const createEventSchema = z.object({
    type: eventTypeEnum,
    templateKey: nonEmptyString,
    title: nonEmptyString.max(120),
    eventDate: z.coerce.date().optional(),
    eventTime: z.string().max(20).optional(),
    locationName: z.string().max(200).optional(),
    locationAddress: z.string().max(300).optional(),
});
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = z.object({
    title: nonEmptyString.max(120).optional(),
    eventDate: z.coerce.date().nullish(),
    eventTime: z.string().max(20).nullish(),
    locationName: z.string().max(200).nullish(),
    locationAddress: z.string().max(300).nullish(),
    status: eventStatusEnum.optional(),
    theme: themeSchema.nullish(),
    inviteFont: z.string().max(80).refine(isCatalogFont, "Font non in catalogo").nullish(),
    blocks: z.array(blockSchema).max(50).optional(),
    rsvpConfig: z.array(rsvpQuestionSchema).max(30).optional(),
    rsvpDeadline: z.coerce.date().nullish(),
    rsvpClosedMessage: z.string().max(500).nullish(),
    distribution: distributionSchema.optional(),
});
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

// ---------------------------------------------------------------------------
// Guests
// ---------------------------------------------------------------------------

export const createGuestSchema = z.object({
    firstName: nonEmptyString.max(80),
    lastName: nonEmptyString.max(80),
    email: optionalEmail,
    phone: z.string().max(40).optional(),
    groupName: z.string().max(80).optional(),
    notes: z.string().max(1000).optional(),
});
export type CreateGuestInput = z.infer<typeof createGuestSchema>;

export const updateGuestSchema = z.object({
    firstName: nonEmptyString.max(80).optional(),
    lastName: nonEmptyString.max(80).optional(),
    email: z.union([z.string().email(), z.literal("")]).nullish(),
    phone: z.string().max(40).nullish(),
    groupName: z.string().max(80).nullish(),
    notes: z.string().max(1000).nullish(),
    remindersDisabled: z.boolean().optional(),
});
export type UpdateGuestInput = z.infer<typeof updateGuestSchema>;

export const importGuestsSchema = z.object({
    rows: z.array(createGuestSchema).min(1).max(500),
});
export type ImportGuestsInput = z.infer<typeof importGuestsSchema>;

// ---------------------------------------------------------------------------
// Distribution and public RSVP
// ---------------------------------------------------------------------------

export const sendInvitesSchema = z.object({
    guestIds: z.array(nonEmptyString).min(1).max(200),
    subject: nonEmptyString.max(200),
    body: nonEmptyString.max(5000),
});
export type SendInvitesInput = z.infer<typeof sendInvitesSchema>;

/** Body of POST /api/events/:id/mark-sent (WhatsApp "Copy" button). */
export const markSentSchema = z.object({
    guestIds: z.array(nonEmptyString).min(1).max(500),
});
export type MarkSentInput = z.infer<typeof markSentSchema>;

/**
 * OPTIONAL body of POST /api/events/:id/send-test: subject/body override
 * for the preview. `.default({})` also accepts requests with no body.
 */
export const sendTestSchema = z.object({
    subject: nonEmptyString.max(200).optional(),
    body: nonEmptyString.max(5000).optional(),
}).default({});
export type SendTestInput = z.infer<typeof sendTestSchema>;

/** Body of POST /api/public/invite/:token/rsvp; `answers` is then validated by validateRsvpSubmission. */
export const publicRsvpSchema = z.object({
    attending: attendingEnum,
    companionsCount: z.number().int().min(0).max(10).default(0),
    answers: z.record(z.string(), z.unknown()).default({}),
    // `.nullish()`: the client (RsvpFormRenderer) always emits the key, with
    // null for attending != 'no'; the service normalises it to null regardless.
    declineMessage: z.string().max(1000).nullish(),
});
export type PublicRsvpInput = z.infer<typeof publicRsvpSchema>;

/** Query for GET /api/public/preview: slug + HMAC signature (invite preview). */
export const previewQuerySchema = z.object({
    slug: z.string().min(1).max(200),
    sig: z.string().min(1).max(200),
});
export type PreviewQueryInput = z.infer<typeof previewQuerySchema>;

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

export const remindersSchema = z.object({
    reminders: z.array(z.object({
        id: z.string().optional(),
        daysBefore: z.number().int().min(1).max(60),
        subject: nonEmptyString.max(200),
        message: nonEmptyString.max(2000),
        enabled: z.boolean(),
    })).max(3),
});
export type RemindersInput = z.infer<typeof remindersSchema>;
