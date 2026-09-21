/**
 * Template invito Ceremly — re-export del modulo Convex.
 *
 * Task 11: la sorgente è `convex/lib/inviteTemplates.ts`, perché è Convex a
 * espandere il template in blocchi alla creazione dell'evento (`api.events.create`).
 * Un mirror dentro `convex/` avrebbe prodotto due copie dello stesso contenuto di
 * prodotto, con il rischio silenzioso che l'editor e il backend espandessero
 * default diversi. Questo file esiste solo per non cambiare gli import del client.
 */
export * from "../../convex/lib/inviteTemplates";
