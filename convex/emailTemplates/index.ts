// Email templates — React Email, "Soft Meadow" design system.
//
// Task 13 (migration) moved these from `server/emailTemplates/`. The move is not
// cosmetic: the templates are the same ones the legacy app sends, so the two
// deployments cannot drift, and the renderer no longer reads Nuxt runtime config
// (`useRuntimeConfig()` does not exist in Convex). Everything environmental —
// brand name, public URL, legal links — arrives as an explicit, validated prop:
// `renderEmail(request, brand)`.
//
// The legacy callers keep their own API through `server/emailTemplates/index.ts`,
// which is now a thin adapter that injects `useRuntimeConfig()` into this same
// renderer. One implementation, two configuration sources.

import { render } from "@react-email/render";
import * as React from "react";
import { ChangeEmailEmail } from "./ChangeEmailEmail";
import { ContactConfirmationEmail } from "./ContactConfirmationEmail";
import { ContactNotificationEmail } from "./ContactNotificationEmail";
import { EventCleanupWarning } from "./EventCleanupWarning";
import { GuestInviteEmail } from "./GuestInviteEmail";
import { GuestReminderEmail } from "./GuestReminderEmail";
import { OrgInviteEmail } from "./OrgInviteEmail";
import { ResetPasswordEmail } from "./ResetPasswordEmail";
import { VerificationEmail } from "./VerificationEmail";
import { WaitingListEmail } from "./WaitingListEmail";
import type { LegalLinks } from "./_softMeadow";
import { emailSubjects } from "../lib/emailSubjects";

export type SupportedLanguage = "it" | "en";

/** Rendered email: HTML plus the plain-text alternative (deliverability). */
export interface RenderedEmail {
    html: string;
    text: string;
}

/**
 * Everything the templates need that is *not* message content.
 *
 * `host` is derived here rather than passed by each caller: the footers show it,
 * and a caller that forgot it would render a footer with an empty host.
 */
export interface EmailBrand {
    appName: string;
    /** Absolute origin without trailing slash, e.g. `https://ceremly.com`. */
    siteUrl: string;
    /** Host only, e.g. `ceremly.com`, for the footers. */
    host: string;
    /**
     * Link legali, sempre presenti: i template li dichiarano obbligatori, e renderli
     * opzionali significherebbe un ramo di rendering che nessun ambiente prende (il
     * legacy li passava sempre). Le pagine esistono in ogni deploy.
     */
    legalLinks: LegalLinks;
}

export interface EmailBrandOptions {
    appName: string;
    siteUrl: string;
}

/** Host of a URL, or `""` when the input is not a URL (never throws here). */
function hostOf(siteUrl: string): string {
    try {
        return new URL(siteUrl).host;
    } catch {
        return "";
    }
}

export function resolveBrand(options: EmailBrandOptions): EmailBrand {
    const siteUrl = options.siteUrl.replace(/\/+$/, "");

    return {
        appName: options.appName,
        siteUrl,
        host: hostOf(siteUrl),
        legalLinks: {
            privacy: `${siteUrl}/legal/privacy`,
            tos: `${siteUrl}/legal/tos`,
            dpa: `${siteUrl}/legal/dpa`,
        },
    };
}

/**
 * One email, described by the data it needs — never by a pre-rendered HTML string.
 *
 * The union is the contract: adding a template means adding a variant here, and a
 * caller that sends the wrong props for a template is a type error at the call site
 * and an argument-validation error at the Convex boundary (`convex/email.ts`
 * mirrors this union in `v.*` validators), not a blank email at runtime.
 *
 * `subject` is required for the two guest templates because the subject comes from
 * the organizer's copy (event distribution / reminder), not from the app.
 */
export type EmailRequest =
    | { template: "verification"; language?: SupportedLanguage; verificationUrl: string; userName?: string }
    | { template: "reset-password"; language?: SupportedLanguage; resetUrl: string; userName?: string }
    | {
          template: "change-email";
          language?: SupportedLanguage;
          confirmUrl: string;
          newEmail: string;
          userName?: string;
      }
    | { template: "waiting-list"; language?: SupportedLanguage }
    | {
          template: "org-invite";
          language?: SupportedLanguage;
          inviteUrl: string;
          orgName: string;
          invitedByName: string;
          expiresInDays?: number;
      }
    | {
          template: "guest-invite";
          subject: string;
          eventTitle: string;
          firstName: string;
          message: string;
          ctaUrl: string;
          pixelUrl: string;
      }
    | {
          template: "guest-reminder";
          subject: string;
          eventTitle: string;
          firstName: string;
          message: string;
          ctaUrl: string;
          pixelUrl: string;
      }
    | {
          template: "event-cleanup-warning";
          language?: SupportedLanguage;
          eventTitle: string;
          dashboardUrl: string;
          daysLeft: number;
      }
    | {
          template: "contact-confirmation";
          language?: SupportedLanguage;
          userName: string;
          subject: string;
      }
    | {
          template: "contact-notification";
          senderName: string;
          senderEmail: string;
          subject: string;
          message: string;
          language: string;
          submittedAt: string;
      };

/**
 * Gli oggetti vivono in `convex/lib/emailSubjects.ts` (modulo senza dipendenze):
 * chi costruisce un job deve poterli leggere senza importare React. Qui vengono
 * solo riesportati, così un chiamante che ha già il renderer li trova nello stesso
 * posto dei template.
 */
export { emailSubjects };

const languageOf = (value: SupportedLanguage | undefined): SupportedLanguage =>
    value === "en" ? "en" : "it";

/** Subject + element for one request. Kept together: a subject is not a separate concern. */
function buildRequest(
    request: EmailRequest,
    brand: EmailBrand,
): { subject: string; element: React.ReactElement } {
    const appName = brand.appName;

    switch (request.template) {
        case "verification": {
            const language = languageOf(request.language);
            return {
                subject: emailSubjects.verification[language],
                element: React.createElement(VerificationEmail, {
                    language,
                    verificationUrl: request.verificationUrl,
                    userName: request.userName,
                    appName,
                    legalLinks: brand.legalLinks,
                }),
            };
        }

        case "reset-password": {
            const language = languageOf(request.language);
            return {
                subject: emailSubjects.resetPassword[language],
                element: React.createElement(ResetPasswordEmail, {
                    language,
                    resetUrl: request.resetUrl,
                    userName: request.userName,
                    appName,
                    legalLinks: brand.legalLinks,
                }),
            };
        }

        case "change-email": {
            const language = languageOf(request.language);
            return {
                subject: emailSubjects.changeEmail[language],
                element: React.createElement(ChangeEmailEmail, {
                    language,
                    confirmUrl: request.confirmUrl,
                    newEmail: request.newEmail,
                    userName: request.userName,
                    appName,
                    legalLinks: brand.legalLinks,
                }),
            };
        }

        case "waiting-list": {
            const language = languageOf(request.language);
            return {
                subject: emailSubjects.waitingList[language],
                element: React.createElement(WaitingListEmail, {
                    language,
                    appName,
                    siteUrl: brand.siteUrl,
                    legalLinks: brand.legalLinks,
                }),
            };
        }

        case "org-invite": {
            const language = languageOf(request.language);
            return {
                subject: emailSubjects.orgInvite(request.orgName)[language],
                element: React.createElement(OrgInviteEmail, {
                    language,
                    inviteUrl: request.inviteUrl,
                    orgName: request.orgName,
                    invitedByName: request.invitedByName,
                    expiresInDays: request.expiresInDays ?? 7,
                    appName,
                    legalLinks: brand.legalLinks,
                }),
            };
        }

        case "guest-invite":
            return {
                subject: request.subject,
                element: React.createElement(GuestInviteEmail, {
                    eventTitle: request.eventTitle,
                    firstName: request.firstName,
                    message: request.message,
                    ctaUrl: request.ctaUrl,
                    pixelUrl: request.pixelUrl,
                    appName,
                    appHost: brand.host,
                }),
            };

        case "guest-reminder":
            return {
                subject: request.subject,
                element: React.createElement(GuestReminderEmail, {
                    eventTitle: request.eventTitle,
                    firstName: request.firstName,
                    message: request.message,
                    ctaUrl: request.ctaUrl,
                    pixelUrl: request.pixelUrl,
                    appName,
                    appHost: brand.host,
                }),
            };

        case "event-cleanup-warning": {
            const language = languageOf(request.language);
            return {
                subject: emailSubjects.eventCleanupWarning(request.eventTitle)[language],
                element: React.createElement(EventCleanupWarning, {
                    language,
                    eventTitle: request.eventTitle,
                    dashboardUrl: request.dashboardUrl,
                    daysLeft: request.daysLeft,
                    appName,
                    appHost: brand.host,
                }),
            };
        }

        case "contact-confirmation": {
            const language = languageOf(request.language);
            return {
                subject: emailSubjects.contactConfirmation[language],
                element: React.createElement(ContactConfirmationEmail, {
                    language,
                    userName: request.userName,
                    subject: request.subject,
                    siteUrl: brand.siteUrl,
                    appName,
                }),
            };
        }

        case "contact-notification":
            return {
                subject: emailSubjects.contactNotification(request.subject),
                element: React.createElement(ContactNotificationEmail, {
                    senderName: request.senderName,
                    senderEmail: request.senderEmail,
                    subject: request.subject,
                    message: request.message,
                    language: request.language,
                    submittedAt: request.submittedAt,
                    appName,
                }),
            };
    }
}

/** Renders HTML, plain text and the subject for one request. */
export async function renderEmail(
    request: EmailRequest,
    brand: EmailBrand,
): Promise<RenderedEmail & { subject: string }> {
    const { subject, element } = buildRequest(request, brand);

    return {
        subject,
        html: await render(element),
        text: await render(element, { plainText: true }),
    };
}
