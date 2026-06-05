/**
 * Public Event Service
 * Business logic for public (no-auth) event operations: guest registration, RSVP responses.
 */
import type { H3Event, EventHandlerRequest } from "~~/server/types/h3"
import { eq, and, count, isNull } from 'drizzle-orm'
import * as schema from '../database/schema'
import { getDB } from '../utils/db'
import { logAudit } from '../utils/audit'
import type { PublicRegistrationInput, RsvpRespondInput } from '~~/shared/schemas/guest'

// --- Helpers ---

/**
 * Look up an event by its public slug.
 * Throws 404 if not found.
 */
async function getEventBySlug(slug: string) {
  const db = getDB()

  const rows = await db
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.slug, slug), isNull(schema.events.deletedAt)))
    .limit(1)

  const eventRow = rows[0]
  if (!eventRow) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Event not found',
    })
  }

  return eventRow
}

// --- Public Read Operations ---

/**
 * Get public event data by slug with registration page.
 * Returns a safe public DTO with conditional guest count.
 */
export async function getPublicEvent(slug: string) {
  const db = getDB()
  const eventRow = await getEventBySlug(slug)

  // Get registration page data
  const regPages = await db
    .select()
    .from(schema.registrationPages)
    .where(eq(schema.registrationPages.eventId, eventRow.id))
    .limit(1)

  const registrationPage = regPages[0]?.data ?? null

  // Build public event data (only safe fields)
  const publicEvent: Record<string, unknown> = {
    id: eventRow.id,
    name: eventRow.name,
    slug: eventRow.slug,
    date: eventRow.date,
    time: eventRow.time,
    location: eventRow.location,
    address: eventRow.address,
    primaryColor: eventRow.primaryColor,
    showGuestCount: eventRow.showGuestCount,
    maxGuests: eventRow.maxGuests,
    autoConfirmRegistration: eventRow.autoConfirmRegistration,
    deadline: eventRow.deadline,
  }

  // Include confirmed guest count if enabled
  if (eventRow.showGuestCount) {
    const countResult = await db
      .select({ count: count() })
      .from(schema.guests)
      .where(
        and(
          eq(schema.guests.eventId, eventRow.id),
          eq(schema.guests.status, 'yes'),
        ),
      )
    publicEvent.confirmedGuestCount = countResult[0]?.count ?? 0
  }

  return {
    event: publicEvent,
    registrationPage,
  }
}

/**
 * Get public RSVP data by slug with landing page.
 * Optionally includes guest data when guestId is provided.
 */
export async function getPublicRsvpData(slug: string, guestId?: string) {
  const db = getDB()
  const eventRow = await getEventBySlug(slug)

  // Get landing page data
  const landingRows = await db
    .select()
    .from(schema.landingPages)
    .where(eq(schema.landingPages.eventId, eventRow.id))
    .limit(1)

  const landingPage = landingRows[0]?.data ?? null

  // Build public event data
  const publicEvent: Record<string, unknown> = {
    id: eventRow.id,
    name: eventRow.name,
    slug: eventRow.slug,
    date: eventRow.date,
    time: eventRow.time,
    location: eventRow.location,
    address: eventRow.address,
    primaryColor: eventRow.primaryColor,
    showGuestCount: eventRow.showGuestCount,
    deadline: eventRow.deadline,
  }

  // Include confirmed guest count if enabled
  if (eventRow.showGuestCount) {
    const countResult = await db
      .select({ count: count() })
      .from(schema.guests)
      .where(
        and(
          eq(schema.guests.eventId, eventRow.id),
          eq(schema.guests.status, 'yes'),
        ),
      )
    publicEvent.confirmedGuestCount = countResult[0]?.count ?? 0
  }

  // Optionally include guest data
  let guest: Record<string, unknown> | null = null
  if (guestId) {
    const guestRows = await db
      .select()
      .from(schema.guests)
      .where(
        and(
          eq(schema.guests.id, guestId),
          eq(schema.guests.eventId, eventRow.id),
        ),
      )
      .limit(1)

    if (!guestRows[0]) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Guest not found',
      })
    }

    guest = {
      id: guestRows[0].id,
      name: guestRows[0].name,
      status: guestRows[0].status,
    }
  }

  return {
    event: publicEvent,
    landingPage,
    guest,
  }
}

// --- Public Write Operations ---

/**
 * Register a guest for a public event.
 * Checks guest limit, determines initial status based on autoConfirmRegistration.
 */
export async function registerGuest(
  h3Event: H3Event<EventHandlerRequest>,
  slug: string,
  input: PublicRegistrationInput,
) {
  const db = getDB()
  const eventRow = await getEventBySlug(slug)

  // Check guest limit
  const countResult = await db
    .select({ count: count() })
    .from(schema.guests)
    .where(eq(schema.guests.eventId, eventRow.id))

  const currentGuests = countResult[0]?.count ?? 0

  if (currentGuests >= eventRow.maxGuests) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Guest limit reached. Registration is closed.',
    })
  }

  // Determine initial status
  const guestStatus = eventRow.autoConfirmRegistration ? 'yes' : 'pending'

  // Create guest
  const [created] = await db.insert(schema.guests).values({
    eventId: eventRow.id,
    name: input.name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    source: 'registration',
    status: guestStatus,
    customFields: input.customFields ?? null,
    respondedAt: eventRow.autoConfirmRegistration ? new Date() : null,
  }).returning()

  await logAudit(h3Event, 'guest.registered', {
    targetType: 'guest',
    targetId: created?.id,
    details: {
      eventId: eventRow.id,
      eventSlug: slug,
      name: input.name,
      status: guestStatus,
    },
  })

  return {
    success: true,
    status: guestStatus as 'yes' | 'pending',
  }
}

/**
 * Respond to an RSVP invitation (yes/no).
 * Verifies guest belongs to the event identified by slug.
 */
export async function respondRsvp(
  h3Event: H3Event<EventHandlerRequest>,
  slug: string,
  input: RsvpRespondInput,
) {
  const db = getDB()
  const eventRow = await getEventBySlug(slug)

  // Verify guest belongs to this event
  const guestRows = await db
    .select()
    .from(schema.guests)
    .where(
      and(
        eq(schema.guests.id, input.guestId),
        eq(schema.guests.eventId, eventRow.id),
      ),
    )
    .limit(1)

  if (!guestRows[0]) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Guest not found for this event',
    })
  }

  // Update guest status and respondedAt
  await db
    .update(schema.guests)
    .set({
      status: input.status,
      respondedAt: new Date(),
    })
    .where(eq(schema.guests.id, input.guestId))

  await logAudit(h3Event, 'guest.rsvp_responded', {
    targetType: 'guest',
    targetId: input.guestId,
    details: {
      eventId: eventRow.id,
      eventSlug: slug,
      status: input.status,
    },
  })

  return { success: true }
}
