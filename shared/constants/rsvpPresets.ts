/**
 * Preset domande RSVP per tipo evento (SPEC §4, da PRD 5.8).
 *
 * Id riservati: 'attendance' (sempre indice 0, locked), 'companions_count'
 * (alimenta companionsCount e la replica perPerson), 'companion_names'
 * (perPerson scope 'companions'). Le condition su 'attendance' usano i valori
 * canonici 'yes'|'no'|'maybe' (mapping posizionale, NON le label).
 *
 * I preset vengono deep-clonati alla creazione evento: gli id statici
 * leggibili (q_*) sono voluti, le condition li referenziano.
 */
import type { EventTypeKey, RsvpCondition, RsvpQuestion } from "../types/ceremly";

const ifAttending = (): RsvpCondition => ({ questionId: "attendance", op: "eq", value: "yes" });

/** Domanda base fissa (indice 0 di ogni config): non eliminabile, tipo fisso. */
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
