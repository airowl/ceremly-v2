/**
 * Audit Log Type System
 * Taxonomy: resource.verb naming convention
 */

export const AUDIT_CATEGORIES = {
  auth: 'auth',
  payment: 'payment',
  email: 'email',
  file: 'file',
  team: 'team',
  page: 'page',
  event: 'event',
  guest: 'guest',
  reminder: 'reminder',
  landing: 'landing',
  registration: 'registration',
  contact: 'contact',
  waiting_list: 'waiting_list',
  user: 'user',
  admin: 'admin',
  security: 'security',
  template: 'template',
} as const

export type AuditCategory = typeof AUDIT_CATEGORIES[keyof typeof AUDIT_CATEGORIES]

export const AUDIT_ACTIONS = {
  // Auth
  'auth.signed_in': 'auth.signed_in',
  'auth.signed_up': 'auth.signed_up',
  'auth.password_reset_requested': 'auth.password_reset_requested',
  'auth.password_reset_completed': 'auth.password_reset_completed',
  'auth.oauth_callback': 'auth.oauth_callback',
  'auth.tos_accepted': 'auth.tos_accepted',
  'auth.failed': 'auth.failed',

  // Payment - subscriptions
  'subscription.created': 'subscription.created',
  'subscription.updated': 'subscription.updated',
  'subscription.canceled': 'subscription.canceled',
  'subscription.deleted': 'subscription.deleted',
  'checkout.completed': 'checkout.completed',
  'customer.created': 'customer.created',

  // Page
  'page.created': 'page.created',
  'page.updated': 'page.updated',
  'page.deleted': 'page.deleted',
  'page.published': 'page.published',
  'page.restored': 'page.restored',

  // Team
  'team.member_invited': 'team.member_invited',
  'team.invitation_canceled': 'team.invitation_canceled',
  'team.invitation_resent': 'team.invitation_resent',
  'team.invite_accepted': 'team.invite_accepted',
  'team.permissions_updated': 'team.permissions_updated',
  'team.member_removed': 'team.member_removed',

  // File
  'file.uploaded': 'file.uploaded',
  'file.deleted': 'file.deleted',
  'file.presign_requested': 'file.presign_requested',
  'file.upload_confirmed': 'file.upload_confirmed',
  'file.dedup_matched': 'file.dedup_matched',

  // Email
  'email.sent': 'email.sent',
  'email.failed': 'email.failed',

  // Event
  'event.created': 'event.created',
  'event.updated': 'event.updated',
  'event.deleted': 'event.deleted',

  // Guest
  'guest.created': 'guest.created',
  'guest.updated': 'guest.updated',
  'guest.deleted': 'guest.deleted',
  'guest.imported': 'guest.imported',
  'guest.registered': 'guest.registered',
  'guest.rsvp_responded': 'guest.rsvp_responded',

  // Reminder
  'reminder.template_created': 'reminder.template_created',
  'reminder.template_updated': 'reminder.template_updated',
  'reminder.template_deleted': 'reminder.template_deleted',
  'reminder.template_toggled': 'reminder.template_toggled',
  'reminder.sent': 'reminder.sent',

  // Landing
  'landing.updated': 'landing.updated',
  'registration.updated': 'registration.updated',

  // Contact
  'contact.sent': 'contact.sent',

  // Waiting List
  'waiting_list.subscribed': 'waiting_list.subscribed',

  // User
  'user.profile_updated': 'user.profile_updated',
  'user.account_deleted': 'user.account_deleted',
  'user.data_export_requested': 'user.data_export_requested',

  // Template
  'template.created': 'template.created',
  'template.updated': 'template.updated',
  'template.deleted': 'template.deleted',
  'template.applied': 'template.applied',
  'template.ai_generated': 'template.ai_generated',

  // Admin
  'admin.user_role_changed': 'admin.user_role_changed',
  'admin.user_banned': 'admin.user_banned',
  'admin.user_unbanned': 'admin.user_unbanned',
  'admin.user_limits_updated': 'admin.user_limits_updated',
  'admin.subscription_updated': 'admin.subscription_updated',
  'admin.cleanup_files': 'admin.cleanup_files',
} as const

export type AuditAction = typeof AUDIT_ACTIONS[keyof typeof AUDIT_ACTIONS]

/**
 * Derive category from action prefix (e.g. 'auth.signed_in' -> 'auth')
 */
export function getCategoryFromAction(action: AuditAction): AuditCategory {
  const prefix = action.split('.')[0]
  // Map payment-related prefixes
  if (prefix === 'subscription' || prefix === 'checkout' || prefix === 'customer') {
    return 'payment'
  }
  // Map team-related actions
  if (prefix === 'team') {
    return 'team'
  }
  return prefix as AuditCategory
}

export interface LogAuditOptions {
  userId?: string
  eventId?: string
  targetType?: string
  targetId?: string
  ipAddress?: string
  userAgent?: string
  status?: 'success' | 'failure' | 'pending'
  details?: Record<string, unknown>
}
