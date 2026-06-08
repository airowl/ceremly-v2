---
title: "Getting Started with the SaaS Boilerplate"
description: "A quick tour of what comes pre-wired in this multi-tenant SaaS boilerplate and how to ship your product faster."
date: "2026-01-15"
tags:
  - boilerplate
  - getting-started
author: "The Team"
featured: true
published: true
locale: "en"
translationSlug: "getting-started"
---

## Welcome

This SaaS boilerplate gives you a multi-tenant foundation out of the box: organizations, teams, role-based access, subscriptions and authentication. You focus on your product; the infrastructure is already wired.

## What's included

- **Organizations & teams** — B2B-first tenancy with members, roles and invitations.
- **Billing** — recurring subscriptions, plans and per-plan limits.
- **Auth** — email/password, Google OAuth and two-factor authentication.
- **Serverless by design** — Vercel deploy, Neon serverless database, HTTP work queues and managed cron.

## Next steps

Clone the repository, set `NUXT_PUBLIC_APP_NAME` and the rest of your environment variables, run the migrations and start the dev server. From there, replicate the example `projects` entity to model your own org-scoped resources.

Happy shipping.
