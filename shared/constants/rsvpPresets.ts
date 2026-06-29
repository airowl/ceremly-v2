/**
 * RSVP question presets per event type (SPEC §4, from PRD 5.8).
 *
 * Reserved ids: 'attendance' (always index 0, locked), 'companions_count'
 * (feeds companionsCount and the perPerson replica), 'companion_names'
 * (perPerson scope 'companions'). Conditions on 'attendance' use the canonical
 * values 'yes'|'no'|'maybe' (positional mapping, NOT the labels).
 *
 * Presets are deep-cloned on event creation: the readable static ids (q_*)
 * are intentional, conditions reference them.
 */
import type { EventTypeKey, RsvpCondition, RsvpQuestion } from "../types/ceremly";

const ifAttending = (): RsvpCondition => ({ questionId: "attendance", op: "eq", value: "yes" });

/** Fixed base question (index 0 of every config): not deletable, fixed type. */
function attendance(): RsvpQuestion {
    return {
        id: "attendance",
        label: "Partecipi?",
        type: "single",
        options: ["Sì, ci sarò", "No, mi dispiace", "Non ancora sicuro"],
        required: true,
        perPerson: false,
        locked: true,
    };
}

function companionsCount(): RsvpQuestion {
    return {
        id: "companions_count",
        label: "Quanti accompagnatori?",
        description: "Oltre a te",
        type: "number",
        min: 0,
        max: 4,
        required: true,
        perPerson: false,
        condition: ifAttending(),
    };
}

function companionNames(): RsvpQuestion {
    return {
        id: "companion_names",
        label: "Nome accompagnatore",
        description: "Ci serve per segnaposti e conteggi",
        type: "text",
        required: true,
        perPerson: true,
        perPersonScope: "companions",
        condition: { questionId: "companions_count", op: "gt", value: 0 },
    };
}

export const RSVP_PRESETS: Record<EventTypeKey, RsvpQuestion[]> = {
    matrimonio: [
        attendance(),
        {
            id: "q_participation",
            label: "A cosa partecipi?",
            type: "multiple",
            options: ["Cerimonia", "Ricevimento"],
            required: true,
            perPerson: false,
            condition: ifAttending(),
        },
        companionsCount(),
        companionNames(),
        {
            id: "q_menu",
            label: "Preferenza menu",
            type: "single",
            options: ["Carne", "Pesce", "Vegetariano", "Vegano"],
            required: true,
            perPerson: true,
            perPersonScope: "all",
            condition: ifAttending(),
        },
        {
            id: "q_allergies",
            label: "Allergie o intolleranze",
            type: "text",
            required: false,
            perPerson: true,
            perPersonScope: "all",
            condition: ifAttending(),
        },
        {
            id: "q_accommodation",
            label: "Hai bisogno di alloggio?",
            type: "boolean",
            required: false,
            perPerson: false,
            condition: ifAttending(),
        },
        {
            id: "q_song",
            label: "Una canzone che non può mancare",
            type: "text",
            required: false,
            perPerson: false,
        },
        {
            id: "q_message",
            label: "Un messaggio per gli sposi",
            type: "text",
            required: false,
            perPerson: false,
        },
    ],

    laurea: [
        attendance(),
        {
            id: "q_participation",
            label: "A cosa partecipi?",
            type: "multiple",
            options: ["Cerimonia", "Rinfresco"],
            required: true,
            perPerson: false,
            condition: ifAttending(),
        },
        companionsCount(),
        companionNames(),
        {
            id: "q_allergies",
            label: "Allergie alimentari",
            type: "text",
            required: false,
            perPerson: true,
            perPersonScope: "all",
            condition: ifAttending(),
        },
        {
            id: "q_message",
            label: "Messaggio di auguri",
            type: "text",
            required: false,
            perPerson: false,
        },
    ],

    compleanno: [
        attendance(),
        companionsCount(),
        companionNames(),
        {
            id: "q_allergies",
            label: "Allergie alimentari",
            type: "text",
            required: false,
            perPerson: false,
            condition: ifAttending(),
        },
        {
            id: "q_child_name",
            label: "Nome del bambino partecipante",
            type: "text",
            required: false,
            perPerson: false,
            condition: ifAttending(),
        },
        {
            id: "q_parent_contact",
            label: "Contatto genitore per emergenze",
            type: "text",
            required: false,
            perPerson: false,
            condition: ifAttending(),
        },
    ],

    battesimo: [
        attendance(),
        {
            id: "q_participation",
            label: "A cosa partecipi?",
            type: "multiple",
            options: ["Cerimonia", "Rinfresco"],
            required: true,
            perPerson: false,
            condition: ifAttending(),
        },
        companionsCount(),
        companionNames(),
        {
            id: "q_allergies",
            label: "Allergie alimentari",
            type: "text",
            required: false,
            perPerson: true,
            perPersonScope: "all",
            condition: ifAttending(),
        },
        {
            id: "q_message",
            label: "Messaggio per la famiglia",
            type: "text",
            required: false,
            perPerson: false,
        },
    ],
};
