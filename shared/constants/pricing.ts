/**
 * Modello pricing Ceremly — Free / Celebrazione / Atelier.
 * Usato sia dal frontend (usePricing) sia dal backend (eventAccess.service).
 *
 * - Free / Celebration sono stati PER-EVENTO (campo events.tier).
 * - Atelier è una proprietà dell'org/owner (subscription ricorrente attiva),
 *   risolta a runtime da isOrgAtelier via getPlanFromProductId.
 */

/** Check if a limit value means unlimited (sentinella -1, model-agnostic). */
export function isUnlimited(value: number): boolean {
    return value === -1;
}

/** Check if usage exceeds limit (respects unlimited). */
export function exceedsLimit(usage: number, limit: number): boolean {
    if (isUnlimited(limit)) return false;
    return usage >= limit;
}

/**
 * I tre tier di Ceremly.
 * - 'free'/'celebration' sono stati PER-EVENTO (campo events.tier).
 * - 'atelier' NON è un valore di events.tier: è una proprietà dell'org/owner
 *   (subscription ricorrente attiva), risolta a runtime.
 */
export type CeremlyTier = 'free' | 'celebration' | 'atelier';

/**
 * Limiti per tier. `-1` = illimitato.
 *
 * SCOPE MISTO: `maxGuestsPerEvent`/`maxReminders` sono PER-EVENTO (dipendono dal
 * tier dell'evento). `maxActiveEvents` è PER-ORG e ha senso solo per i tier che
 * descrivono un'organizzazione: Free (1) e Atelier (∞). 'celebration' NON è un
 * tier org — è lo stato di un singolo evento — quindi il suo `maxActiveEvents`
 * (-1) è un PLACEHOLDER non usato dall'enforcement: il conteggio eventi guarda
 * se l'ORG è Free o Atelier (vedi countActiveEventsByOrg + isOrgAtelier).
 */
export const CEREMLY_TIER_LIMITS: Record<
    CeremlyTier,
    { maxGuestsPerEvent: number; maxActiveEvents: number; maxReminders: number; unlimited: boolean }
> = {
    free: { maxGuestsPerEvent: 30, maxActiveEvents: 1, maxReminders: 3, unlimited: false },
    celebration: { maxGuestsPerEvent: 250, maxActiveEvents: -1, maxReminders: 3, unlimited: false },
    atelier: { maxGuestsPerEvent: -1, maxActiveEvents: -1, maxReminders: -1, unlimited: true },
};

/** Prezzo Celebrazione (one-time, centesimi EUR). */
export const CELEBRATION_PRICE_CENTS = 3900;
/** Prezzo Atelier (recurring mensile, centesimi EUR). */
export const ATELIER_PRICE_CENTS = 2400;

/**
 * Piani che descrivono un'ORGANIZZAZIONE. 'celebration' è lo stato di un singolo
 * evento e non compare qui: è la distinzione che regge il billing org-scoped
 * (Task 6 della migrazione, `convex/billing.ts`).
 */
export const CEREMLY_ORG_PLANS = ["free", "atelier"] as const;
export type CeremlyOrgPlan = (typeof CEREMLY_ORG_PLANS)[number];

/**
 * Nomi delle env che espongono i product ID Creem.
 *
 * Due famiglie, per costruzione: `NUXT_CREEM_PRODUCT_ID_*` è la configurazione
 * del deployment Nuxt/Vercel legacy, `CREEM_PRODUCT_ID_*` è quella delle funzioni
 * Convex (che non leggono mai `NUXT_*`). Gli script di migrazione e
 * riconciliazione leggono entrambe da qui, così i due mondi non divergono in
 * silenzio.
 */
export const CREEM_PRODUCT_ENV = {
    legacy: {
        celebration: "NUXT_CREEM_PRODUCT_ID_CELEBRATION",
        atelier: "NUXT_CREEM_PRODUCT_ID_ATELIER",
    },
    convex: {
        celebration: "CREEM_PRODUCT_ID_CELEBRATION",
        atelier: "CREEM_PRODUCT_ID_ATELIER",
    },
} as const;

export type CeremlyPaidTier = keyof typeof CREEM_PRODUCT_ENV.convex;
