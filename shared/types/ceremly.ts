/**
 * Ceremly — shared client/server types (ONLY type/interface, no runtime).
 *
 * Contractual shapes from the SPEC (§3 + §6): invite blocks, RSVP configuration,
 * guest responses and API payloads. Dates travel as ISO strings because
 * payloads are serialised via $fetch/useFetch.
 */

import type { InviteTheme } from '../constants/inviteTheme'

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

export type EventTypeKey = 'matrimonio' | 'laurea' | 'compleanno' | 'battesimo'

export type EventStatus = 'draft' | 'active' | 'closed'

export type AttendingStatus = 'yes' | 'no' | 'maybe'

/** Send settings saved on the event (jsonb `distribution`). */
export interface EventDistribution {
  emailSubject: string
  emailBody: string
  whatsappTemplate: string
  senderName: string
}

// ---------------------------------------------------------------------------
// Invite blocks (§3.1)
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

/** Remaining days are calculated from `event.eventDate`. */
export interface CountdownBlockData {
  title: string
}

export interface GalleryBlockData {
  /** Max 5 images. */
  images: { url: string, alt: string }[]
}

/** Block ALWAYS present, ALWAYS last, not removable. */
export interface RsvpBlockData {
  buttonLabel: string
}

/** Map type → data, base of the discriminated union. */
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
 * Invite block: discriminated union on `type`.
 * `id`: `b_` + suffix (static in templates, random for blocks created in the editor).
 * The `blocks` array is ordered: the order is the rendering order.
 */
export type InviteBlock = {
  [K in BlockType]: { id: string, type: K, data: BlockDataMap[K] }
}[BlockType]

export type BlockData = InviteBlock['data']

// ---------------------------------------------------------------------------
// RSVP configuration (§3.2)
// ---------------------------------------------------------------------------

export type RsvpQuestionType = 'text' | 'single' | 'multiple' | 'number' | 'boolean'

export type RsvpConditionOp = 'eq' | 'neq' | 'gt'

/**
 * Visibility condition: the question is shown only if the question
 * `questionId` is itself visible and its canonical value satisfies
 * op/value. For conditions on `attendance`, `value` uses the canonical
 * values 'yes' | 'no' | 'maybe' (not the customisable labels).
 */
export interface RsvpCondition {
  questionId: string
  op: RsvpConditionOp
  value: string | number
}

export interface RsvpQuestion {
  /** `q_` + suffix; reserved ids: 'attendance', 'companions_count', 'companion_names'. */
  id: string
  label: string
  description?: string
  type: RsvpQuestionType
  /** For single/multiple. */
  options?: string[]
  /** For number (default 0). */
  min?: number
  /** For number (default 4). */
  max?: number
  required: boolean
  /** Replicates the question for guest + companions. */
  perPerson: boolean
  /** Default 'all'; 'companions' for companion_names. */
  perPersonScope?: 'all' | 'companions'
  condition?: RsvpCondition | null
  /** true only for 'attendance' (not deletable, fixed type). */
  locked?: boolean
}

// ---------------------------------------------------------------------------
// Guest responses (§3.3)
// ---------------------------------------------------------------------------

export type RsvpAnswerValue = string | number | boolean | string[]

/** Response to a perPerson question (scope 'companions' → `self` always null). */
export interface RsvpPerPersonAnswer {
  self: RsvpAnswerValue | null
  companions: RsvpAnswerValue[]
}

/** Key = question.id; flat value for normal questions, perPerson shape otherwise. */
export type RsvpAnswers = Record<string, RsvpAnswerValue | RsvpPerPersonAnswer>

// ---------------------------------------------------------------------------
// API payloads (inferred from the §6 contracts)
// ---------------------------------------------------------------------------

export type SentChannel = 'email' | 'whatsapp'

/** Event as serialised by the organiser APIs. */
export interface CeremlyEvent {
  id: string
  organizationId: string
  type: EventTypeKey
  templateKey: string
  /** Custom colour theme; null ⇒ global tokens (toscana look). */
  theme: InviteTheme | null
  /** Font catalog family name; null ⇒ global --font-display. */
  inviteFont: string | null
  title: string
  slug: string
  eventDate: string | null
  eventTime: string | null
  locationName: string | null
  locationAddress: string | null
  status: EventStatus
  /** Plan required for this event: 'free' = included, 'celebration' = unlocked by Atelier. */
  tier: 'free' | 'celebration'
  /** ISO timestamp (null if still locked). */
  unlockedAt: string | null
  blocks: InviteBlock[]
  rsvpConfig: RsvpQuestion[]
  rsvpDeadline: string | null
  rsvpClosedMessage: string | null
  distribution: EventDistribution
  createdAt: string
  updatedAt: string
}

/** Aggregated counts for the event card (exclude removed guests). */
export interface EventCounts {
  guests: number
  confirmed: number
  declined: number
  maybe: number
  /** Guests WITHOUT a response ('maybe' have responded: not pending). */
  pending: number
  opened: number
  sent: number
}

/** Item of `GET /api/events`. */
export interface EventWithCounts extends CeremlyEvent {
  counts: EventCounts
}

/**
 * Derived guest state: responded → attending;
 * no response → firstOpenedAt ? 'opened' : 'not_opened'.
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

/** Item of `GET /api/events/:id/guests`. */
export interface GuestWithStatus extends CeremlyGuest {
  rsvpStatus: GuestRsvpStatus
  respondedAt: string | null
  /** 1 + companionsCount if confirmed, otherwise 0. */
  totalPeople: number
}

/** Latest version of the RSVP response (upsert per guest). */
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
    /** Confirmed + companions. */
    totalPeople: number
  }
  /** Cumulative per day, last 28 days. */
  timeline: { date: string, confirmed: number, declined: number, maybe: number }[]
  menuBreakdown: { label: string, count: number }[]
  allergies: { value: string, count: number }[]
  /** Opened >7 days ago without a response, max 10. */
  needsAttention: { guestId: string, name: string, contact: string | null, openedDaysAgo: number }[]
  /** No email and no response (for manual WhatsApp reminders). */
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

/** Payload of `GET /api/public/invite/:token` (§6.2) — never data from other guests. */
export interface PublicInvitePayload {
  event: Pick<
    CeremlyEvent,
    | 'title' | 'type' | 'templateKey' | 'theme' | 'inviteFont' | 'eventDate' | 'eventTime'
    | 'blocks' | 'rsvpConfig' | 'rsvpDeadline' | 'rsvpClosedMessage' | 'slug'
  >
  guest: { firstName: string, lastName: string }
  response: Pick<
    RsvpResponseData,
    'attending' | 'companionsCount' | 'answers' | 'declineMessage' | 'updatedAt'
  > | null
  deadlinePassed: boolean
  /** true ONLY for the signed preview (`/api/public/preview`): RSVP read-only. */
  preview?: boolean
}
