/**
 * Template invito Ceremly (SPEC §4): 13 template (4 matrimonio, 3 per gli altri tipi).
 *
 * I `defaultBlocks` sono contenuto di prodotto: testi placeholder italiani
 * completi e calibrati per tipo (elegante matrimonio, orgoglioso laurea,
 * formale battesimo, giocoso compleanno). Vengono deep-clonati alla creazione
 * evento (names/title/date sostituiti se forniti): gli id statici 'b_*' sono
 * voluti e restano stabili dopo il clone.
 */
import type { EventDistribution, EventTypeKey, InviteBlock } from "../types/ceremly";

export interface InviteTemplate {
    /** es. 'toscana' */
    key: string;
    eventType: EventTypeKey;
    /** es. 'Toscana' */
    name: string;
    /** es. 'romantico · floreale' */
    tone: string;
    /** Colore accento CSS (es. '#9D4E3C'). */
    accent: string;
    /** Tinta chiara dell'accento per sfondi. */
    accentSoft: string;
    /** Contenuto placeholder COMPLETO, tono calibrato al tipo (PRD 5.1). */
    defaultBlocks: InviteBlock[];
    /** Preset domande RSVP (RSVP_PRESETS). */
    rsvpPresetKey: EventTypeKey;
}

export const INVITE_TEMPLATES: InviteTemplate[] = [
    // ------------------------------------------------------------------ //
    // Matrimonio
    // ------------------------------------------------------------------ //
    {
        key: "toscana",
        eventType: "matrimonio",
        name: "Toscana",
        tone: "romantico · floreale",
        accent: "#9D4E3C",
        accentSoft: "#F3E2DD",
        rsvpPresetKey: "matrimonio",
        defaultBlocks: [
            {
                id: "b_header",
                type: "header",
                data: {
                    eyebrow: "Save the date",
                    intro: "con gioia annunciamo il matrimonio di",
                    names: ["Giulia", "Tommaso"],
                    dateText: "12 settembre 2026",
                    timeText: "16:00",
                },
            },
            {
                id: "b_message",
                type: "message",
                data: {
                    text: "Dopo anni a coltivare la stessa felicità, vogliamo celebrarla con le persone che l'hanno resa possibile. Ci siete tutti.",
                },
            },
            {
                id: "b_program",
                type: "program",
                data: {
                    title: "Il giorno",
                    items: [
                        { time: "16:00", label: "Cerimonia", description: "Pieve di Santa Maria, tra le colline" },
                        { time: "17:30", label: "Aperitivo", description: "nel giardino dei cipressi" },
                        { time: "19:30", label: "Cena", description: "lunga tavolata sotto il pergolato" },
                        { time: "22:00", label: "Festa", description: "fino a tarda notte" },
                    ],
                },
            },
            {
                id: "b_location",
                type: "location",
                data: {
                    title: "Dove",
                    name: "Villa delle Rose",
                    address: "Strada del Colle 12, San Gimignano (SI)",
                    showMap: true,
                    mapsUrl: "",
                },
            },
            {
                id: "b_dresscode",
                type: "dresscode",
                data: {
                    title: "Dress code",
                    headline: "Elegante in toni pastello",
                    note: "niente bianco · scarpe comode per il giardino",
                },
            },
            { id: "b_rsvp", type: "rsvp", data: { buttonLabel: "Rispondi all'invito" } },
        ],
    },
    {
        key: "minimale",
        eventType: "matrimonio",
        name: "Minimale",
        tone: "editoriale · serif",
        accent: "#3F3622",
        accentSoft: "#ECE7DA",
        rsvpPresetKey: "matrimonio",
        defaultBlocks: [
            {
                id: "b_header",
                type: "header",
                data: {
                    eyebrow: "Ci sposiamo",
                    intro: "due firme, una promessa: il matrimonio di",
                    names: ["Giulia", "Tommaso"],
                    dateText: "12 settembre 2026",
                    timeText: "15:30",
                },
            },
            {
                id: "b_message",
                type: "message",
                data: {
                    text: "Niente fronzoli, solo l'essenziale: noi due, le persone che amiamo e un sì da festeggiare. La tua presenza è il regalo più grande.",
                },
            },
            {
                id: "b_program",
                type: "program",
                data: {
                    title: "Programma",
                    items: [
                        { time: "15:30", label: "Cerimonia civile", description: "Sala degli Specchi, Palazzo Comunale" },
                        { time: "17:00", label: "Brindisi", description: "nel cortile d'onore" },
                        { time: "19:30", label: "Cena", description: "menu degustazione, posti assegnati" },
                        { time: "22:30", label: "Dopocena", description: "musica e conversazioni lente" },
                    ],
                },
            },
            {
                id: "b_location",
                type: "location",
                data: {
                    title: "Dove",
                    name: "Palazzo Comunale",
                    address: "Piazza Grande 1, Modena",
                    showMap: true,
                    mapsUrl: "",
                },
            },
            {
                id: "b_dresscode",
                type: "dresscode",
                data: {
                    title: "Dress code",
                    headline: "Eleganza essenziale",
                    note: "bianco e nero benvenuti · sobrio ma con carattere",
                },
            },
            { id: "b_rsvp", type: "rsvp", data: { buttonLabel: "Conferma la tua presenza" } },
        ],
    },
    {
        key: "giardino",
        eventType: "matrimonio",
        name: "Giardino",
        tone: "botanico · acquerello",
        accent: "#5A7A3A",
        accentSoft: "#E6EDDC",
        rsvpPresetKey: "matrimonio",
        defaultBlocks: [
            {
                id: "b_header",
                type: "header",
                data: {
                    eyebrow: "Il nostro sì",
                    intro: "tra fiori e ulivi celebreremo il matrimonio di",
                    names: ["Giulia", "Tommaso"],
                    dateText: "12 settembre 2026",
                    timeText: "16:30",
                },
            },
            {
                id: "b_message",
                type: "message",
                data: {
                    text: "Vi aspettiamo in giardino, dove tutto è cominciato: una lunga tavolata sotto gli alberi, le lucine accese e la gioia di avervi accanto nel giorno più bello.",
                },
            },
            {
                id: "b_program",
                type: "program",
                data: {
                    title: "Il giorno",
                    items: [
                        { time: "16:30", label: "Cerimonia", description: "sotto la quercia grande" },
                        { time: "18:00", label: "Aperitivo", description: "lungo il vialetto delle ortensie" },
                        { time: "20:00", label: "Cena", description: "tavolata in giardino" },
                        { time: "22:30", label: "Balli", description: "sotto le lucine, scalzi se volete" },
                    ],
                },
            },
            {
                id: "b_location",
                type: "location",
                data: {
                    title: "Dove",
                    name: "Tenuta La Pergola",
                    address: "Strada delle Vigne 8, Asti",
                    showMap: true,
                    mapsUrl: "",
                },
            },
            {
                id: "b_dresscode",
                type: "dresscode",
                data: {
                    title: "Dress code",
                    headline: "Garden chic",
                    note: "colori della natura benvenuti · tacchi sconsigliati sull'erba",
                },
            },
            { id: "b_rsvp", type: "rsvp", data: { buttonLabel: "Rispondi all'invito" } },
        ],
    },
    {
        key: "classico",
        eventType: "matrimonio",
        name: "Classico",
        tone: "elegante · oro",
        accent: "#B98A2F",
        accentSoft: "#F5EBD3",
        rsvpPresetKey: "matrimonio",
        defaultBlocks: [
            {
                id: "b_header",
                type: "header",
                data: {
                    eyebrow: "Partecipazione di nozze",
                    intro: "sono lieti di annunciare il loro matrimonio",
                    names: ["Giulia", "Tommaso"],
                    dateText: "12 settembre 2026",
                    timeText: "17:00",
                },
            },
            {
                id: "b_message",
                type: "message",
                data: {
                    text: "Con la benedizione delle nostre famiglie, uniremo le nostre vite in un giorno di grande festa. Saremmo onorati di avervi al nostro fianco per condividere questa gioia.",
                },
            },
            {
                id: "b_program",
                type: "program",
                data: {
                    title: "La celebrazione",
                    items: [
                        { time: "17:00", label: "Rito nuziale", description: "Cattedrale di San Martino" },
                        { time: "18:30", label: "Ricevimento", description: "nel salone degli affreschi" },
                        { time: "20:30", label: "Cena di gala", description: "servita ai tavoli, posti assegnati" },
                        { time: "23:00", label: "Primo ballo", description: "e brindisi di mezzanotte" },
                    ],
                },
            },
            {
                id: "b_location",
                type: "location",
                data: {
                    title: "Dove",
                    name: "Palazzo Reale",
                    address: "Corso Vittorio Emanuele 1, Lucca",
                    showMap: true,
                    mapsUrl: "",
                },
            },
            {
                id: "b_dresscode",
                type: "dresscode",
                data: {
                    title: "Dress code",
                    headline: "Abito da sera",
                    note: "cravatta o papillon graditi · tonalità sobrie con un tocco d'oro",
                },
            },
            { id: "b_rsvp", type: "rsvp", data: { buttonLabel: "Conferma la tua partecipazione" } },
        ],
    },

    // ------------------------------------------------------------------ //
    // Laurea
    // ------------------------------------------------------------------ //
    {
        key: "alloro",
        eventType: "laurea",
        name: "Alloro",
        tone: "classico · accademico",
        accent: "#4A5A2E",
        accentSoft: "#E4E9D7",
        rsvpPresetKey: "laurea",
        defaultBlocks: [
            {
                id: "b_header",
                type: "header",
                data: {
                    eyebrow: "Laurea",
                    intro: "festeggia la laurea di",
                    names: ["Andrea"],
                    dateText: "24 ottobre 2026",
                    timeText: "15:00",
                },
            },
            {
                id: "b_message",
                type: "message",
                data: {
                    text: "Dopo anni di libri, esami e caffè alle due di notte, è arrivato il giorno della corona d'alloro. Sarebbe un onore festeggiare questo traguardo insieme a te.",
                },
            },
            {
                id: "b_program",
                type: "program",
                data: {
                    title: "La giornata",
                    items: [
                        { time: "15:00", label: "Proclamazione", description: "Aula Magna" },
                        { time: "16:30", label: "Brindisi", description: "nel cortile dell'ateneo" },
                        { time: "19:30", label: "Rinfresco", description: "con famiglia e amici" },
                    ],
                },
            },
            {
                id: "b_location",
                type: "location",
                data: {
                    title: "Dove",
                    name: "Aula Magna — Università degli Studi",
                    address: "Via Verdi 8, Torino",
                    showMap: true,
                    mapsUrl: "",
                },
            },
            { id: "b_rsvp", type: "rsvp", data: { buttonLabel: "Conferma la tua presenza" } },
        ],
    },
    {
        key: "goliardico",
        eventType: "laurea",
        name: "Goliardico",
        tone: "giocoso · pop",
        accent: "#c28c54",
        accentSoft: "#F5E8D8",
        rsvpPresetKey: "laurea",
        defaultBlocks: [
            {
                id: "b_header",
                type: "header",
                data: {
                    eyebrow: "Dottore, dottore!",
                    intro: "preparate il coro: si laurea",
                    names: ["Andrea"],
                    dateText: "24 ottobre 2026",
                    timeText: "15:00",
                },
            },
            {
                id: "b_message",
                type: "message",
                data: {
                    text: "Il libretto va in pensione e la tesi è finalmente stampata. Vieni a festeggiare: si brinda, si canta e si raccontano tutte le storie che prima della discussione era meglio tacere.",
                },
            },
            {
                id: "b_program",
                type: "program",
                data: {
                    title: "Si festeggia così",
                    items: [
                        { time: "15:00", label: "Proclamazione", description: "incrociate le dita" },
                        { time: "16:00", label: "Papiro e coro", description: "davanti all'ateneo, zero pietà" },
                        { time: "20:00", label: "Festa", description: "finché reggiamo" },
                    ],
                },
            },
            {
                id: "b_location",
                type: "location",
                data: {
                    title: "Dove",
                    name: "Cortile dell'Università",
                    address: "Piazza dell'Ateneo 1, Bologna",
                    showMap: true,
                    mapsUrl: "",
                },
            },
            { id: "b_rsvp", type: "rsvp", data: { buttonLabel: "Ci sei? Dimmelo qui" } },
        ],
    },
    {
        key: "moderno",
        eventType: "laurea",
        name: "Moderno",
        tone: "pulito · sans",
        accent: "#3F3622",
        accentSoft: "#ECE7DA",
        rsvpPresetKey: "laurea",
        defaultBlocks: [
            {
                id: "b_header",
                type: "header",
                data: {
                    eyebrow: "Graduation day",
                    intro: "un capitolo si chiude: festeggiamo la laurea di",
                    names: ["Andrea"],
                    dateText: "24 ottobre 2026",
                    timeText: "14:30",
                },
            },
            {
                id: "b_message",
                type: "message",
                data: {
                    text: "Un traguardo vale doppio se festeggiato con le persone giuste. Ti aspetto dopo la proclamazione per un brindisi: niente discorsi lunghi, promesso.",
                },
            },
            {
                id: "b_program",
                type: "program",
                data: {
                    title: "Programma",
                    items: [
                        { time: "14:30", label: "Discussione", description: "Dipartimento, aula 3" },
                        { time: "16:00", label: "Proclamazione", description: "Aula Magna" },
                        { time: "18:30", label: "Aperitivo", description: "Terrazza Marconi" },
                    ],
                },
            },
            {
                id: "b_location",
                type: "location",
                data: {
                    title: "Dove",
                    name: "Campus universitario",
                    address: "Viale delle Scienze 16, Milano",
                    showMap: true,
                    mapsUrl: "",
                },
            },
            { id: "b_rsvp", type: "rsvp", data: { buttonLabel: "Conferma qui" } },
        ],
    },

    // ------------------------------------------------------------------ //
    // Battesimo
    // ------------------------------------------------------------------ //
    {
        key: "celeste",
        eventType: "battesimo",
        name: "Celeste",
        tone: "tenero · pastello",
        accent: "#7FA8C9",
        accentSoft: "#E5EEF5",
        rsvpPresetKey: "battesimo",
        defaultBlocks: [
            {
                id: "b_header",
                type: "header",
                data: {
                    eyebrow: "Battesimo",
                    intro: "con amore vi invitiamo al battesimo di",
                    names: ["Leo"],
                    dateText: "17 maggio 2026",
                    timeText: "11:00",
                },
            },
            {
                id: "b_message",
                type: "message",
                data: {
                    text: "Con i cuori colmi di gratitudine, vi invitiamo a condividere il giorno in cui il nostro piccolo riceverà il Battesimo. La vostra presenza renderà questo momento ancora più prezioso.",
                },
            },
            {
                id: "b_program",
                type: "program",
                data: {
                    title: "La celebrazione",
                    items: [
                        { time: "11:00", label: "Santa Messa", description: "con il rito del Battesimo" },
                        { time: "12:45", label: "Rinfresco", description: "in famiglia, a pochi passi dalla chiesa" },
                    ],
                },
            },
            {
                id: "b_location",
                type: "location",
                data: {
                    title: "Dove",
                    name: "Chiesa di San Giuseppe",
                    address: "Piazza della Pieve 3, Verona",
                    showMap: true,
                    mapsUrl: "",
                },
            },
            { id: "b_rsvp", type: "rsvp", data: { buttonLabel: "Conferma la presenza" } },
        ],
    },
    {
        key: "colomba",
        eventType: "battesimo",
        name: "Colomba",
        tone: "classico · sacro",
        accent: "#B98A2F",
        accentSoft: "#F5EBD3",
        rsvpPresetKey: "battesimo",
        defaultBlocks: [
            {
                id: "b_header",
                type: "header",
                data: {
                    eyebrow: "Il giorno del Battesimo",
                    intro: "insieme ai padrini annunciamo il battesimo di",
                    names: ["Leo"],
                    dateText: "17 maggio 2026",
                    timeText: "10:30",
                },
            },
            {
                id: "b_message",
                type: "message",
                data: {
                    text: "Nel giorno in cui il nostro bambino riceverà il suo primo Sacramento, desideriamo avere accanto le persone più care. Vi aspettiamo per la celebrazione e per il pranzo che seguirà.",
                },
            },
            {
                id: "b_program",
                type: "program",
                data: {
                    title: "La giornata",
                    items: [
                        { time: "10:30", label: "Santo Battesimo", description: "durante la Messa domenicale" },
                        { time: "12:30", label: "Pranzo", description: "Ristorante Le Colombe" },
                    ],
                },
            },
            {
                id: "b_location",
                type: "location",
                data: {
                    title: "Dove",
                    name: "Basilica di Santa Chiara",
                    address: "Via della Basilica 5, Assisi (PG)",
                    showMap: true,
                    mapsUrl: "",
                },
            },
            { id: "b_rsvp", type: "rsvp", data: { buttonLabel: "Conferma la tua presenza" } },
        ],
    },
    {
        key: "nuvola",
        eventType: "battesimo",
        name: "Nuvola",
        tone: "soffice · minimal",
        accent: "#8A9B6E",
        accentSoft: "#EAEFDF",
        rsvpPresetKey: "battesimo",
        defaultBlocks: [
            {
                id: "b_header",
                type: "header",
                data: {
                    eyebrow: "Benvenuto, piccolo",
                    intro: "una piccola festa per il battesimo di",
                    names: ["Leo"],
                    dateText: "17 maggio 2026",
                    timeText: "11:30",
                },
            },
            {
                id: "b_message",
                type: "message",
                data: {
                    text: "Un giorno semplice e pieno di dolcezza: la funzione in chiesa e poi tutti insieme per un brindisi. Ci farebbe davvero piacere avervi con noi.",
                },
            },
            {
                id: "b_program",
                type: "program",
                data: {
                    title: "Il programma",
                    items: [
                        { time: "11:30", label: "Funzione", description: "nella chiesa del quartiere" },
                        { time: "13:00", label: "Brindisi", description: "in giardino, tempo permettendo" },
                    ],
                },
            },
            {
                id: "b_location",
                type: "location",
                data: {
                    title: "Dove",
                    name: "Chiesa di Santa Maria",
                    address: "Via dei Tigli 21, Treviso",
                    showMap: true,
                    mapsUrl: "",
                },
            },
            { id: "b_rsvp", type: "rsvp", data: { buttonLabel: "Facci sapere se ci sei" } },
        ],
    },

    // ------------------------------------------------------------------ //
    // Compleanno
    // ------------------------------------------------------------------ //
    {
        key: "coriandoli",
        eventType: "compleanno",
        name: "Coriandoli",
        tone: "festoso · colorato",
        accent: "#C2622E",
        accentSoft: "#F6E4D6",
        rsvpPresetKey: "compleanno",
        defaultBlocks: [
            {
                id: "b_header",
                type: "header",
                data: {
                    eyebrow: "Festa!",
                    intro: "sei invitato al compleanno di",
                    names: ["Sara"],
                    dateText: "20 giugno 2026",
                    timeText: "16:00",
                },
            },
            {
                id: "b_message",
                type: "message",
                data: {
                    text: "Un anno in più si festeggia alla grande: musica, torta e coriandoli ovunque. Porta il sorriso, al resto pensiamo noi!",
                },
            },
            {
                id: "b_program",
                type: "program",
                data: {
                    title: "La festa",
                    items: [
                        { time: "16:00", label: "Accoglienza", description: "merenda e giochi per tutti" },
                        { time: "17:30", label: "Torta", description: "tutti intorno al tavolo!" },
                        { time: "18:00", label: "Festa", description: "balli e coriandoli" },
                    ],
                },
            },
            {
                id: "b_location",
                type: "location",
                data: {
                    title: "Dove",
                    name: "Giardino di casa",
                    address: "Via dei Girasoli 7, Firenze",
                    showMap: true,
                    mapsUrl: "",
                },
            },
            {
                id: "b_dresscode",
                type: "dresscode",
                data: {
                    title: "Dress code",
                    headline: "Colora la festa",
                    note: "più colori porti, meglio è",
                },
            },
            { id: "b_rsvp", type: "rsvp", data: { buttonLabel: "Dimmi se ci sei!" } },
        ],
    },
    {
        key: "candeline",
        eventType: "compleanno",
        name: "Candeline",
        tone: "caldo · familiare",
        accent: "#c28c54",
        accentSoft: "#F5E8D8",
        rsvpPresetKey: "compleanno",
        defaultBlocks: [
            {
                id: "b_header",
                type: "header",
                data: {
                    eyebrow: "Compleanno",
                    intro: "vieni a spegnere le candeline con",
                    names: ["Sara"],
                    dateText: "20 giugno 2026",
                    timeText: "19:30",
                },
            },
            {
                id: "b_message",
                type: "message",
                data: {
                    text: "Niente di esagerato: una tavola apparecchiata, una torta fatta in casa e le persone a cui vogliamo bene. Manchi solo tu.",
                },
            },
            {
                id: "b_program",
                type: "program",
                data: {
                    title: "La serata",
                    items: [
                        { time: "19:30", label: "Aperitivo", description: "in terrazza" },
                        { time: "20:30", label: "Cena", description: "fatta in casa, come si deve" },
                        { time: "22:30", label: "Torta e candeline", description: "esprimi un desiderio" },
                    ],
                },
            },
            {
                id: "b_location",
                type: "location",
                data: {
                    title: "Dove",
                    name: "Da noi, a casa",
                    address: "Via delle Camelie 14, Roma",
                    showMap: true,
                    mapsUrl: "",
                },
            },
            {
                id: "b_dresscode",
                type: "dresscode",
                data: {
                    title: "Dress code",
                    headline: "Comodi e felici",
                    note: "nessun dress code · venite come siete",
                },
            },
            { id: "b_rsvp", type: "rsvp", data: { buttonLabel: "Conferma qui" } },
        ],
    },
    {
        key: "neon",
        eventType: "compleanno",
        name: "Neon",
        tone: "bold · party",
        accent: "#8C5A8F",
        accentSoft: "#EFE3F0",
        rsvpPresetKey: "compleanno",
        defaultBlocks: [
            {
                id: "b_header",
                type: "header",
                data: {
                    eyebrow: "Party time",
                    intro: "una notte da ricordare per il compleanno di",
                    names: ["Sara"],
                    dateText: "20 giugno 2026",
                    timeText: "21:00",
                },
            },
            {
                id: "b_message",
                type: "message",
                data: {
                    text: "Le luci si abbassano, la musica si alza e la pista aspetta solo te. Si festeggia fino a tardi: vietato mancare, vietato arrivare stanchi.",
                },
            },
            {
                id: "b_program",
                type: "program",
                data: {
                    title: "La notte",
                    items: [
                        { time: "21:00", label: "Ingresso", description: "welcome drink per tutti" },
                        { time: "22:30", label: "DJ set", description: "si balla" },
                        { time: "00:00", label: "Brindisi", description: "di mezzanotte, con torta" },
                    ],
                },
            },
            {
                id: "b_location",
                type: "location",
                data: {
                    title: "Dove",
                    name: "Club Indaco",
                    address: "Via della Darsena 3, Milano",
                    showMap: true,
                    mapsUrl: "",
                },
            },
            {
                id: "b_dresscode",
                type: "dresscode",
                data: {
                    title: "Dress code",
                    headline: "Shine bright",
                    note: "qualcosa che brilla è gradito · sneakers approvate",
                },
            },
            { id: "b_rsvp", type: "rsvp", data: { buttonLabel: "Ci sei? Rispondi qui" } },
        ],
    },
];

/** Template disponibili per un tipo evento. */
export function getTemplatesByType(type: EventTypeKey): InviteTemplate[] {
    return INVITE_TEMPLATES.filter((t) => t.eventType === type);
}

/** Lookup per key (es. 'toscana'). */
export function getTemplate(key: string): InviteTemplate | undefined {
    return INVITE_TEMPLATES.find((t) => t.key === key);
}

/**
 * Distribution di default per tipo evento, con i placeholder `{nome}` e
 * `{link}` sostituiti per-ospite al momento dell'invio (cfr. mockup
 * distribution.jsx). `title` è il titolo evento (es. "Giulia & Tommaso").
 */
export function getDefaultDistribution(type: EventTypeKey, title: string): EventDistribution {
    switch (type) {
        case "matrimonio":
            return {
                emailSubject: `${title} — ci sposiamo, ci sarai?`,
                emailBody: `Caro/a {nome},\n\ndopo anni a parlarne, ci sposiamo davvero! Vorremmo tantissimo averti con noi in un giorno così speciale.\n\nDentro l'invito trovi tutti i dettagli — basta un attimo per confermare la tua presenza:\n{link}\n\nCi vediamo presto,\n${title}`,
                whatsappTemplate: `Ciao {nome}! Ci sposiamo e ci teniamo davvero ad averti con noi. Trovi tutti i dettagli e le info per confermare qui: {link}`,
                senderName: title,
            };
        case "laurea":
            return {
                emailSubject: `${title} — sei invitato alla festa di laurea!`,
                emailBody: `Ciao {nome},\n\nil grande giorno è arrivato: si festeggia la laurea! Mi farebbe davvero piacere averti con me per il brindisi.\n\nTrovi programma e dettagli nell'invito — conferma qui la tua presenza:\n{link}\n\nA presto,\n${title}`,
                whatsappTemplate: `Ciao {nome}! Festeggio la laurea e voglio brindare anche con te. Tutti i dettagli e la conferma qui: {link}`,
                senderName: title,
            };
        case "battesimo":
            return {
                emailSubject: `${title} — vi aspettiamo per festeggiare insieme`,
                emailBody: `Caro/a {nome},\n\ncon grande gioia ti invitiamo a celebrare con noi un giorno così speciale per la nostra famiglia.\n\nNell'invito trovi la chiesa, gli orari e tutti i dettagli — puoi confermare la tua presenza qui:\n{link}\n\nCon affetto,\n${title}`,
                whatsappTemplate: `Ciao {nome}! Ti aspettiamo per un giorno davvero speciale per la nostra famiglia. Trovi l'invito con tutti i dettagli qui: {link}`,
                senderName: title,
            };
        case "compleanno":
            return {
                emailSubject: `${title} — sei invitato alla festa!`,
                emailBody: `Ciao {nome}!\n\nSi festeggia un compleanno e la festa non è completa senza di te. Musica, torta e buona compagnia: il resto lo scopri nell'invito.\n\nConferma qui, bastano 30 secondi:\n{link}\n\nTi aspettiamo!\n${title}`,
                whatsappTemplate: `Ciao {nome}! Festa di compleanno in arrivo: ci sei? Trovi l'invito e la conferma qui: {link}`,
                senderName: title,
            };
    }
}
