/**
 * Ceremly — tipi condivisi client/server (SOLO type/interface, nessun runtime).
 *
 * Shape contrattuali della SPEC (§3 + §6): blocchi invito, configurazione RSVP,
 * risposte ospite e payload API. Le date viaggiano come stringhe ISO perché i
 * payload sono serializzati via $fetch/useFetch.
 */

// ---------------------------------------------------------------------------
// Evento
// ---------------------------------------------------------------------------

export type EventTypeKey = 'matrimonio' | 'laurea' | 'compleanno' | 'battesimo'

export type EventStatus = 'draft' | 'active' | 'closed'

export type AttendingStatus = 'yes' | 'no' | 'maybe'

/** Impostazioni di invio salvate sull'evento (jsonb `distribution`). */
export interface EventDistribution {
  emailSubject: string
  emailBody: string
  whatsappTemplate: string
  senderName: string
}

// ---------------------------------------------------------------------------
// Blocchi invito (§3.1)
// ---------------------------------------------------------------------------

export type BlockType =
  | 'header'
  | 'message'
  | 'program'
  | 'location'
  | 'dresscode'
  | 'logistics'
  | 'countdown'
  | 'gallery'
  | 'rsvp'

export interface HeaderBlockData {
  eyebrow: string
  intro: string
  names: string[]
  dateText: string
  timeText: string
}

export interface MessageBlockData {
  text: string
}

export interface ProgramBlockItem {
  time: string
  label: string
  description: string
}

export interface ProgramBlockData {
  title: string
  items: ProgramBlockItem[]
}

export interface LocationBlockData {
  title: string
  name: string
  address: string
  showMap: boolean
  mapsUrl: string
}

export interface DresscodeBlockData {
  title: string
  headline: string
  note: string
}

export interface LogisticsBlockData {
  title: string
  text: string
}

/** I giorni mancanti sono calcolati da `event.eventDate`. */
export interface CountdownBlockData {
  title: string
}

export interface GalleryBlockData {
  /** Max 5 immagini. */
  images: { url: string, alt: string }[]
}

/** Blocco SEMPRE presente, SEMPRE ultimo, non rimovibile. */
export interface RsvpBlockData {
  buttonLabel: string
}

/** Mappa type → data, base della union discriminata. */
export interface BlockDataMap {
  header: HeaderBlockData
  message: MessageBlockData
  program: ProgramBlockData
  location: LocationBlockData
  dresscode: DresscodeBlockData
  logistics: LogisticsBlockData
  countdown: CountdownBlockData
  gallery: GalleryBlockData
  rsvp: RsvpBlockData
}

/**
 * Blocco dell'invito: union discriminata su `type`.
 * `id`: `b_` + suffisso (statico nei template, random per i blocchi creati in editor).
 * L'array `blocks` è ordinato: l'ordine è l'ordine di rendering.
 */
export type InviteBlock = {
  [K in BlockType]: { id: string, type: K, data: BlockDataMap[K] }
}[BlockType]

export type BlockData = InviteBlock['data']

// ---------------------------------------------------------------------------
// Configurazione RSVP (§3.2)
// ---------------------------------------------------------------------------

export type RsvpQuestionType = 'text' | 'single' | 'multiple' | 'number' | 'boolean'

export type RsvpConditionOp = 'eq' | 'neq' | 'gt'

/**
 * Condizione di visibilità: la domanda è mostrata solo se la domanda
 * `questionId` è a sua volta visibile e il suo valore canonico soddisfa
 * op/value. Per condition su `attendance`, `value` usa i valori canonici
 * 'yes' | 'no' | 'maybe' (non le label personalizzabili).
 */
export interface RsvpCondition {
  questionId: string
  op: RsvpConditionOp
  value: string | number
}

export interface RsvpQuestion {
  /** `q_` + suffisso; id riservati: 'attendance', 'companions_count', 'companion_names'. */
  id: string
  label: string
  description?: string
  type: RsvpQuestionType
  /** Per single/multiple. */
  options?: string[]
  /** Per number (default 0). */
  min?: number
  /** Per number (default 4). */
  max?: number
  required: boolean
  /** Replica la domanda per ospite + accompagnatori. */
  perPerson: boolean
  /** Default 'all'; 'companions' per companion_names. */
  perPersonScope?: 'all' | 'companions'
  condition?: RsvpCondition | null
  /** true solo per 'attendance' (non eliminabile, tipo fisso). */
  locked?: boolean
}

// ---------------------------------------------------------------------------
// Risposte ospite (§3.3)
// ---------------------------------------------------------------------------

export type RsvpAnswerValue = string | number | boolean | string[]

/** Risposta a domanda perPerson (scope 'companions' → `self` sempre null). */
export interface RsvpPerPersonAnswer {
  self: RsvpAnswerValue | null
  companions: RsvpAnswerValue[]
}

/** Chiave = question.id; valore piatto per domande normali, shape perPerson altrimenti. */
export type RsvpAnswers = Record<string, RsvpAnswerValue | RsvpPerPersonAnswer>

// ---------------------------------------------------------------------------
// Payload API (dedotti dai contratti §6)
// ---------------------------------------------------------------------------

export type SentChannel = 'email' | 'whatsapp'

/** Evento come serializzato dalle API organizzatore. */
export interface CeremlyEvent {
  id: string
  organizationId: string
  type: EventTypeKey
  templateKey: string
  title: string
  slug: string
  eventDate: string | null
  eventTime: string | null
  locationName: string | null
  locationAddress: string | null
  status: EventStatus
  /** Piano richiesto per questo evento: 'free' = incluso, 'celebration' = sblocco Atelier. */
  tier: 'free' | 'celebration'
  /** Timestamp ISO (null se ancora bloccato). */
  unlockedAt: string | null
  blocks: InviteBlock[]
  rsvpConfig: RsvpQuestion[]
  rsvpDeadline: string | null
  rsvpClosedMessage: string | null
  distribution: EventDistribution
  createdAt: string
  updatedAt: string
}

/** Conteggi aggregati per card evento (escludono gli ospiti removed). */
export interface EventCounts {
  guests: number
  confirmed: number
  declined: number
  maybe: number
  /** Ospiti SENZA risposta (i 'maybe' hanno risposto: non sono pending). */
  pending: number
  opened: number
  sent: number
}

/** Item di `GET /api/events`. */
export interface EventWithCounts extends CeremlyEvent {
  counts: EventCounts
}

/**
 * Stato derivato dell'ospite: risposta → attending;
 * nessuna risposta → firstOpenedAt ? 'opened' : 'not_opened'.
 */
export type GuestRsvpStatus = 'confirmed' | 'declined' | 'maybe' | 'opened' | 'not_opened'

export interface CeremlyGuest {
  id: string
  eventId: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  groupName: string | null
  notes: string | null
  token: string
  sentAt: string | null
  sentChannel: SentChannel | null
  emailOpenedAt: string | null
  firstOpenedAt: string | null
  openCount: number
  remindersDisabled: boolean
  removedAt: string | null
  createdAt: string
  updatedAt: string
}

/** Item di `GET /api/events/:id/guests`. */
export interface GuestWithStatus extends CeremlyGuest {
  rsvpStatus: GuestRsvpStatus
  respondedAt: string | null
  /** 1 + companionsCount se confirmed, altrimenti 0. */
  totalPeople: number
}

/** Ultima versione della risposta RSVP (upsert per guest). */
export interface RsvpResponseData {
  attending: AttendingStatus
  companionsCount: number
  answers: RsvpAnswers
  declineMessage: string | null
  submittedAt: string
  updatedAt: string | null
}

export type GuestActivityType =
  | 'invite_sent'
  | 'link_opened'
  | 'email_opened'
  | 'rsvp_submitted'
  | 'rsvp_updated'
  | 'reminder_sent'

export interface GuestActivity {
  id: string
  guestId: string
  type: GuestActivityType
  meta: Record<string, unknown>
  createdAt: string
}

/** `GET /api/events/:id/stats` (§6.1). */
export interface EventStats {
  kpi: {
    totalGuests: number
    sent: number
    opened: number
    responded: number
    confirmed: number
    declined: number
    maybe: number
    pending: number
    /** Confermati + accompagnatori. */
    totalPeople: number
  }
  /** Cumulativo per giorno, ultimi 28 giorni. */
  timeline: { date: string, confirmed: number, declined: number, maybe: number }[]
  menuBreakdown: { label: string, count: number }[]
  allergies: { value: string, count: number }[]
  /** Aperto >7gg fa senza risposta, max 10. */
  needsAttention: { guestId: string, name: string, contact: string | null, openedDaysAgo: number }[]
  /** Senza email e senza risposta (per reminder WhatsApp manuali). */
  noEmailPending: number
}

export interface EventReminderData {
  id: string
  daysBefore: number
  subject: string
  message: string
  enabled: boolean
  sentAt: string | null
}

/** Payload di `GET /api/public/invite/:token` (§6.2) — mai dati di altri ospiti. */
export interface PublicInvitePayload {
  event: Pick<
    CeremlyEvent,
    | 'title' | 'type' | 'templateKey' | 'eventDate' | 'eventTime'
    | 'blocks' | 'rsvpConfig' | 'rsvpDeadline' | 'rsvpClosedMessage' | 'slug'
  >
  guest: { firstName: string, lastName: string }
  response: Pick<
    RsvpResponseData,
    'attending' | 'companionsCount' | 'answers' | 'declineMessage' | 'updatedAt'
  > | null
  deadlinePassed: boolean
}
