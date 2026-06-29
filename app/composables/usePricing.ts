/**
 * usePricing — Ceremly 3-tier model (Free / Celebration / Atelier).
 * Labels/features live in i18n (ceremly.home.pricing.*); limit numbers
 * come from CEREMLY_TIER_LIMITS. No monthly/annual toggle.
 */
import {
    CEREMLY_TIER_LIMITS,
    CELEBRATION_PRICE_CENTS,
    ATELIER_PRICE_CENTS,
    type CeremlyTier,
} from "~~/shared/constants/pricing";

export interface CeremlyTierView {
    id: CeremlyTier;
    /** Price in EUR cents; 0 for Free. */
    priceCents: number;
    /** 'free' | 'once' (Celebration) | 'month' (Atelier). */
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

/** True if a limit is unlimited (-1). */
export const isUnlimited = (value: number): boolean => value === -1;

/** Formats a limit for display (-1 → "unlimited" text). */
export const formatLimit = (value: number, unlimitedText = "Illimitati"): string =>
    isUnlimited(value) ? unlimitedText : value.toString();
