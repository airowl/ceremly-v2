/**
 * usePublicInvite — pagina pubblica ospite (/e/:slug/:token), Task 14 part a.
 *
 * Tre operazioni, tre trasporti, e ognuno ha una ragione:
 *
 * - **apertura dell'invito** → `api.rsvp.publicInvite` via il client **HTTP** di
 *   Convex, dentro `useAsyncData`. È una *mutation* (conta l'apertura: `openCount`,
 *   `firstOpenedAt`, attività `link_opened`), e gira nel render server, perché
 *   l'HTML deve contenere l'anteprima OG che WhatsApp e Telegram leggono. Il
 *   server ha solo il client HTTP (`app/plugins/convex.server.ts`: niente
 *   websocket in un Worker); il browser idrata dal payload e non la richiama, quindi
 *   un'apertura conta una volta, come nel legacy.
 * - **anteprima firmata** → `api.rsvp.previewInvite`, stesso client HTTP: è una
 *   lettura pubblica senza sessione, e un'anteprima non ha niente da tenere vivo.
 * - **submit RSVP** → resta sul bridge anonimo del Worker
 *   (`POST /api/public/invite/:token/rsvp`, Task 12): è lì che l'IP diventa un
 *   digest firmato per il rate limit, e Convex non vede mai l'indirizzo.
 *
 * Nessuna auth: il token opaco (o la firma dell'anteprima) è l'unica autorità.
 * Il submit normalizza gli errori HTTP in un esito discriminato così la pagina non
 * parsa FetchError.
 */
import { useConvexHttpClient } from "convex-vue";
import { api } from "~~/convex/_generated/api";
import {
    toPublicInvitePayload,
    toPublicRsvpResponse,
    type PublicRsvpResponse,
} from "~/lib/publicInvite";
import type {
    AttendingStatus,
    PublicInvitePayload,
    RsvpAnswers,
} from "~~/shared/types/ceremly";

export type { PublicRsvpResponse };

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
    // Preso in setup: `inject` non risolve dentro il callback di `useAsyncData`.
    const convex = useConvexHttpClient();

    /** Apertura SSR dell'invito: da chiamare con await nel setup della pagina. */
    function fetchInvite(token: string) {
        return useAsyncData<PublicInvitePayload>(
            `public-invite-${token}`,
            async () => toPublicInvitePayload(await convex.mutation(api.rsvp.publicInvite, { token })),
        );
    }

    /**
     * Anteprima firmata (token "preview"): slug + sig dalla query.
     * Stessa shape di fetchInvite, con `preview: true` nel payload.
     */
    function fetchPreview(slug: string, sig: string) {
        return useAsyncData<PublicInvitePayload>(
            `public-preview-${slug}`,
            async () => toPublicInvitePayload(await convex.query(api.rsvp.previewInvite, { slug, sig })),
        );
    }

    async function submitRsvp(
        token: string,
        payload: PublicRsvpPayload,
    ): Promise<SubmitRsvpResult> {
        isSubmitting.value = true;
        try {
            const res = await $fetch<{ response: Parameters<typeof toPublicRsvpResponse>[0] }>(
                `/api/public/invite/${encodeURIComponent(token)}/rsvp`,
                { method: "POST", body: payload },
            );
            return { ok: true, response: toPublicRsvpResponse(res.response) };
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

    return { isSubmitting, fetchInvite, fetchPreview, submitRsvp };
}
