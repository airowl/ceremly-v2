/**
 * usePublicInvite — pagina pubblica ospite (/e/:slug/:token).
 *
 * Wrapper tipizzati stile useProjects per i contratti §6.2:
 * - GET  /api/public/invite/:token       → PublicInvitePayload (useFetch, SSR)
 * - POST /api/public/invite/:token/rsvp  → { response } | 410 | 422
 *
 * Nessuna auth: il token opaco è l'unica autorità. Il submit normalizza gli
 * errori HTTP in un esito discriminato così la pagina non parsa FetchError.
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

/** Esito normalizzato del submit RSVP (discriminato su `kind`). */
export type SubmitRsvpResult =
    | { ok: true; response: PublicRsvpResponse }
    /** 410: deadline passata o evento chiuso — message = rsvpClosedMessage. */
    | { ok: false; kind: "closed"; message: string }
    /** 422: errori di validazione (italiani, mostrabili all'ospite). */
    | { ok: false; kind: "validation"; errors: string[] }
    | { ok: false; kind: "error"; message: string };

export function usePublicInvite() {
    const isSubmitting = ref(false);

    /** Fetch SSR dell'invito: da chiamare con await nel setup della pagina. */
    function fetchInvite(token: string) {
        return useFetch<PublicInvitePayload>(
            `/api/public/invite/${encodeURIComponent(token)}`,
            { key: `public-invite-${token}` },
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
            // createError({ data }) arriva nel body come `data.data`.
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

    return { isSubmitting, fetchInvite, submitRsvp };
}
