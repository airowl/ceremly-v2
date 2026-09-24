import type { FunctionReturnType } from "convex/server";
import type { api } from "~~/convex/_generated/api";
import { isoOrNull } from "~/composables/useEvents";
import type {
    AttendingStatus,
    PublicInvitePayload,
    RsvpAnswers,
} from "~~/shared/types/ceremly";

/**
 * Adattatori dell'invito pubblico (Task 14, part a), fuori da `usePublicInvite`
 * perché quel composable usa le global di Nuxt (`useAsyncData`, `ref`), che non
 * esistono nel progetto TypeScript dei test: qui restano funzioni pure,
 * verificabili senza un'app.
 */

export type PublicRsvpResponse = NonNullable<PublicInvitePayload["response"]>;

type ConvexPublicInvite = FunctionReturnType<typeof api.rsvp.publicInvite>;
type ConvexPreviewInvite = FunctionReturnType<typeof api.rsvp.previewInvite>;

/**
 * La risposta RSVP come la legge la pagina: `updatedAt` ISO.
 *
 * Accetta numero **o** stringa perché arriva da due strade durante il blue-green:
 * dal payload Convex (millisecondi) e dal bridge del submit, che con
 * `NUXT_PUBLIC_FORMS_BACKEND=legacy` risponde ancora dal service Drizzle (ISO).
 */
export function toPublicRsvpResponse(response: {
    attending: AttendingStatus;
    companionsCount: number;
    answers: unknown;
    declineMessage?: string | null;
    updatedAt?: number | string | null;
}): PublicRsvpResponse {
    const { updatedAt } = response;
    return {
        attending: response.attending,
        companionsCount: response.companionsCount,
        answers: (response.answers ?? {}) as RsvpAnswers,
        declineMessage: response.declineMessage ?? null,
        updatedAt: typeof updatedAt === "number" ? isoOrNull(updatedAt) : (updatedAt ?? null),
    };
}

/** Payload Convex (millisecondi) → payload della pagina (ISO), campo per campo. */
export function toPublicInvitePayload(
    result: ConvexPublicInvite | ConvexPreviewInvite,
): PublicInvitePayload {
    const { event } = result;
    return {
        event: {
            title: event.title,
            type: event.type,
            templateKey: event.templateKey,
            theme: event.theme,
            inviteFont: event.inviteFont,
            eventDate: isoOrNull(event.eventDate),
            eventTime: event.eventTime,
            blocks: event.blocks,
            rsvpConfig: event.rsvpConfig,
            rsvpDeadline: isoOrNull(event.rsvpDeadline),
            rsvpClosedMessage: event.rsvpClosedMessage,
            slug: event.slug,
        },
        guest: result.guest,
        response: result.response ? toPublicRsvpResponse(result.response) : null,
        deadlinePassed: result.deadlinePassed,
        ...("preview" in result && result.preview ? { preview: true } : {}),
    };
}
