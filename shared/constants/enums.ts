// Guest statuses
export const GUEST_STATUSES = ["pending", "yes", "no"] as const;
export type GuestStatus = typeof GUEST_STATUSES[number];

// Guest sources
export const GUEST_SOURCES = ["manual", "csv", "registration"] as const;
export type GuestSource = typeof GUEST_SOURCES[number];

// Reminder template types
export const REMINDER_TYPES = ["email", "whatsapp"] as const;
export type ReminderType = typeof REMINDER_TYPES[number];

// Email log types
export const EMAIL_LOG_TYPES = ["invitation", "reminder", "registration_confirm"] as const;
export type EmailLogType = typeof EMAIL_LOG_TYPES[number];

// Email delivery statuses
export const EMAIL_STATUSES = ["sent", "delivered", "bounced", "failed"] as const;
export type EmailStatus = typeof EMAIL_STATUSES[number];

// Landing section types
export const LANDING_SECTION_TYPES = [
  "hero",
  "details",
  "story",
  "countdown",
  "gallery",
  "rsvp",
  "registration_form",
  "map",
  "footer",
] as const;
export type LandingSectionType = typeof LANDING_SECTION_TYPES[number];

// Landing font families
export const LANDING_FONTS = ["inter", "playfair", "montserrat", "lora", "roboto"] as const;
export type LandingFont = typeof LANDING_FONTS[number];

// Landing border radius options
export const LANDING_BORDER_RADIUS = ["none", "sm", "md", "lg", "full"] as const;
export type LandingBorderRadius = typeof LANDING_BORDER_RADIUS[number];

// Event template categories
export const TEMPLATE_CATEGORIES = [
  "wedding", "birthday", "corporate", "conference", "networking", "party", "other",
] as const;
export type TemplateCategory = typeof TEMPLATE_CATEGORIES[number];
