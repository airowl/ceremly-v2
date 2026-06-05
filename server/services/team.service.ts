/**
 * Team Service
 * Business logic for team operations: members list, invite, acceptance, permission updates, member removal.
 */
import type { H3Event, EventHandlerRequest } from "~~/server/types/h3"
import { eq, and, gt, or, ne } from 'drizzle-orm'
import { invitations, events, eventUsers, user } from '../database/schema'
import { getDB } from '../utils/db'
import { logAudit } from '../utils/audit'
import { getUserRole, canManageTeam } from '../utils/permissions'
import { canAddTeamMember } from './planLimit.service'
import { renderEventInviteEmail, emailSubjects, type SupportedLanguage } from '../emailTemplates'
import { runtimeConfig } from '../utils/runtimeConfig'
import { getResendInstance } from '../utils/drivers'
import { getDefaultSender } from '../utils/email'
import type { AcceptInviteInput, UpdatePermissionsInput, TeamInviteInput, ResendInviteInput } from '~~/shared/schemas/team'

// --- Helpers ---

/**
 * Find the current user's event (owned or member of).
 * Returns event id and userId (owner), or throws 404.
 */
async function findUserEvent(userId: string) {
  const db = getDB()

  const userEvents = await db
    .select({
      id: events.id,
      userId: events.userId,
    })
    .from(events)
    .leftJoin(eventUsers, eq(eventUsers.eventId, events.id))
    .where(
      or(
        eq(events.userId, userId),
        eq(eventUsers.userId, userId),
      ),
    )
    .limit(1)

  if (!userEvents.length) {
    throw createError({
      statusCode: 404,
      statusMessage: 'No evento found',
    })
  }

  return userEvents[0]!
}

/**
 * Verify the current user can manage team in their event.
 * Returns the event object.
 */
async function requireTeamManagement(userId: string) {
  const eventRow = await findUserEvent(userId)

  const roleContext = await getUserRole(userId, eventRow.id)
  if (!roleContext || !canManageTeam(roleContext.role)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Non hai i permessi per gestire i ruoli dei membri',
    })
  }

  return eventRow
}

// --- Constants ---

/** Duration for invitation expiry (7 days) */
const INVITE_EXPIRY_DAYS = 7

// --- Team Operations ---

/**
 * Get event members list and pending invitations.
 * Returns owner first, then other members, plus pending invitations.
 */
export async function getEventMembers(userId: string) {
  const db = getDB()

  try {
    // Get user's current event
    const userEvents = await db
      .select({
        id: events.id,
        name: events.name,
        userId: events.userId,
      })
      .from(events)
      .leftJoin(eventUsers, eq(eventUsers.eventId, events.id))
      .where(
        or(
          eq(events.userId, userId),
          eq(eventUsers.userId, userId),
        ),
      )
      .limit(1)

    if (!userEvents.length) {
      throw createError({
        statusCode: 404,
        statusMessage: 'No evento found',
      })
    }

    const eventRow = userEvents[0]!

    if (!eventRow.userId) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Evento has no owner',
      })
    }

    const ownerId = eventRow.userId

    // Get owner info
    const ownerData = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(eq(user.id, ownerId))
      .limit(1)

    // Get event members (excluding owner)
    const eventMembersData = await db
      .select({
        userId: eventUsers.userId,
        role: eventUsers.role,
        joinedAt: eventUsers.createdAt,
        userName: user.name,
        userEmail: user.email,
        userImage: user.image,
      })
      .from(eventUsers)
      .innerJoin(user, eq(eventUsers.userId, user.id))
      .where(
        and(
          eq(eventUsers.eventId, eventRow.id),
          ne(eventUsers.userId, ownerId),
        ),
      )

    // Build members array starting with owner
    const members: Array<{
      id: string
      name: string
      email: string
      avatar_url: string | null
      is_owner: boolean
      role: 'owner' | 'editor' | 'viewer'
      invited_by: null
      last_login_at: null
      joined_at: string | null
      status: 'active'
    }> = []

    if (ownerData.length) {
      const owner = ownerData[0]!
      members.push({
        id: owner.id,
        name: owner.name || owner.email || 'Owner',
        email: owner.email,
        avatar_url: owner.image,
        is_owner: true,
        role: 'owner' as const,
        invited_by: null,
        last_login_at: null,
        joined_at: owner.createdAt?.toISOString() || null,
        status: 'active' as const,
      })
    }

    // Add other members
    for (const member of eventMembersData) {
      members.push({
        id: member.userId,
        name: member.userName || member.userEmail || 'Member',
        email: member.userEmail,
        avatar_url: member.userImage,
        is_owner: false,
        role: (member.role || 'viewer') as 'editor' | 'viewer',
        invited_by: null,
        last_login_at: null,
        joined_at: member.joinedAt?.toISOString() || null,
        status: 'active' as const,
      })
    }

    // Get pending invitations
    const pendingInvitations = await db
      .select({
        id: invitations.id,
        email: invitations.email,
        expiresAt: invitations.expiresAt,
        createdAt: invitations.createdAt,
        invitedById: invitations.invitedById,
        invitedByName: user.name,
      })
      .from(invitations)
      .leftJoin(user, eq(invitations.invitedById, user.id))
      .where(
        and(
          eq(invitations.eventId, eventRow.id),
          eq(invitations.status, 'pending'),
          gt(invitations.expiresAt, new Date()),
        ),
      )

    const formattedInvitations = pendingInvitations.map(inv => ({
      id: inv.id,
      email: inv.email,
      expires_at: inv.expiresAt.toISOString(),
      created_at: inv.createdAt.toISOString(),
      invited_by: inv.invitedByName || 'Unknown',
    }))

    // total_members includes owner (plan limits count total team size including owner)
    return {
      members,
      pending_invitations: formattedInvitations,
      total_members: members.length,
      total_pending: formattedInvitations.length,
    }
  } catch (e: any) {
    console.error('[team.service] getEventMembers error:', e)
    if (e.statusCode) throw e
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to load team members',
    })
  }
}

/**
 * Invite a new member to the event.
 * Permission check, team limit, existing check, token gen, DB insert, email send, logAudit.
 */
export async function inviteMember(
  h3Event: H3Event<EventHandlerRequest>,
  currentUser: { id: string; name?: string | null; email?: string | null },
  input: TeamInviteInput,
) {
  const { email, language } = input
  const db = getDB()

  try {
    // Get current user's event (the one they're inviting to)
    const userEvents = await db
      .select({
        id: events.id,
        name: events.name,
        userId: events.userId,
      })
      .from(events)
      .leftJoin(eventUsers, eq(eventUsers.eventId, events.id))
      .where(
        and(
          or(
            eq(events.userId, currentUser.id),
            eq(eventUsers.userId, currentUser.id),
          ),
        ),
      )
      .limit(1)

    if (!userEvents.length) {
      throw createError({
        statusCode: 403,
        statusMessage: 'No evento found',
      })
    }

    const eventRow = userEvents[0]!

    // Check if current user can manage team (owner or editor)
    const roleContext = await getUserRole(currentUser.id, eventRow.id)
    if (!roleContext) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Non sei membro di questo evento',
      })
    }

    if (!canManageTeam(roleContext.role)) {
      throw createError({
        statusCode: 403,
        statusMessage: 'You do not have permission to invite members',
      })
    }

    // Check team member limit based on event owner's plan
    const ownerId = eventRow.userId
    if (ownerId) {
      const limitCheck = await canAddTeamMember(ownerId, eventRow.id)
      if (!limitCheck.allowed) {
        throw createError({
          statusCode: 403,
          statusMessage: `Team member limit reached. The ${limitCheck.plan} plan allows ${limitCheck.limit} team member(s). Current: ${limitCheck.current}`,
          data: {
            code: 'TEAM_MEMBER_LIMIT_EXCEEDED',
            current: limitCheck.current,
            limit: limitCheck.limit,
            plan: limitCheck.plan,
          },
        })
      }
    }

    // Check if user is already a member of the event
    const existingUser = await db
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(eq(user.email, email.toLowerCase()))
      .limit(1)

    if (existingUser.length) {
      const existingMember = await db
        .select()
        .from(eventUsers)
        .where(
          and(
            eq(eventUsers.eventId, eventRow.id),
            eq(eventUsers.userId, existingUser[0]!.id),
          ),
        )
        .limit(1)

      if (existingMember.length) {
        throw createError({
          statusCode: 400,
          statusMessage: 'User is already a member of this evento',
        })
      }
    }

    // Check for existing pending invitation
    const existingInvite = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.eventId, eventRow.id),
          eq(invitations.email, email.toLowerCase()),
          eq(invitations.status, 'pending'),
        ),
      )
      .limit(1)

    if (existingInvite.length) {
      throw createError({
        statusCode: 400,
        statusMessage: 'An invitation has already been sent to this email',
      })
    }

    // Generate secure token
    const token = crypto.randomUUID() + '-' + crypto.randomUUID()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS)

    // Create invitation record
    const invitationId = crypto.randomUUID()
    await db.insert(invitations).values({
      id: invitationId,
      eventId: eventRow.id,
      email: email.toLowerCase(),
      token,
      invitedById: currentUser.id,
      status: 'pending',
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Generate invite URL
    const baseUrl = runtimeConfig.public.baseURL || 'https://example.com'
    const inviteUrl = `${baseUrl}/invite/${token}`

    // Get inviter's name
    const inviterName = currentUser.name || currentUser.email || 'Un membro del team'

    // Render email
    const lang = (language === 'en' ? 'en' : 'it') as SupportedLanguage
    const emailHtml = await renderEventInviteEmail({
      language: lang,
      inviteUrl,
      eventName: eventRow.name,
      invitedByName: inviterName,
      expiresInDays: INVITE_EXPIRY_DAYS,
    })

    // Get subject
    const subjects = emailSubjects.eventInvite(eventRow.name)
    const subject = subjects[lang]

    // Send email
    const emailResponse = await getResendInstance().emails.send({
      from: getDefaultSender(),
      to: email,
      subject,
      html: emailHtml,
    })

    // Log audit event
    await logAudit(h3Event, 'team.member_invited', {
      eventId: eventRow.id,
      targetType: 'invitation',
      targetId: invitationId,
      status: emailResponse.error ? 'failure' : 'success',
      details: emailResponse.error
        ? { error: emailResponse.error.message }
        : { email: email.toLowerCase(), event: eventRow.name },
    })

    if (emailResponse.error) {
      console.error('[team.service] inviteMember email send failed:', emailResponse.error)
      return {
        success: true,
        email_sent: false,
        warning: 'Invitation created but email could not be sent. You can try resending later.',
        invitation: {
          id: invitationId,
          email: email.toLowerCase(),
          expires_at: expiresAt.toISOString(),
          created_at: new Date().toISOString(),
        },
      }
    }

    console.log(`[team.service] Successfully invited ${email} to event ${eventRow.name}`)

    return {
      success: true,
      email_sent: true,
      invitation: {
        id: invitationId,
        email: email.toLowerCase(),
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString(),
      },
    }
  } catch (e: any) {
    console.error('[team.service] inviteMember error:', e)
    if (e.statusCode) throw e
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to send invitation',
    })
  }
}

/**
 * Get invitation details by token (public endpoint).
 * Checks status (accepted/cancelled/expired) and auto-expires if needed.
 */
export async function getInvitationByToken(token: string) {
  const db = getDB()

  try {
    // Find invitation with event info
    const invitation = await db
      .select({
        id: invitations.id,
        email: invitations.email,
        status: invitations.status,
        expiresAt: invitations.expiresAt,
        createdAt: invitations.createdAt,
        eventId: invitations.eventId,
        eventName: events.name,
        invitedById: invitations.invitedById,
        invitedByName: user.name,
        invitedByEmail: user.email,
      })
      .from(invitations)
      .innerJoin(events, eq(invitations.eventId, events.id))
      .leftJoin(user, eq(invitations.invitedById, user.id))
      .where(eq(invitations.token, token))
      .limit(1)

    if (!invitation.length) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Invitation not found',
      })
    }

    const inv = invitation[0]!

    // Check if expired
    const isExpired = new Date(inv.expiresAt) < new Date()

    // Check status
    if (inv.status === 'accepted') {
      return {
        success: false,
        status: 'accepted',
        message: 'This invitation has already been accepted',
        event_name: inv.eventName,
      }
    }

    if (inv.status === 'cancelled') {
      return {
        success: false,
        status: 'cancelled',
        message: 'This invitation has been cancelled',
      }
    }

    if (isExpired || inv.status === 'expired') {
      // Update status to expired if not already
      if (inv.status !== 'expired') {
        await db
          .update(invitations)
          .set({ status: 'expired', updatedAt: new Date() })
          .where(eq(invitations.id, inv.id))
      }

      return {
        success: false,
        status: 'expired',
        message: 'This invitation has expired',
        event_name: inv.eventName,
      }
    }

    // Valid invitation
    return {
      success: true,
      status: 'pending',
      invitation: {
        id: inv.id,
        email: inv.email,
        event_id: inv.eventId,
        event_name: inv.eventName,
        invited_by: inv.invitedByName || inv.invitedByEmail || 'Un membro del team',
        expires_at: inv.expiresAt.toISOString(),
        created_at: inv.createdAt.toISOString(),
      },
    }
  } catch (e: any) {
    console.error('[team.service] getInvitationByToken error:', e)
    if (e.statusCode) throw e
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to get invitation',
    })
  }
}

/**
 * Cancel a pending invitation.
 * Permission check, status validation, update to cancelled, logAudit.
 */
export async function cancelInvitation(
  h3Event: H3Event<EventHandlerRequest>,
  userId: string,
  invitationId: string,
) {
  const db = getDB()

  try {
    // Fetch invitation
    const invitation = await db
      .select()
      .from(invitations)
      .where(eq(invitations.id, invitationId))
      .limit(1)

    if (!invitation.length) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Invitation not found',
      })
    }

    const invite = invitation[0]!

    // Only pending invitations can be cancelled
    if (invite.status !== 'pending') {
      throw createError({
        statusCode: 400,
        statusMessage: `Cannot cancel an invitation with status '${invite.status}'`,
      })
    }

    // Get event for permission check
    const eventRecord = await db
      .select({ id: events.id, name: events.name })
      .from(events)
      .where(eq(events.id, invite.eventId))
      .limit(1)

    if (!eventRecord.length) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Evento not found',
      })
    }

    const evt = eventRecord[0]!

    // Permission check
    const roleContext = await getUserRole(userId, evt.id)

    if (!roleContext) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Non sei membro di questo evento',
      })
    }

    if (!canManageTeam(roleContext.role)) {
      throw createError({
        statusCode: 403,
        statusMessage: 'You do not have permission to cancel invitations',
      })
    }

    // Cancel the invitation
    await db
      .update(invitations)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(eq(invitations.id, invitationId))

    // Audit log
    await logAudit(h3Event, 'team.invitation_canceled', {
      eventId: evt.id,
      targetType: 'invitation',
      targetId: invitationId,
      details: { email: invite.email, event: evt.name },
    })

    console.log(`[team.service] Cancelled invitation ${invitationId} for ${invite.email}`)

    return {
      success: true,
    }
  } catch (e: any) {
    console.error('[team.service] cancelInvitation error:', e)
    if (e.statusCode) throw e
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to cancel invitation',
    })
  }
}

/**
 * Resend a pending invitation.
 * Permission check, token refresh if expired, email resend, logAudit.
 */
export async function resendInvitation(
  h3Event: H3Event<EventHandlerRequest>,
  currentUser: { id: string; name?: string | null; email?: string | null },
  invitationId: string,
  input: ResendInviteInput,
) {
  const { language } = input
  const db = getDB()

  try {
    // Fetch invitation
    const invitation = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.id, invitationId),
          eq(invitations.status, 'pending'),
        ),
      )
      .limit(1)

    if (!invitation.length) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Invitation not found or not pending',
      })
    }

    const invite = invitation[0]!

    // Get event info
    const eventRecord = await db
      .select({ id: events.id, name: events.name, userId: events.userId })
      .from(events)
      .where(eq(events.id, invite.eventId))
      .limit(1)

    if (!eventRecord.length) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Evento not found',
      })
    }

    const evt = eventRecord[0]!

    // Permission check
    const roleContext = await getUserRole(currentUser.id, evt.id)

    if (!roleContext) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Non sei membro di questo evento',
      })
    }

    if (!canManageTeam(roleContext.role)) {
      throw createError({
        statusCode: 403,
        statusMessage: 'You do not have permission to resend invitations',
      })
    }

    // Check if expired -- if so, generate new token + expiry
    let token = invite.token
    const now = new Date()
    const isExpired = invite.expiresAt < now

    if (isExpired) {
      token = crypto.randomUUID() + '-' + crypto.randomUUID()
      const newExpiresAt = new Date()
      newExpiresAt.setDate(newExpiresAt.getDate() + INVITE_EXPIRY_DAYS)

      await db
        .update(invitations)
        .set({
          token,
          expiresAt: newExpiresAt,
          updatedAt: now,
        })
        .where(eq(invitations.id, invitationId))
    } else {
      // Just update updatedAt
      await db
        .update(invitations)
        .set({ updatedAt: now })
        .where(eq(invitations.id, invitationId))
    }

    // Build invite URL
    const baseUrl = runtimeConfig.public.baseURL || 'https://example.com'
    const inviteUrl = `${baseUrl}/invite/${token}`

    // Get inviter's name
    const inviterName = currentUser.name || currentUser.email || 'Un membro del team'

    // Render email
    const lang = (language === 'en' ? 'en' : 'it') as SupportedLanguage
    const emailHtml = await renderEventInviteEmail({
      language: lang,
      inviteUrl,
      eventName: evt.name,
      invitedByName: inviterName,
      expiresInDays: INVITE_EXPIRY_DAYS,
    })

    // Get subject
    const subjects = emailSubjects.eventInvite(evt.name)
    const subject = subjects[lang]

    // Send email
    const emailResponse = await getResendInstance().emails.send({
      from: getDefaultSender(),
      to: invite.email,
      subject,
      html: emailHtml,
    })

    // Audit log
    await logAudit(h3Event, 'team.invitation_resent', {
      eventId: evt.id,
      targetType: 'invitation',
      targetId: invitationId,
      status: emailResponse.error ? 'failure' : 'success',
      details: emailResponse.error
        ? { error: emailResponse.error.message }
        : { email: invite.email, event: evt.name, tokenRefreshed: isExpired },
    })

    if (emailResponse.error) {
      console.error('[team.service] resendInvitation email send failed:', emailResponse.error)
      return {
        success: true,
        email_sent: false,
        warning: 'Invitation exists but email could not be sent. Please try again later.',
      }
    }

    console.log(`[team.service] Successfully resent invitation to ${invite.email}`)

    return {
      success: true,
      email_sent: true,
      token_refreshed: isExpired,
    }
  } catch (e: any) {
    console.error('[team.service] resendInvitation error:', e)
    if (e.statusCode) throw e
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to resend invitation',
    })
  }
}

/**
 * Accept an event invitation by token.
 * Validates token, checks email match, adds user to event if not already a member.
 */
export async function acceptInvite(
  h3Event: H3Event<EventHandlerRequest>,
  userId: string,
  userEmail: string | undefined,
  input: AcceptInviteInput,
) {
  const db = getDB()

  try {
    // Find valid invitation
    const invitation = await db
      .select({
        id: invitations.id,
        email: invitations.email,
        eventId: invitations.eventId,
        eventName: events.name,
      })
      .from(invitations)
      .innerJoin(events, eq(invitations.eventId, events.id))
      .where(
        and(
          eq(invitations.token, input.token),
          eq(invitations.status, 'pending'),
          gt(invitations.expiresAt, new Date()),
        ),
      )
      .limit(1)

    if (!invitation.length) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid or expired invitation',
      })
    }

    const inv = invitation[0]!

    // Verify email matches
    if (inv.email.toLowerCase() !== userEmail?.toLowerCase()) {
      throw createError({
        statusCode: 403,
        statusMessage: 'This invitation was sent to a different email address',
      })
    }

    // Check if user is already a member
    const existingMember = await db
      .select()
      .from(eventUsers)
      .where(
        and(
          eq(eventUsers.eventId, inv.eventId),
          eq(eventUsers.userId, userId),
        ),
      )
      .limit(1)

    if (existingMember.length) {
      // Mark invitation as accepted anyway
      await db
        .update(invitations)
        .set({
          status: 'accepted',
          acceptedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(invitations.id, inv.id))

      await logAudit(h3Event, 'team.invite_accepted', {
        eventId: inv.eventId,
        targetType: 'invitation',
        targetId: inv.id,
        details: { alreadyMember: true, eventName: inv.eventName },
      })

      return {
        success: true,
        event_name: inv.eventName,
        message: 'You are already a member of this evento',
      }
    }

    // Add user to event with default viewer role
    await db.insert(eventUsers).values({
      id: crypto.randomUUID(),
      eventId: inv.eventId,
      userId,
      role: 'viewer',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Update invitation status
    await db
      .update(invitations)
      .set({
        status: 'accepted',
        acceptedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(invitations.id, inv.id))

    await logAudit(h3Event, 'team.invite_accepted', {
      eventId: inv.eventId,
      targetType: 'invitation',
      targetId: inv.id,
      details: { alreadyMember: false, eventName: inv.eventName },
    })

    return {
      success: true,
      event_name: inv.eventName,
      message: 'Successfully joined the evento',
    }
  } catch (e: any) {
    console.error('[team.service] acceptInvite error:', e)
    if (e.statusCode) throw e
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to accept invitation',
    })
  }
}

/**
 * Update an event member's role.
 * Validates permissions, prevents modifying owner's role.
 */
export async function updateMemberPermissions(
  h3Event: H3Event<EventHandlerRequest>,
  currentUserId: string,
  targetUserId: string,
  input: UpdatePermissionsInput,
) {
  const db = getDB()

  try {
    const eventRow = await requireTeamManagement(currentUserId)

    // Cannot modify owner's role
    if (targetUserId === eventRow.userId) {
      throw createError({
        statusCode: 400,
        statusMessage: "Non puoi modificare il ruolo del proprietario dell'evento",
      })
    }

    // Check if target user is a member
    const targetMember = await db
      .select({ id: eventUsers.id })
      .from(eventUsers)
      .where(
        and(
          eq(eventUsers.eventId, eventRow.id),
          eq(eventUsers.userId, targetUserId),
        ),
      )
      .limit(1)

    if (!targetMember.length) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Membro non trovato in questo evento',
      })
    }

    // Update role
    await db
      .update(eventUsers)
      .set({
        role: input.role,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(eventUsers.eventId, eventRow.id),
          eq(eventUsers.userId, targetUserId),
        ),
      )

    await logAudit(h3Event, 'team.permissions_updated', {
      eventId: eventRow.id,
      targetType: 'user',
      targetId: targetUserId,
      details: { newRole: input.role },
    })

    return {
      success: true,
      message: 'Ruolo aggiornato con successo',
    }
  } catch (e: any) {
    console.error('[team.service] updateMemberPermissions error:', e)
    if (e.statusCode) throw e
    throw createError({
      statusCode: 500,
      statusMessage: "Errore durante l'aggiornamento del ruolo",
    })
  }
}

/**
 * Remove a member from the event.
 * Validates permissions, prevents removing the owner.
 */
export async function removeMember(
  h3Event: H3Event<EventHandlerRequest>,
  currentUserId: string,
  targetUserId: string,
) {
  const db = getDB()

  const eventRow = await requireTeamManagement(currentUserId)

  // Cannot remove the owner
  if (targetUserId === eventRow.userId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Non puoi rimuovere il proprietario dell'evento",
    })
  }

  // Check if target user is a member
  const targetMember = await db
    .select({ id: eventUsers.id })
    .from(eventUsers)
    .where(
      and(
        eq(eventUsers.eventId, eventRow.id),
        eq(eventUsers.userId, targetUserId),
      ),
    )
    .limit(1)

  if (!targetMember.length) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Membro non trovato in questo evento',
    })
  }

  // Remove member
  await db
    .delete(eventUsers)
    .where(
      and(
        eq(eventUsers.eventId, eventRow.id),
        eq(eventUsers.userId, targetUserId),
      ),
    )

  await logAudit(h3Event, 'team.member_removed', {
    eventId: eventRow.id,
    targetType: 'user',
    targetId: targetUserId,
    details: { removedBy: currentUserId },
  })

  return {
    success: true,
  }
}
