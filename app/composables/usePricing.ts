/**
 * usePricing — modello Ceremly a 3 tier (Free / Celebrazione / Atelier).
 * Le label/feature vivono in i18n (ceremly.home.pricing.*); i numeri di limite
 * arrivano da CEREMLY_TIER_LIMITS. Niente toggle mensile/annuale.
 */
import {
    CEREMLY_TIER_LIMITS,
    CELEBRATION_PRICE_CENTS,
    ATELIER_PRICE_CENTS,
    type CeremlyTier,
} from "~~/shared/constants/pricing";

export interface CeremlyTierView {
    id: CeremlyTier;
    /** Prezzo in centesimi EUR; 0 per Free. */
    priceCents: number;
    /** 'free' | 'once' (Celebrazione) | 'month' (Atelier). */
    billing: "free" | "once" | "month";
    maxGuestsPerEvent: number;
    maxActiveEvents: number;
    maxReminders: number;
    unlimited: boolean;
}

const TIERS: CeremlyTierView[] = [
    { id: "free", priceCents: 0, billing: "free", ...CEREMLY_TIER_LIMITS.free },
    { id: "celebration", priceCents: CELEBRATION_PRICE_CENTS, billing: "once", ...CEREMLY_TIER_LIMITS.celebration },
    { id: "atelier", priceCents: ATELIER_PRICE_CENTS, billing: "month", ...CEREMLY_TIER_LIMITS.atelier },
];

export const usePricing = () => {
    const tiers = shallowRef<CeremlyTierView[]>(TIERS);
    const getTier = (id: CeremlyTier): CeremlyTierView | undefined => TIERS.find(t => t.id === id);
    return { tiers, getTier };
};

/** True se un limite è illimitato (-1). */
export const isUnlimited = (value: number): boolean => value === -1;

/** Formatta un limite per display (-1 → testo "illimitati"). */
export const formatLimit = (value: number, unlimitedText = "Illimitati"): string =>
    isUnlimited(value) ? unlimitedText : value.toString();
