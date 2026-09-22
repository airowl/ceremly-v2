/**
 * Oggetti delle email, in un modulo **senza dipendenze** (plan Task 13).
 *
 * Vive separato da `convex/emailTemplates/index.ts` perché chi costruisce un job
 * (runtime V8) deve poter calcolare l'oggetto di fallback di un invito senza
 * importare il renderer: quel modulo tira dentro `@react-email/render` e `react`,
 * che sono Node-only, e importarli da una funzione V8 significherebbe trascinare
 * React nel bundle di ogni invocazione — o fallire a runtime.
 *
 * Gli stessi testi sono quelli del legacy: le email che partono dopo il cutover
 * devono avere l'oggetto che l'utente ha già visto.
 */

export type SubjectLanguage = "it" | "en";

export const emailSubjects = {
    verification: { it: "Confermiamo che sei tu", en: "Let's confirm it's you" },
    resetPassword: { it: "Reimposta la password", en: "Reset your password" },
    changeEmail: { it: "Confermi il nuovo indirizzo?", en: "Confirm your new address?" },
    waitingList: { it: "Ci sei. Ti avvisiamo noi.", en: "You're in. We'll be in touch." },
    contactConfirmation: { it: "Ci pensiamo noi", en: "We're on it" },
    contactNotification: (subject: string) => `[Contatto] ${subject}`,
    orgInvite: (orgName: string) => ({
        it: `Ti hanno invitato nel team — ${orgName}`,
        en: `You're invited to the team — ${orgName}`,
    }),
    // Ceremly (solo italiano, SPEC §0): fallback quando l'organizzatore non ha
    // definito un oggetto in event.distribution / nel reminder.
    guestInvite: (eventTitle: string) => `Sei invitato: ${eventTitle}`,
    guestReminder: (eventTitle: string) => `Promemoria — ${eventTitle}`,
    eventCleanupWarning: (eventTitle: string) => ({
        it: `Stiamo per archiviare "${eventTitle}"`,
        en: `We're about to archive "${eventTitle}"`,
    }),
} as const;
