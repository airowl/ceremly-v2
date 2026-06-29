---
title: "Ceremly — SaaS Platform for Event Invitation & RSVP Management"
slug: "ceremly-piattaforma-saas-per-la-gestione-di-inviti-ed-rsvp"
titleIt: "Ceremly"
titleEn: "Ceremly"
author: ""
techStack:
  - vue
  - nuxt
  - postgresql
  - NeonDB
  - drizzle ORM
  - Creem
websiteLive: "https://www.ceremly.com"
github: ""
coverImage: "https://www.ceremly.com/ogImage-it.png"
images:
  - "https://www.ceremly.com/ogImage-it.png"
  - "https://www.ceremly.com/og/how-it-works-it.png"
  - "https://www.ceremly.com/og/features-it.png"
  - "https://www.ceremly.com/og/templates-it.png"
  - "https://www.ceremly.com/og/examples-it.png"
---

## Intro (IT)

Ceremly è una piattaforma SaaS che centralizza la gestione delle conferme di partecipazione per eventi privati nel mercato italiano — matrimoni, compleanni, lauree, battesimi. L'organizzatore carica gli invitati via CSV (o li inserisce manualmente) e genera per ciascuno un link di invito/RSVP personalizzato, gestisce le conferme in tempo reale da una dashboard dedicata, e sollecita chi non ha ancora risposto via email (invio automatico) o WhatsApp (messaggio pre-compilato da copiare e inviare). La pagina di invito è personalizzabile tramite un editor visuale a blocchi, con tema (colori e font) interamente configurabile.

## Intro (EN)

Ceremly is a SaaS platform that centralizes attendance management for private events in the Italian market — weddings, birthdays, graduations, and celebrations. Organizers import guests via CSV (or add them manually) and generate a personalized invitation/RSVP link for each one, track responses in real time from a unified dashboard, and follow up with non-respondents via email (automated send) or WhatsApp (a pre-filled message to copy and send). The invitation page is customizable through a visual block editor, with a fully configurable theme (colors and fonts).

## Description (IT)

### Introduzione

Ceremly nasce da un'osservazione semplice ma concreta: in Italia, chi organizza un evento privato — un matrimonio, un compleanno, una laurea — gestisce ancora le conferme di partecipazione nel modo più caotico possibile. Telefonate sparse, messaggi WhatsApp individuali, fogli Excel aggiornati a mano. Non c'è visibilità su chi ha risposto e chi no, e sollecitare le persone che non si fanno vive è al tempo stesso tedioso e socialmente scomodo.

Ho progettato e sviluppato Ceremly per risolvere questo problema end-to-end: una piattaforma SaaS che centralizza l'intero flusso, dalla gestione degli invitati alla raccolta delle conferme, fino ai solleciti tramite email e WhatsApp.

### Cosa fa il prodotto

L'organizzatore crea il proprio evento e popola la lista invitati importandola via CSV o inserendo i guest manualmente; per ciascun invitato viene generato un link di invito/RSVP personalizzato (token univoco). I link si distribuiscono via email (invio automatizzato con Resend) oppure tramite un messaggio WhatsApp pre-compilato da copiare e inviare. Tutti gli invitati confluiscono in un'unica dashboard dove sono visibili, filtrabili e gestibili, con lo stato delle risposte aggiornato in tempo reale.

Il cuore differenziatore del prodotto è l'area solleciti: una sezione dedicata che mostra chi non ha ancora risposto e permette di inviare reminder via email o di copiare un messaggio WhatsApp pronto, con template personalizzabili a variabili dinamiche interpolate automaticamente (`{nome}` del guest e `{link}` RSVP personale).

La pagina pubblica di invito/RSVP — quella che ogni guest apre dal proprio link personale — è personalizzabile tramite un editor visuale a blocchi ispirato al theme customizer di Shopify: sezioni riordinabili, configuratore visuale per ogni sezione e anteprima live. Il tema è interamente configurabile (colori liberi e catalogo di font self-hosted, con controllo di contrasto WCAG) e le domande RSVP — costruite con un editor drag & drop (vuedraggable) — supportano logica condizionale.

### Stack tecnico e architettura

Il progetto è costruito interamente su Nuxt 4 con Vue 3 (TypeScript strict, Composition API, `<script setup>`), con un'architettura backend a thin controller + service layer che mantiene le route API snelle e delega tutta la business logic a service dedicati. Il database è PostgreSQL (Neon serverless) gestito con Drizzle ORM type-safe, con UUID v7 e migrazioni versionabili.

L'autenticazione è gestita da Better Auth v1.4.5 con email/password, Google OAuth e 2FA, con sessioni cachate su Redis. I pagamenti sono integrati con Creem (Merchant of Record, plugin nativo Better Auth), con webhook auto-registrati e gestione completa del ciclo di abbonamento. I file sono storati su Cloudflare R2 con deduplicazione SHA-256, validazione magic bytes e rate limiting. Le email transazionali usano Resend con template React Email internazionalizzati.

La configurazione di evento, tema e domande RSVP è modellata con schemi Zod (sezioni e dati salvati come blocchi jsonb) che garantiscono validazione type-safe end-to-end tra client e server. Le pagine di invito sono accessibili solo tramite token univoco per-guest, con anteprima protetta da link firmato HMAC.

La sicurezza è trattata come requisito primario: CSP, HSTS, rate limiting granulare, spam protection con honeypot e timing validation, isolamento dati multi-tenant con RBAC (owner/admin/member), validazione Zod su ogni input e audit logging su tutte le operazioni di scrittura.

## Description (EN)

### Introduction

Ceremly was born out of a straightforward observation: in Italy, people organizing private events — weddings, milestone birthdays, graduation parties — still manage attendance confirmations in the most chaotic way imaginable. Scattered phone calls, individual WhatsApp messages, manually updated spreadsheets. There's no visibility into who has responded and who hasn't, and following up with non-respondents is both tedious and socially awkward.

I designed and built Ceremly to solve this problem end-to-end: a SaaS platform that centralizes the entire flow, from guest management through response collection and automated follow-up reminders via email and WhatsApp.

### What the product does

Organizers create their event and populate the guest list by importing it via CSV or adding guests manually; each guest gets a personalized invitation/RSVP link (a unique token). Links are distributed via email (automated send with Resend) or through a pre-filled WhatsApp message to copy and send. All guests converge into a single dashboard where they are visible, filterable, and manageable, with response status updated in real time.

The product's core differentiator is the reminders area: a dedicated section that surfaces every non-respondent and lets you send email reminders or copy a ready-to-send WhatsApp message, using customizable templates with automatically interpolated dynamic variables (`{nome}` for the guest's name and `{link}` for the personal RSVP link).

The public invitation/RSVP page — the one each guest opens from their personal link — is customizable through a visual block editor inspired by Shopify's theme customizer: reorderable sections, a visual configurator per section, and live preview. The theme is fully configurable (free colors and a catalog of self-hosted fonts, with WCAG contrast checking), and the RSVP questions — built with a drag & drop editor (vuedraggable) — support conditional logic.

### Technical stack and architecture

The project is built entirely on Nuxt 4 with Vue 3 (strict TypeScript, Composition API, `<script setup>`), with a backend architecture based on thin controllers and a dedicated service layer that keeps API routes lean while delegating all business logic to purpose-built services. The database is PostgreSQL (Neon serverless) managed with type-safe Drizzle ORM, with UUID v7 and versionable migrations.

Authentication is handled by Better Auth v1.4.5 with email/password, Google OAuth, and 2FA, with sessions cached in Redis. Payments are integrated with Creem (Merchant of Record, native Better Auth plugin), with auto-registered webhooks and full subscription lifecycle management. Files are stored on Cloudflare R2 with SHA-256 deduplication, magic bytes validation, and rate limiting. Transactional emails use Resend with internationalized React Email templates.

Event, theme, and RSVP-question configuration is modeled with Zod schemas (sections and data stored as jsonb blocks) that guarantee type-safe validation end-to-end between client and server. Invitation pages are accessible only through a unique per-guest token, with preview protected by an HMAC-signed link.

Security is treated as a first-class requirement: CSP, HSTS, granular rate limiting, spam protection with honeypot and timing validation, multi-tenant data isolation with RBAC (owner/admin/member), Zod validation on every input, and audit logging across all write operations.
