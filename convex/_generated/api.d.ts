/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as crons from "../crons.js";
import type * as dataExports from "../dataExports.js";
import type * as email from "../email.js";
import type * as emailEvents from "../emailEvents.js";
import type * as emailTemplates_ChangeEmailEmail from "../emailTemplates/ChangeEmailEmail.js";
import type * as emailTemplates_ContactConfirmationEmail from "../emailTemplates/ContactConfirmationEmail.js";
import type * as emailTemplates_ContactNotificationEmail from "../emailTemplates/ContactNotificationEmail.js";
import type * as emailTemplates_EventCleanupWarning from "../emailTemplates/EventCleanupWarning.js";
import type * as emailTemplates_GuestInviteEmail from "../emailTemplates/GuestInviteEmail.js";
import type * as emailTemplates_GuestReminderEmail from "../emailTemplates/GuestReminderEmail.js";
import type * as emailTemplates_OrgInviteEmail from "../emailTemplates/OrgInviteEmail.js";
import type * as emailTemplates_ResetPasswordEmail from "../emailTemplates/ResetPasswordEmail.js";
import type * as emailTemplates_VerificationEmail from "../emailTemplates/VerificationEmail.js";
import type * as emailTemplates_WaitingListEmail from "../emailTemplates/WaitingListEmail.js";
import type * as emailTemplates__softMeadow from "../emailTemplates/_softMeadow.js";
import type * as emailTemplates_index from "../emailTemplates/index.js";
import type * as events from "../events.js";
import type * as files from "../files.js";
import type * as guests from "../guests.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as jobs from "../jobs.js";
import type * as lib_adminGuards from "../lib/adminGuards.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_authorization from "../lib/authorization.js";
import type * as lib_bridgeHmac from "../lib/bridgeHmac.js";
import type * as lib_domain from "../lib/domain.js";
import type * as lib_domainBatchDigest from "../lib/domainBatchDigest.js";
import type * as lib_emailSubjects from "../lib/emailSubjects.js";
import type * as lib_env from "../lib/env.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_identity from "../lib/identity.js";
import type * as lib_invitationToken from "../lib/invitationToken.js";
import type * as lib_inviteTemplates from "../lib/inviteTemplates.js";
import type * as lib_jobQueue from "../lib/jobQueue.js";
import type * as lib_limitOverrides from "../lib/limitOverrides.js";
import type * as lib_magicBytes from "../lib/magicBytes.js";
import type * as lib_media from "../lib/media.js";
import type * as lib_migrationKey from "../lib/migrationKey.js";
import type * as lib_previewToken from "../lib/previewToken.js";
import type * as lib_pricing from "../lib/pricing.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_rsvpLogic from "../lib/rsvpLogic.js";
import type * as lib_rsvpPresets from "../lib/rsvpPresets.js";
import type * as lib_spam from "../lib/spam.js";
import type * as lib_storageBridge from "../lib/storageBridge.js";
import type * as lib_svix from "../lib/svix.js";
import type * as lib_writeGuard from "../lib/writeGuard.js";
import type * as media from "../media.js";
import type * as migrations_authImport from "../migrations/authImport.js";
import type * as migrations_billingImport from "../migrations/billingImport.js";
import type * as migrations_domainImport from "../migrations/domainImport.js";
import type * as migrations_reconcileSnapshot from "../migrations/reconcileSnapshot.js";
import type * as model_validators from "../model/validators.js";
import type * as organizations from "../organizations.js";
import type * as profile from "../profile.js";
import type * as projects from "../projects.js";
import type * as publicForms from "../publicForms.js";
import type * as reminders from "../reminders.js";
import type * as rsvp from "../rsvp.js";
import type * as siteSettings from "../siteSettings.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  auth: typeof auth;
  billing: typeof billing;
  crons: typeof crons;
  dataExports: typeof dataExports;
  email: typeof email;
  emailEvents: typeof emailEvents;
  "emailTemplates/ChangeEmailEmail": typeof emailTemplates_ChangeEmailEmail;
  "emailTemplates/ContactConfirmationEmail": typeof emailTemplates_ContactConfirmationEmail;
  "emailTemplates/ContactNotificationEmail": typeof emailTemplates_ContactNotificationEmail;
  "emailTemplates/EventCleanupWarning": typeof emailTemplates_EventCleanupWarning;
  "emailTemplates/GuestInviteEmail": typeof emailTemplates_GuestInviteEmail;
  "emailTemplates/GuestReminderEmail": typeof emailTemplates_GuestReminderEmail;
  "emailTemplates/OrgInviteEmail": typeof emailTemplates_OrgInviteEmail;
  "emailTemplates/ResetPasswordEmail": typeof emailTemplates_ResetPasswordEmail;
  "emailTemplates/VerificationEmail": typeof emailTemplates_VerificationEmail;
  "emailTemplates/WaitingListEmail": typeof emailTemplates_WaitingListEmail;
  "emailTemplates/_softMeadow": typeof emailTemplates__softMeadow;
  "emailTemplates/index": typeof emailTemplates_index;
  events: typeof events;
  files: typeof files;
  guests: typeof guests;
  health: typeof health;
  http: typeof http;
  jobs: typeof jobs;
  "lib/adminGuards": typeof lib_adminGuards;
  "lib/audit": typeof lib_audit;
  "lib/authorization": typeof lib_authorization;
  "lib/bridgeHmac": typeof lib_bridgeHmac;
  "lib/domain": typeof lib_domain;
  "lib/domainBatchDigest": typeof lib_domainBatchDigest;
  "lib/emailSubjects": typeof lib_emailSubjects;
  "lib/env": typeof lib_env;
  "lib/functions": typeof lib_functions;
  "lib/identity": typeof lib_identity;
  "lib/invitationToken": typeof lib_invitationToken;
  "lib/inviteTemplates": typeof lib_inviteTemplates;
  "lib/jobQueue": typeof lib_jobQueue;
  "lib/limitOverrides": typeof lib_limitOverrides;
  "lib/magicBytes": typeof lib_magicBytes;
  "lib/media": typeof lib_media;
  "lib/migrationKey": typeof lib_migrationKey;
  "lib/previewToken": typeof lib_previewToken;
  "lib/pricing": typeof lib_pricing;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/rsvpLogic": typeof lib_rsvpLogic;
  "lib/rsvpPresets": typeof lib_rsvpPresets;
  "lib/spam": typeof lib_spam;
  "lib/storageBridge": typeof lib_storageBridge;
  "lib/svix": typeof lib_svix;
  "lib/writeGuard": typeof lib_writeGuard;
  media: typeof media;
  "migrations/authImport": typeof migrations_authImport;
  "migrations/billingImport": typeof migrations_billingImport;
  "migrations/domainImport": typeof migrations_domainImport;
  "migrations/reconcileSnapshot": typeof migrations_reconcileSnapshot;
  "model/validators": typeof model_validators;
  organizations: typeof organizations;
  profile: typeof profile;
  projects: typeof projects;
  publicForms: typeof publicForms;
  reminders: typeof reminders;
  rsvp: typeof rsvp;
  siteSettings: typeof siteSettings;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  creem: import("@creem_io/convex/_generated/component.js").ComponentApi<"creem">;
};
