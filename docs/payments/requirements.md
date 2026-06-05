# Payment Integration Requirements
<!-- Last updated: 2026-02-21 by Claude Code -->
<!-- Migrated: Stripe + Polar → Creem (single provider) -->

## Overview

Il progetto usa **Creem** come unico payment provider, integrato tramite il plugin `@creem_io/better-auth`.

- **Creem** - Payment provider con MoR (Merchant of Record)
- **Better Auth plugin** - `creem()` plugin con `persistSubscriptions: true`
- **Webhook**: auto-registrato a `/api/auth/creem/webhook`

## Current Implementation

### Single Provider (Creem) ✅
- No env var selector (Creem only)
- Auto-sync subscriptions via webhook (`persistSubscriptions: true`)
- Customer portal per upgrade/downgrade/cancel e gestione metodi di pagamento
- `creemCustomerId` aggiunto automaticamente alla tabella `user`

### Subscription Plans ✅
| Plan | Slug Monthly | Slug Yearly | Monthly (EUR) | Yearly (EUR) |
|------|-------------|-------------|---------------|--------------|
| Starter | `starter-monthly` | `starter-yearly` | €9 | €90 |
| Premium | `premium-monthly` | `premium-yearly` | €39 | €390 |
| Agency | `agency-monthly` | `agency-yearly` | €49 | €490 |

### Plan Limits ✅
| Plan | Events | Guests/Event | Emails/Month | Storage | Team Members |
|------|--------|-------------|--------------|---------|-------------|
| `starter` | 2 | 50 | 200 | 500 MB | 1 |
| `premium` | 5 | 350 | 2,000 | 2 GB | 5 |
| `agency` | Unlimited | Unlimited | Unlimited | 10 GB | Unlimited |

## Architecture

### File Structure
```
server/
├── utils/
│   ├── creem.ts            → Creem plugin configuration + webhook handlers
│   ├── auth.ts             → Better Auth config (loads creem plugin)
│   └── runtimeConfig.ts    → Env vars mapping (Creem section)
├── services/
│   └── planLimit.service.ts → Plan limit checking + downgrade validation
├── database/schema/
│   └── auth.ts             → creem_subscription table, user.creemCustomerId
└── api/
    └── limits/
        ├── index.get.ts            → Get plan limits + usage
        └── validate-downgrade.post.ts → Validate downgrade safety

shared/
└── constants/
    └── pricing.ts          → Plan configs, limits, features, prices

app/
├── composables/
│   ├── useSubscription.ts  → Creem subscription management
│   ├── useAuth.ts          → Auth with creemClient plugin
│   └── usePricing.ts       → Static pricing data from shared/constants
├── stores/
│   └── userStore.ts        → User plan state + limits cache
└── pages/dashboard/
    └── subscription/
        └── index.vue       → Subscription management page
```

### Database Schema
```sql
-- creem_subscription table (auto-created by Better Auth Creem plugin)
id: text PRIMARY KEY
product_id: text NOT NULL        -- Creem product ID
reference_id: text NOT NULL      -- User ID
creem_customer_id: text
creem_subscription_id: text
creem_order_id: text
status: text                     -- active, canceled, etc.
period_start: timestamp
period_end: timestamp            -- Used for renewal date display
cancel_at_period_end: boolean DEFAULT false

-- user table fields (added by Creem plugin)
creem_customer_id: text          -- Creem customer ID
had_trial: boolean               -- Trial tracking
```

## Configuration

### Environment Variables
```bash
# Creem API
NUXT_CREEM_API_KEY=creem_your_api_key_here
NUXT_CREEM_WEBHOOK_SECRET=whsec_your_creem_webhook_secret_here

# Creem Product IDs (from Creem dashboard)
NUXT_CREEM_PRODUCT_ID_STARTER_MONTH=prod_starter_monthly_id
NUXT_CREEM_PRODUCT_ID_STARTER_YEAR=prod_starter_yearly_id
NUXT_CREEM_PRODUCT_ID_PREMIUM_MONTH=prod_premium_monthly_id
NUXT_CREEM_PRODUCT_ID_PREMIUM_YEAR=prod_premium_yearly_id
NUXT_CREEM_PRODUCT_ID_AGENCY_MONTH=prod_agency_monthly_id
NUXT_CREEM_PRODUCT_ID_AGENCY_YEAR=prod_agency_yearly_id
```

### Creem Dashboard
- **Dashboard**: https://creem.io/dashboard
- **Docs**: https://docs.creem.io

## Frontend Integration

### `useSubscription()` Composable
```typescript
const {
  // State
  subscription,              // Current subscription object (creem_subscription row)
  hasActiveSubscription,     // Boolean: has active sub
  hasAccess,                 // Boolean: access granted by Creem
  currentPlan,               // 'starter' | 'premium' | 'agency'
  isUpdating,                // Loading state

  // Methods
  createCheckoutSession,     // Create Creem checkout (redirects to Creem)
  openCustomerPortal,        // Open Creem portal (upgrade/downgrade/cancel/billing)
  refreshSubscription,       // Re-fetch subscription data
} = useSubscription()
```

### Checkout Flow
```typescript
// Create new subscription
await createCheckoutSession('premium-monthly')
// → Maps slug to productId via runtimeConfig.public
// → Redirects to Creem checkout
// → Success URL: /dashboard/subscription?success=true&plan=premium-monthly
```

### Upgrade/Downgrade/Cancel Flow
```typescript
// Redirect to Creem customer portal
await openCustomerPortal()
// → Creem handles plan changes, cancellation, payment methods, billing history
```

### Subscription Page UI (2026-02-21 redesign)
La pagina subscription ha 5 sezioni:
1. **Current Plan Card** — Icona, nome piano, badge stato, prezzo, data rinnovo (`periodEnd`), bottoni azione
2. **Billing Toggle** — Switch mensile/annuale (sempre visibile)
3. **Pricing Grid** — 3 colonne (Starter/Premium/Agency), Premium evidenziato come "Consigliato"
4. **Contact Footer** — Link per piano personalizzato
5. **Payment + Billing** — Due card con link al portale Creem (solo per utenti con abbonamento attivo):
   - "Metodi di Pagamento" → apre portale Creem
   - "Storico Fatturazione" → apre portale Creem

## Webhook Integration

### Auto-registered Endpoint
```
{APP_URL}/api/auth/creem/webhook
```

### Webhook Handlers (in `server/utils/creem.ts`)
- `onGrantAccess` → Access granted, audit log
- `onRevokeAccess` → Access revoked, audit log
- `onCheckoutCompleted` → Checkout completed, audit log
- `onSubscriptionActive` → Subscription activated, audit log
- `onSubscriptionCanceled` → Subscription canceled, audit log
- `onSubscriptionPaid` → Payment received, audit log

### Automatic Sync
With `persistSubscriptions: true`, the Creem plugin automatically:
1. Creates/updates `creem_subscription` records on webhook events
2. Sets `creemCustomerId` on user records
3. No manual sync endpoints needed

## Audit Logging

All payment events logged to `audit_log`:
```typescript
{
  userId: string,
  category: 'payment',
  action: `creem:${eventType}`,
  targetType: 'creemSubscription',
  targetId: subscriptionId,
  status: 'success'
}
```

Examples:
- `creem:checkout_completed`
- `creem:subscription_active`
- `creem:subscription_canceled`
- `creem:access_granted`

## API Endpoints

### Limit Validation
| Endpoint | Purpose |
|----------|---------|
| `GET /api/limits` | Get plan limits + current usage |
| `POST /api/limits/validate-downgrade` | Validate downgrade safety |

## Setting Up Creem

### Required Products
Create these 6 products in Creem Dashboard:

| Product Name | Type | Billing Cycle |
|--------------|------|---------------|
| Starter Monthly | Subscription | Monthly |
| Starter Yearly | Subscription | Yearly |
| Premium Monthly | Subscription | Monthly |
| Premium Yearly | Subscription | Yearly |
| Agency Monthly | Subscription | Monthly |
| Agency Yearly | Subscription | Yearly |

### Steps
1. Go to https://creem.io/dashboard
2. Navigate to Products
3. Create each subscription product
4. Copy product IDs to env vars
5. Configure webhook secret
6. Set `NUXT_CREEM_API_KEY` and `NUXT_CREEM_WEBHOOK_SECRET`

## Pending Features
- [ ] Usage-based billing
- [ ] Invoice management (currently via Creem portal)
- [ ] Subscription pause/resume

## Related Documentation
- [Pricing Constants](../../shared/constants/pricing.ts)
- [Creem Docs](https://docs.creem.io)
- [Better Auth Creem Plugin](https://docs.creem.io/code/sdks/better-auth)
