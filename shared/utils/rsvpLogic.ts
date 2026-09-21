/**
 * Logica condizionale del form RSVP — re-export del modulo Convex.
 *
 * Task 11: la sorgente è `convex/lib/rsvpLogic.ts`. La funzione resta condivisa
 * col client (il renderer la usa per la visibilità delle domande), ma la
 * validazione autoritativa gira nella mutation Convex che scrive la risposta —
 * quindi il modulo vive dove viene eseguito il controllo di sicurezza.
 */
export * from "../../convex/lib/rsvpLogic";
