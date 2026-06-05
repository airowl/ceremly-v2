/**
 * Landing page section schema definitions.
 * Describes available sections and their configurable fields.
 * Used to dynamically generate editor forms and validate section data.
 */

import type { LandingSectionType } from "../constants/enums";

export type SectionFieldType =
  | "text"
  | "textarea"
  | "richtext"
  | "color"
  | "image"
  | "select"
  | "toggle"
  | "date"
  | "time"
  | "number";

export interface SectionFieldOption {
  label: string;
  value: string;
}

export interface SectionFieldDefinition {
  key: string;
  label: string;
  type: SectionFieldType;
  default: unknown;
  required?: boolean;
  placeholder?: string;
  options?: SectionFieldOption[];
  min?: number;
  max?: number;
}

export interface SectionDefinition {
  type: LandingSectionType;
  label: string;
  description: string;
  icon: string;
  fields: SectionFieldDefinition[];
}

export const SECTION_DEFINITIONS: SectionDefinition[] = [
  {
    type: "hero",
    label: "Intestazione",
    description: "Sezione hero con titolo, sottotitolo e immagine di sfondo",
    icon: "i-lucide-image",
    fields: [
      { key: "title", label: "Titolo", type: "text", default: "", required: true, placeholder: "Titolo evento" },
      { key: "subtitle", label: "Sottotitolo", type: "text", default: "", placeholder: "Sottotitolo o frase" },
      { key: "showDate", label: "Mostra data", type: "toggle", default: true },
      { key: "backgroundImage", label: "Immagine sfondo", type: "image", default: "" },
      { key: "overlayOpacity", label: "Opacità overlay", type: "number", default: 40, min: 0, max: 100 },
      {
        key: "height",
        label: "Altezza",
        type: "select",
        default: "large",
        options: [
          { label: "Piccola", value: "small" },
          { label: "Media", value: "medium" },
          { label: "Grande", value: "large" },
          { label: "Schermo intero", value: "full" },
        ],
      },
    ],
  },
  {
    type: "details",
    label: "Dettagli Evento",
    description: "Data, orario, location, dress code e info aggiuntive",
    icon: "i-lucide-calendar",
    fields: [
      { key: "showDate", label: "Mostra data", type: "toggle", default: true },
      { key: "showTime", label: "Mostra orario", type: "toggle", default: true },
      { key: "locationName", label: "Nome location", type: "text", default: "", placeholder: "Es. Villa Rossi" },
      { key: "address", label: "Indirizzo", type: "text", default: "", placeholder: "Via Roma 1, Milano" },
      { key: "dressCode", label: "Dress code", type: "text", default: "", placeholder: "Es. Elegante" },
      { key: "additionalInfo", label: "Informazioni aggiuntive", type: "textarea", default: "" },
      {
        key: "layout",
        label: "Layout",
        type: "select",
        default: "cards",
        options: [
          { label: "Cards", value: "cards" },
          { label: "Lista", value: "list" },
          { label: "Timeline", value: "timeline" },
        ],
      },
    ],
  },
  {
    type: "story",
    label: "La Nostra Storia",
    description: "Sezione narrativa con testo e foto",
    icon: "i-lucide-book-open",
    fields: [
      { key: "title", label: "Titolo", type: "text", default: "La Nostra Storia", placeholder: "Titolo sezione" },
      { key: "text", label: "Testo", type: "richtext", default: "" },
      { key: "photo", label: "Foto", type: "image", default: "" },
      {
        key: "imagePosition",
        label: "Posizione immagine",
        type: "select",
        default: "right",
        options: [
          { label: "Sinistra", value: "left" },
          { label: "Destra", value: "right" },
          { label: "Sopra", value: "top" },
        ],
      },
    ],
  },
  {
    type: "countdown",
    label: "Conto alla Rovescia",
    description: "Timer con countdown alla data evento",
    icon: "i-lucide-timer",
    fields: [
      { key: "title", label: "Titolo", type: "text", default: "Mancano", placeholder: "Titolo countdown" },
      { key: "showDays", label: "Mostra giorni", type: "toggle", default: true },
      { key: "showHours", label: "Mostra ore", type: "toggle", default: true },
      { key: "showMinutes", label: "Mostra minuti", type: "toggle", default: true },
      { key: "showSeconds", label: "Mostra secondi", type: "toggle", default: true },
      { key: "expiredMessage", label: "Messaggio scaduto", type: "text", default: "L'evento è iniziato!", placeholder: "Messaggio quando il countdown finisce" },
    ],
  },
  {
    type: "gallery",
    label: "Galleria Foto",
    description: "Galleria immagini (max 6)",
    icon: "i-lucide-images",
    fields: [
      { key: "title", label: "Titolo", type: "text", default: "Galleria", placeholder: "Titolo galleria" },
      { key: "image1", label: "Immagine 1", type: "image", default: "" },
      { key: "image2", label: "Immagine 2", type: "image", default: "" },
      { key: "image3", label: "Immagine 3", type: "image", default: "" },
      { key: "image4", label: "Immagine 4", type: "image", default: "" },
      { key: "image5", label: "Immagine 5", type: "image", default: "" },
      { key: "image6", label: "Immagine 6", type: "image", default: "" },
      {
        key: "layout",
        label: "Layout",
        type: "select",
        default: "grid",
        options: [
          { label: "Griglia", value: "grid" },
          { label: "Masonry", value: "masonry" },
          { label: "Carousel", value: "carousel" },
        ],
      },
    ],
  },
  {
    type: "rsvp",
    label: "Conferma Presenza",
    description: "Form conferma/declina per singolo invitato (landing RSVP)",
    icon: "i-lucide-check-circle",
    fields: [
      { key: "title", label: "Titolo", type: "text", default: "Conferma la tua presenza", placeholder: "Titolo sezione RSVP" },
      { key: "description", label: "Descrizione", type: "textarea", default: "", placeholder: "Testo introduttivo" },
      { key: "confirmButtonText", label: "Testo bottone conferma", type: "text", default: "Confermo la presenza" },
      { key: "declineButtonText", label: "Testo bottone rifiuto", type: "text", default: "Non potrò esserci" },
      { key: "showConfirmCount", label: "Mostra contatore conferme", type: "toggle", default: true },
      { key: "confirmCountText", label: "Testo contatore", type: "text", default: "{{count}} persone hanno già confermato" },
    ],
  },
  {
    type: "registration_form",
    label: "Form Registrazione",
    description: "Form di registrazione pubblica con campi personalizzabili (landing registrazione)",
    icon: "i-lucide-clipboard-list",
    fields: [
      { key: "title", label: "Titolo", type: "text", default: "Registrati all'evento", placeholder: "Titolo form" },
      { key: "description", label: "Descrizione", type: "textarea", default: "", placeholder: "Testo introduttivo" },
      { key: "showEmail", label: "Campo email", type: "toggle", default: true },
      { key: "emailRequired", label: "Email obbligatoria", type: "toggle", default: false },
      { key: "showPhone", label: "Campo telefono", type: "toggle", default: true },
      { key: "phoneRequired", label: "Telefono obbligatorio", type: "toggle", default: false },
      { key: "showCompanions", label: "Campo accompagnatori", type: "toggle", default: false },
      { key: "companionsRequired", label: "Accompagnatori obbligatorio", type: "toggle", default: false },
      { key: "showAllergies", label: "Campo allergie", type: "toggle", default: false },
      { key: "allergiesRequired", label: "Allergie obbligatorio", type: "toggle", default: false },
      { key: "showNotes", label: "Campo note", type: "toggle", default: false },
      { key: "notesRequired", label: "Note obbligatorio", type: "toggle", default: false },
      { key: "submitButtonText", label: "Testo bottone", type: "text", default: "Registrati" },
      { key: "successMessage", label: "Messaggio successo", type: "textarea", default: "Registrazione completata con successo!" },
    ],
  },
  {
    type: "map",
    label: "Mappa",
    description: "Mappa con posizione evento e indicazioni stradali",
    icon: "i-lucide-map-pin",
    fields: [
      { key: "title", label: "Titolo", type: "text", default: "Come Arrivare", placeholder: "Titolo mappa" },
      { key: "showDirectionsButton", label: "Mostra bottone indicazioni", type: "toggle", default: true },
      { key: "directionsButtonText", label: "Testo bottone", type: "text", default: "Apri in Google Maps" },
    ],
  },
  {
    type: "footer",
    label: "Footer",
    description: "Messaggio finale e contatti",
    icon: "i-lucide-panel-bottom",
    fields: [
      { key: "message", label: "Messaggio finale", type: "textarea", default: "", placeholder: "Es. Vi aspettiamo!" },
      { key: "showContacts", label: "Mostra contatti", type: "toggle", default: false },
      { key: "email", label: "Email", type: "text", default: "", placeholder: "email@esempio.com" },
      { key: "phone", label: "Telefono", type: "text", default: "", placeholder: "+39 333 1234567" },
    ],
  },
];

/**
 * Get section definition by type
 */
export function getSectionDefinition(type: LandingSectionType): SectionDefinition | undefined {
  return SECTION_DEFINITIONS.find(s => s.type === type);
}

/**
 * Get default values for a section type
 */
export function getSectionDefaults(type: LandingSectionType): Record<string, unknown> {
  const definition = getSectionDefinition(type);
  if (!definition) return {};
  return Object.fromEntries(definition.fields.map(f => [f.key, f.default]));
}
