/**
 * Event types supported by Ceremly (SPEC §4).
 * `icon` is the key for CerIcon.vue; `desc` appears in the creation wizard.
 */
import type { EventTypeKey } from "../types/ceremly";

export type { EventTypeKey } from "../types/ceremly";

export interface EventTypeDef {
    key: EventTypeKey;
    label: string;
    icon: string;
    desc: string;
}

export const EVENT_TYPES = [
    { key: "matrimonio", label: "Matrimonio", icon: "ring", desc: "Cerimonia + ricevimento, menu, alloggio" },
    { key: "laurea", label: "Laurea", icon: "cap", desc: "Cerimonia in ateneo + rinfresco" },
    { key: "battesimo", label: "Battesimo", icon: "cross", desc: "Chiesa, padrini, rinfresco" },
    { key: "compleanno", label: "Compleanno", icon: "cake", desc: "Festa, dress code, regali" },
] as const satisfies readonly EventTypeDef[];

/** Human-readable label for an event type (fallback: the key itself). */
export function getEventTypeLabel(key: EventTypeKey): string {
    return EVENT_TYPES.find((t) => t.key === key)?.label ?? key;
}
