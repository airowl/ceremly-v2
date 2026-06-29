/**
 * usePublicInvite — public guest page (/e/:slug/:token).
 *
 * Typed wrappers in useProjects style for contracts §6.2:
 * - GET  /api/public/invite/:token       → PublicInvitePayload (useFetch, SSR)
 * - POST /api/public/invite/:token/rsvp  → { response } | 410 | 422
 *
 * No auth: the opaque token is the sole authority. The submit normalises
 * HTTP errors into a discriminated result so the page doesn't parse FetchError.
 */
import type {
    AttendingStatus,
    PublicInvitePayload,
    RsvpAnswers,
} from "~~/shared/types/ceremly";

export type PublicRsvpResponse = NonNullable<PublicInvitePayload["response"]>;

export interface PublicRsvpPayload {
    attending: AttendingStatus;
    companionsCount: number;
    answers: RsvpAnswers;
    declineMessage: string | null;
}

/** Normalised RSVP submit result (discriminated on `kind`). */
export type SubmitRsvpResult =
    | { ok: true; response: PublicRsvpResponse }
    /** 410: deadline passed or event closed — message = rsvpClosedMessage. */
    | { ok: false; kind: "closed"; message: string }
    /** 422: validation errors (Italian, displayable to the guest). */
    | { ok: false; kind: "validation"; errors: string[] }
    | { ok: false; kind: "error"; message: string };

export function usePublicInvite() {
    const isSubmitting = ref(false);

    /** SSR fetch of the invite: call with await in the page setup. */
    function fetchInvite(token: string) {
        return useFetch<PublicInvitePayload>(
            `/api/public/invite/${encodeURIComponent(token)}`,
            { key: `public-invite-${token}` },
        );
    }

    /**
     * SSR fetch of the signed preview (token "preview"): slug + sig from the query.
     * Same shape as fetchInvite, with `preview: true` in the payload.
     */
    function fetchPreview(slug: string, sig: string) {
        return useFetch<PublicInvitePayload>(
            "/api/public/preview",
            { query: { slug, sig }, key: `public-preview-${slug}` },
        );
    }

    async function submitRsvp(
        token: string,
        payload: PublicRsvpPayload,
    ): Promise<SubmitRsvpResult> {
        isSubmitting.value = true;
        try {
            const res = await $fetch<{ response: PublicRsvpResponse }>(
                `/api/public/invite/${encodeURIComponent(token)}/rsvp`,
                { method: "POST", body: payload },
            );
            return { ok: true, response: res.response };
        } catch (e) {
            const err = e as {
                statusCode?: number;
                status?: number;
                data?: { statusMessage?: string; data?: { rsvpClosedMessage?: string; errors?: unknown } };
            };
            const status = err.statusCode ?? err.status ?? 500;
            // createError({ data }) arrives in the body as `data.data`.
            const detail = err.data?.data ?? {};
            if (status === 410) {
                return {
                    ok: false,
                    kind: "closed",
                    message:
                        detail.rsvpClosedMessage
                        || err.data?.statusMessage
                        || "Le risposte a questo invito sono chiuse.",
                };
            }
            if (status === 422) {
                const errors = Array.isArray(detail.errors) && detail.errors.length
                    ? (detail.errors as string[])
                    : [err.data?.statusMessage || "Risposta non valida. Controlla i campi e riprova."];
                return { ok: false, kind: "validation", errors };
            }
            return {
                ok: false,
                kind: "error",
                message:
                    err.data?.statusMessage
                    || "Si è verificato un errore. Riprova tra qualche istante.",
            };
        } finally {
            isSubmitting.value = false;
        }
    }

    return { isSubmitting, fetchInvite, fetchPreview, submitRsvp };
}
